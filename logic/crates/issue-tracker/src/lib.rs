//! Issue-tracker service — a shared board for the team to create, assign,
//! prioritize, discuss, and organize issues.
//!
//! One crate, three entities sharing one context:
//!
//! - `Category` — shared, `UnorderedMap<String, Category>`. Anyone may create
//!   a category; categories are never edited or deleted by this spec's API.
//! - `Task` — shared, `UnorderedMap<String, Task>`. Anyone may create, assign,
//!   reprioritize, move, complete, or archive any task.
//! - `Comment` — authored, `AuthoredMap<String, Comment>`. Anyone may add a
//!   comment; only its author may edit or delete it (structurally enforced by
//!   `AuthoredMap`).
//!
//! `Category` and `Task` wrap every field in `LwwRegister` and derive
//! `Mergeable` (`#[derive(Mergeable)]` also generates the `RekeyTarget` needed
//! because they nest CRDTs) so concurrent edits to different fields — or the
//! same field from different replicas — converge deterministically.

use calimero_sdk::app;
use calimero_sdk::app::Mergeable;
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;
use team_issue_tracker_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

const VALID_PRIORITIES: [&str; 4] = ["low", "medium", "high", "urgent"];

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A category used to group tasks on the board. `id` and `created_at` are set
/// once at creation and never change; `name` may be edited in the future
/// (hence `LwwRegister`) even though no API method currently exposes a rename.
#[derive(Debug, Clone, Mergeable, calimero_sdk::borsh::BorshSerialize, calimero_sdk::borsh::BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Category {
    pub id: LwwRegister<String>,
    pub name: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped view of a category returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct CategoryView {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

/// A board task. `id`, `author`, and `created_at` are set once at creation;
/// everything else may change concurrently, so every field is a
/// `LwwRegister` and the struct derives `Mergeable`.
#[derive(Debug, Clone, Mergeable, calimero_sdk::borsh::BorshSerialize, calimero_sdk::borsh::BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Task {
    pub id: LwwRegister<String>,
    pub title: LwwRegister<String>,
    pub description: LwwRegister<String>,
    pub assignee: LwwRegister<String>,
    /// One of `VALID_PRIORITIES`.
    pub priority: LwwRegister<String>,
    /// "open" | "completed".
    pub status: LwwRegister<String>,
    /// Archived tasks are hidden from the active board.
    pub archived: LwwRegister<bool>,
    pub category_id: LwwRegister<String>,
    pub author: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped view of a task returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct TaskView {
    pub id: String,
    pub title: String,
    pub description: String,
    pub assignee: String,
    pub priority: String,
    pub status: String,
    pub archived: bool,
    pub category_id: String,
    pub author: String,
    pub created_at: u64,
}

/// A comment (optionally linking a PR) on a task. Stored in an `AuthoredMap`
/// so only the author may `edit_comment` / `delete_comment` — structurally
/// enforced by the storage layer, not a manual key check.
#[derive(Debug, Clone, Mergeable, calimero_sdk::borsh::BorshSerialize, calimero_sdk::borsh::BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Comment {
    pub id: LwwRegister<String>,
    pub task_id: LwwRegister<String>,
    pub author: LwwRegister<String>,
    pub body: LwwRegister<String>,
    pub pr_link: LwwRegister<Option<String>>,
    pub created_at: LwwRegister<u64>,
    pub updated_at: LwwRegister<u64>,
}

/// Read-shaped view of a comment returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct CommentView {
    pub id: String,
    pub task_id: String,
    pub author: String,
    pub body: String,
    pub pr_link: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself (SDK 0.11+); a manual
// derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct IssueTracker {
    categories: UnorderedMap<String, Category>,
    tasks: UnorderedMap<String, Task>,
    comments: AuthoredMap<String, Comment>,
}

#[app::logic]
impl IssueTracker {
    #[app::init]
    pub fn init() -> IssueTracker {
        IssueTracker {
            categories: UnorderedMap::new_with_field_name("issue_tracker:categories"),
            tasks: UnorderedMap::new_with_field_name("issue_tracker:tasks"),
            comments: AuthoredMap::new_with_field_name("issue_tracker:comments"),
        }
    }

    // ---- Categories ----

    pub fn create_category(&mut self, name: String) -> app::Result<String> {
        validate_label(&name).map_err(AppError::from)?;

        let now = storage_env::time_now();
        let id = new_id("cat", now);

        let category = Category {
            id: LwwRegister::new(id.clone()),
            name: LwwRegister::new(name.clone()),
            created_at: LwwRegister::new(now),
        };
        self.categories
            .insert(id.clone(), category)
            .map_err(|e| AppError::msg(format!("categories.insert: {e}")))?;

        app::emit!(Event::CategoryCreated {
            id: &id,
            name: &name,
        });
        Ok(id)
    }

    pub fn list_categories(&self) -> app::Result<Vec<CategoryView>> {
        let mut out: Vec<CategoryView> = self
            .categories
            .entries()
            .map_err(|e| AppError::msg(format!("categories.entries: {e}")))?
            .map(|(_, c)| to_category_view(&c))
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Tasks ----

    pub fn create_task(
        &mut self,
        title: String,
        description: String,
        category_id: String,
        assignee: String,
    ) -> app::Result<String> {
        validate_label(&title).map_err(AppError::from)?;
        require_non_empty("description", &description)?;
        require_non_empty("assignee", &assignee)?;
        self.require_category(&category_id)?;

        let now = storage_env::time_now();
        let id = new_id("task", now);
        let author = caller_b58();

        let task = Task {
            id: LwwRegister::new(id.clone()),
            title: LwwRegister::new(title.clone()),
            description: LwwRegister::new(description),
            assignee: LwwRegister::new(assignee.clone()),
            priority: LwwRegister::new("medium".to_string()),
            status: LwwRegister::new("open".to_string()),
            archived: LwwRegister::new(false),
            category_id: LwwRegister::new(category_id),
            author: LwwRegister::new(author),
            created_at: LwwRegister::new(now),
        };
        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated {
            id: &id,
            title: &title,
            assignee: &assignee,
        });
        Ok(id)
    }

    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        require_non_empty("assignee", &assignee)?;
        let mut guard = self
            .tasks
            .get_mut(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(task_id.clone())))?;
        guard.assignee.set(assignee.clone());
        drop(guard);

        app::emit!(Event::TaskAssigned {
            id: &task_id,
            assignee: &assignee,
        });
        Ok(())
    }

    pub fn set_priority(&mut self, task_id: String, priority: String) -> app::Result<()> {
        if !VALID_PRIORITIES.contains(&priority.as_str()) {
            return Err(AppError::from(Error::Invalid(format!(
                "priority must be one of {VALID_PRIORITIES:?}"
            ))));
        }
        let mut guard = self
            .tasks
            .get_mut(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(task_id.clone())))?;
        guard.priority.set(priority.clone());
        drop(guard);

        app::emit!(Event::TaskPriorityChanged {
            id: &task_id,
            priority: &priority,
        });
        Ok(())
    }

    pub fn move_task(&mut self, task_id: String, category_id: String) -> app::Result<()> {
        self.require_category(&category_id)?;

        let mut guard = self
            .tasks
            .get_mut(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(task_id.clone())))?;
        guard.category_id.set(category_id.clone());
        drop(guard);

        app::emit!(Event::TaskMoved {
            id: &task_id,
            category_id: &category_id,
        });
        Ok(())
    }

    pub fn complete_task(&mut self, task_id: String) -> app::Result<()> {
        let mut guard = self
            .tasks
            .get_mut(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(task_id.clone())))?;
        guard.status.set("completed".to_string());
        drop(guard);

        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    pub fn archive_task(&mut self, task_id: String) -> app::Result<()> {
        let mut guard = self
            .tasks
            .get_mut(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(task_id.clone())))?;
        guard.archived.set(true);
        drop(guard);

        app::emit!(Event::TaskArchived { id: &task_id });
        Ok(())
    }

    /// List tasks. `include_archived = false` returns only the active board
    /// (non-archived) tasks; `true` returns every task.
    pub fn list_tasks(&self, include_archived: bool) -> app::Result<Vec<TaskView>> {
        let mut out: Vec<TaskView> = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?
            .map(|(_, t)| to_task_view(&t))
            .filter(|t| include_archived || !t.archived)
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Comments ----

    pub fn add_comment(
        &mut self,
        task_id: String,
        body: String,
        pr_link: Option<String>,
    ) -> app::Result<String> {
        require_non_empty("body", &body)?;
        if !self
            .tasks
            .contains(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.contains: {e}")))?
        {
            return Err(AppError::from(Error::NotFound(task_id)));
        }

        let now = storage_env::time_now();
        let id = new_id("cmt", now);
        let author = caller_b58();

        let comment = Comment {
            id: LwwRegister::new(id.clone()),
            task_id: LwwRegister::new(task_id.clone()),
            author: LwwRegister::new(author),
            body: LwwRegister::new(body),
            pr_link: LwwRegister::new(pr_link),
            created_at: LwwRegister::new(now),
            updated_at: LwwRegister::new(now),
        };
        self.comments
            .insert(id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentAdded {
            id: &id,
            task_id: &task_id,
        });
        Ok(id)
    }

    /// Edit a comment's body. Rejected unless the caller is the comment's
    /// author (structurally enforced by `AuthoredMap::update`).
    pub fn edit_comment(&mut self, comment_id: String, body: String) -> app::Result<()> {
        require_non_empty("body", &body)?;
        let mut comment = self
            .comments
            .get(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(comment_id.clone())))?;

        comment.body.set(body);
        comment.updated_at.set(storage_env::time_now());
        self.comments
            .update(&comment_id, comment)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::CommentEdited { id: &comment_id });
        Ok(())
    }

    /// Delete a comment. Rejected unless the caller is the comment's author
    /// (structurally enforced by `AuthoredMap::remove`).
    pub fn delete_comment(&mut self, comment_id: String) -> app::Result<()> {
        let removed = self
            .comments
            .remove(&comment_id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(comment_id));
        }

        app::emit!(Event::CommentDeleted { id: &comment_id });
        Ok(())
    }

    /// List all comments on a task, oldest first.
    pub fn list_comments(&self, task_id: String) -> app::Result<Vec<CommentView>> {
        let mut out: Vec<CommentView> = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?
            .map(|(_, c)| to_comment_view(&c))
            .filter(|c| c.task_id == task_id)
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }
}

impl IssueTracker {
    fn require_category(&self, category_id: &str) -> app::Result<()> {
        let exists = self
            .categories
            .contains(category_id)
            .map_err(|e| AppError::msg(format!("categories.contains: {e}")))?;
        if !exists {
            return Err(AppError::from(Error::NotFound(category_id.to_string())));
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Base58 of the current executor — the public, shareable identity used to
/// stamp `Task::author` / `Comment::author`.
fn caller_b58() -> String {
    bs58::encode(env::executor_id()).into_string()
}

/// Generate an id from a prefix, the current time, and a random nonce.
fn new_id(prefix: &str, now: u64) -> String {
    let mut nonce = [0u8; 4];
    env::random_bytes(&mut nonce);
    generate_id(prefix, now, &nonce)
}

fn require_non_empty(field: &str, value: &str) -> app::Result<()> {
    if value.trim().is_empty() {
        return Err(AppError::from(Error::Invalid(format!(
            "{field} must not be empty"
        ))));
    }
    Ok(())
}

fn to_category_view(c: &Category) -> CategoryView {
    CategoryView {
        id: c.id.get().clone(),
        name: c.name.get().clone(),
        created_at: *c.created_at.get(),
    }
}

fn to_task_view(t: &Task) -> TaskView {
    TaskView {
        id: t.id.get().clone(),
        title: t.title.get().clone(),
        description: t.description.get().clone(),
        assignee: t.assignee.get().clone(),
        priority: t.priority.get().clone(),
        status: t.status.get().clone(),
        archived: *t.archived.get(),
        category_id: t.category_id.get().clone(),
        author: t.author.get().clone(),
        created_at: *t.created_at.get(),
    }
}

fn to_comment_view(c: &Comment) -> CommentView {
    CommentView {
        id: c.id.get().clone(),
        task_id: c.task_id.get().clone(),
        author: c.author.get().clone(),
        body: c.body.get().clone(),
        pr_link: c.pr_link.get().clone(),
        created_at: *c.created_at.get(),
        updated_at: *c.updated_at.get(),
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} comments you authored"
            )))
        } else {
            AppError::msg(format!("comments.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    fn seed_category(app: &mut TestHost<IssueTracker>) -> String {
        app.call(|s| s.create_category("Backend".into())).unwrap()
    }

    fn seed_task(app: &mut TestHost<IssueTracker>, category_id: &str) -> String {
        app.call(|s| {
            s.create_task(
                "Fix login bug".into(),
                "Users can't log in on Safari".into(),
                category_id.into(),
                "alice".into(),
            )
        })
        .unwrap()
    }

    #[test]
    fn create_category_and_list() {
        let mut app = TestHost::new(IssueTracker::init);

        let id = seed_category(&mut app);
        let cats = app.view(|s| s.list_categories()).unwrap();
        assert_eq!(cats.len(), 1);
        assert_eq!(cats[0].id, id);
        assert_eq!(cats[0].name, "Backend");
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn create_task_requires_known_category() {
        let mut app = TestHost::new(IssueTracker::init);
        assert!(app
            .call(|s| s.create_task(
                "Task".into(),
                "desc".into(),
                "nope".into(),
                "alice".into()
            ))
            .is_err());
    }

    #[test]
    fn create_task_and_list_active_board() {
        let mut app = TestHost::new(IssueTracker::init);

        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        let tasks = app.view(|s| s.list_tasks(false)).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, task_id);
        assert_eq!(tasks[0].assignee, "alice");
        assert_eq!(tasks[0].priority, "medium");
        assert_eq!(tasks[0].status, "open");
        assert!(!tasks[0].archived);
        assert_eq!(tasks[0].category_id, cat);
    }

    #[test]
    fn assign_task_changes_assignee() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        app.call(|s| s.assign_task(task_id.clone(), "bob".into()))
            .unwrap();

        let tasks = app.view(|s| s.list_tasks(false)).unwrap();
        assert_eq!(tasks[0].assignee, "bob");
    }

    #[test]
    fn set_priority_validates_value() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        assert!(app
            .call(|s| s.set_priority(task_id.clone(), "urgent".into()))
            .is_ok());
        assert_eq!(
            app.view(|s| s.list_tasks(false)).unwrap()[0].priority,
            "urgent"
        );
        assert!(app
            .call(|s| s.set_priority(task_id.clone(), "whenever".into()))
            .is_err());
    }

    #[test]
    fn move_task_requires_known_category() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        assert!(app
            .call(|s| s.move_task(task_id.clone(), "missing".into()))
            .is_err());

        let other_cat = app.call(|s| s.create_category("Frontend".into())).unwrap();
        app.call(|s| s.move_task(task_id.clone(), other_cat.clone()))
            .unwrap();
        assert_eq!(
            app.view(|s| s.list_tasks(false)).unwrap()[0].category_id,
            other_cat
        );
    }

    #[test]
    fn complete_then_archive_moves_off_active_board() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        app.call(|s| s.complete_task(task_id.clone())).unwrap();
        assert_eq!(
            app.view(|s| s.list_tasks(false)).unwrap()[0].status,
            "completed"
        );

        app.call(|s| s.archive_task(task_id.clone())).unwrap();
        assert_eq!(app.view(|s| s.list_tasks(false)).unwrap().len(), 0);
        assert_eq!(app.view(|s| s.list_tasks(true)).unwrap().len(), 1);
    }

    #[test]
    fn add_comment_requires_known_task() {
        let mut app = TestHost::new(IssueTracker::init);
        assert!(app
            .call(|s| s.add_comment("nope".into(), "hi".into(), None))
            .is_err());
    }

    #[test]
    fn add_and_list_comments_with_pr_link() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);

        let comment_id = app
            .call(|s| {
                s.add_comment(
                    task_id.clone(),
                    "Fixed in PR".into(),
                    Some("https://github.com/org/repo/pull/42".into()),
                )
            })
            .unwrap();

        let comments = app.view(|s| s.list_comments(task_id)).unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, comment_id);
        assert_eq!(comments[0].body, "Fixed in PR");
        assert_eq!(
            comments[0].pr_link.as_deref(),
            Some("https://github.com/org/repo/pull/42")
        );
    }

    #[test]
    fn author_can_edit_and_delete_own_comment() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);
        let comment_id = app
            .call(|s| s.add_comment(task_id.clone(), "first draft".into(), None))
            .unwrap();

        app.call(|s| s.edit_comment(comment_id.clone(), "revised".into()))
            .unwrap();
        assert_eq!(
            app.view(|s| s.list_comments(task_id.clone())).unwrap()[0].body,
            "revised"
        );

        app.call(|s| s.delete_comment(comment_id)).unwrap();
        assert_eq!(app.view(|s| s.list_comments(task_id)).unwrap().len(), 0);
    }

    #[test]
    fn non_author_cannot_edit_or_delete_comment() {
        let mut app = TestHost::new(IssueTracker::init);
        let cat = seed_category(&mut app);
        let task_id = seed_task(&mut app, &cat);
        let comment_id = app
            .call(|s| s.add_comment(task_id.clone(), "first draft".into(), None))
            .unwrap();

        let other = [7u8; 32];
        assert!(app
            .call_as(other, |s| s.edit_comment(comment_id.clone(), "hijack".into()))
            .is_err());
        assert!(app
            .call_as(other, |s| s.delete_comment(comment_id.clone()))
            .is_err());

        // The comment survives both rejected attempts, unchanged.
        let comments = app.view(|s| s.list_comments(task_id)).unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].body, "first draft");
    }
}
