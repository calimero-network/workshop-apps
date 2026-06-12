//! Community service — per-community posts, comments, votes, and moderation.

use std::collections::BTreeSet;

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{LwwRegister, Mergeable, SharedStorage, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

/// Maximum post title length in characters.
const MAX_TITLE_LEN: usize = 300;
/// Maximum post/comment body length in characters.
const MAX_BODY_LEN: usize = 10000;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Community metadata, governed by the founder via SharedStorage.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct CommunityMeta {
    pub id: String,
    pub name: String,
    pub topic: String,
    pub lobby_context_id: Option<String>,
}

/// A moderator record.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Moderator {
    pub id: String,
    pub member_id: String,
    pub appointed_at: u64,
}

impl Mergeable for Moderator {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Keep the later appointment
        if other.appointed_at > self.appointed_at {
            *self = other.clone();
        }
        Ok(())
    }
}

/// A forum post.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Post {
    pub id: String,
    pub author: String,
    pub title: String,
    pub body: String,
    pub vote_score: i64,
    pub comment_count: u64,
    pub created_at: u64,
}

impl Mergeable for Post {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // For vote_score, keep the larger absolute change (max wins)
        if other.vote_score > self.vote_score {
            self.vote_score = other.vote_score;
        }
        // Monotonic for comment_count
        if other.comment_count > self.comment_count {
            self.comment_count = other.comment_count;
        }
        // For title/body edits, keep newer (lexicographic tiebreak for commutativity)
        if other.created_at == self.created_at && other.title > self.title {
            self.title = other.title.clone();
            self.body = other.body.clone();
        }
        Ok(())
    }
}

/// A comment on a post.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub post_id: String,
    pub parent_comment_id: Option<String>,
    pub author: String,
    pub body: String,
    pub vote_score: i64,
    pub created_at: u64,
}

impl Mergeable for Comment {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.vote_score > self.vote_score {
            self.vote_score = other.vote_score;
        }
        // For body edits, keep the lexicographically larger body for commutativity
        if other.created_at == self.created_at && other.body > self.body {
            self.body = other.body.clone();
        }
        Ok(())
    }
}

/// A vote on a post or comment. Keyed by `{author}-{target_id}`.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Vote {
    pub id: String,
    pub target_id: String,
    pub target_type: String,
    pub author: String,
    pub value: i8,
}

impl Mergeable for Vote {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last value wins — only the author changes their own vote
        if other.value != self.value {
            self.value = other.value;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn caller_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

/// Translate SharedStorage errors into domain errors.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not the community founder"
            )))
        } else {
            AppError::msg(format!("metadata.{action}: {s}"))
        }
    }
}

fn now_ms() -> u64 {
    storage_env::time_now() / 1_000_000
}

fn gen_id(prefix: &str) -> String {
    let now = storage_env::time_now();
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    generate_id(prefix, now, &nonce)
}

// ---------------------------------------------------------------------------
// Community state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct CommunityState {
    // Governed metadata: only the founder (initial writer) can update name/topic.
    metadata: SharedStorage<LwwRegister<CommunityMeta>>,
    // Moderator records — managed by founder (manual check).
    moderators: UnorderedMap<String, Moderator>,
    // Posts — UnorderedMap so both authors and moderators can remove.
    posts: UnorderedMap<String, Post>,
    // Comments — same reasoning as posts.
    comments: UnorderedMap<String, Comment>,
    // Votes — keyed by "{author}-{target_id}" so each member gets one vote per target.
    votes: UnorderedMap<String, Vote>,
}

#[app::logic]
impl CommunityState {
    #[app::init]
    pub fn init(community_id: String, name: String, topic: String, lobby_context_id: Option<String>) -> CommunityState {
        let creator: PublicKey = calimero_sdk::env::executor_id().into();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        let mut metadata =
            SharedStorage::new_with_field_name("community:metadata", writers, false);

        let initial = CommunityMeta {
            id: community_id,
            name,
            topic,
            lobby_context_id,
        };
        let _ = metadata.insert(LwwRegister::new(initial));

        CommunityState {
            metadata,
            moderators: UnorderedMap::new_with_field_name("community:moderators"),
            posts: UnorderedMap::new_with_field_name("community:posts"),
            comments: UnorderedMap::new_with_field_name("community:comments"),
            votes: UnorderedMap::new_with_field_name("community:votes"),
        }
    }

    // ---- Posts ----

    pub fn create_post(&mut self, title: String, body: String) -> app::Result<String> {
        let author = caller_b58();

        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let title: String = title.chars().take(MAX_TITLE_LEN).collect();
        if body.is_empty() {
            app::bail!(ChatError::Invalid("body must not be empty".into()));
        }
        let body: String = body.chars().take(MAX_BODY_LEN).collect();

        let post_id = gen_id("post");

        let post = Post {
            id: post_id.clone(),
            author: author.clone(),
            title,
            body,
            vote_score: 0,
            comment_count: 0,
            created_at: now_ms(),
        };

        self.posts
            .insert(post_id.clone(), post)
            .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;

        app::emit!(Event::PostCreated {
            id: &post_id,
            author: &author,
        });
        Ok(post_id)
    }

    pub fn get_posts(&self) -> app::Result<Vec<Post>> {
        let entries = self
            .posts
            .entries()
            .map_err(|e| AppError::msg(format!("posts.entries: {e}")))?;
        let mut out: Vec<Post> = entries.map(|(_, v)| v).collect();
        // Sort by created_at descending (newest first)
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
        Ok(out)
    }

    pub fn edit_post(&mut self, post_id: String, new_title: String, new_body: String) -> app::Result<()> {
        let caller = caller_b58();

        let mut post = self
            .posts
            .get(&post_id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(post_id.clone())))?
            .clone();

        if post.author != caller {
            app::bail!(ChatError::Forbidden(
                "can only edit your own posts".into()
            ));
        }

        if new_title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }

        post.title = new_title.chars().take(MAX_TITLE_LEN).collect();
        post.body = new_body.chars().take(MAX_BODY_LEN).collect();

        self.posts
            .insert(post_id.clone(), post)
            .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;

        app::emit!(Event::PostEdited { id: &post_id });
        Ok(())
    }

    pub fn delete_post(&mut self, post_id: String) -> app::Result<()> {
        let caller = caller_b58();

        let post = self
            .posts
            .get(&post_id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(post_id.clone())))?;

        if post.author != caller {
            app::bail!(ChatError::Forbidden(
                "can only delete your own posts".into()
            ));
        }
        drop(post);

        self.posts
            .remove(&post_id)
            .map_err(|e| AppError::msg(format!("posts.remove: {e}")))?;

        app::emit!(Event::PostDeleted { id: &post_id });
        Ok(())
    }

    // ---- Comments ----

    pub fn create_comment(
        &mut self,
        post_id: String,
        body: String,
        parent_comment_id: Option<String>,
    ) -> app::Result<String> {
        let author = caller_b58();

        // Verify the post exists
        let post_exists = self
            .posts
            .contains(&post_id)
            .map_err(|e| AppError::msg(format!("posts.contains: {e}")))?;
        if !post_exists {
            app::bail!(ChatError::NotFound(format!("post {post_id}")));
        }

        if body.is_empty() {
            app::bail!(ChatError::Invalid("comment body must not be empty".into()));
        }
        let body: String = body.chars().take(MAX_BODY_LEN).collect();

        // Verify parent comment if provided
        if let Some(ref parent_id) = parent_comment_id {
            let parent_exists = self
                .comments
                .contains(parent_id)
                .map_err(|e| AppError::msg(format!("comments.contains: {e}")))?;
            if !parent_exists {
                app::bail!(ChatError::NotFound(format!("parent comment {parent_id}")));
            }
        }

        let comment_id = gen_id("cmt");

        let comment = Comment {
            id: comment_id.clone(),
            post_id: post_id.clone(),
            parent_comment_id,
            author,
            body,
            vote_score: 0,
            created_at: now_ms(),
        };

        self.comments
            .insert(comment_id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        // Increment comment_count on the post
        if let Some(mut post) = self
            .posts
            .get(&post_id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .map(|p| p.clone())
        {
            post.comment_count = post.comment_count.saturating_add(1);
            self.posts
                .insert(post_id.clone(), post)
                .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;
        }

        app::emit!(Event::CommentCreated {
            id: &comment_id,
            post_id: &post_id,
        });
        Ok(comment_id)
    }

    pub fn get_comments(&self, post_id: String) -> app::Result<Vec<Comment>> {
        let entries = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?;
        let mut out: Vec<Comment> = entries
            .map(|(_, v)| v)
            .filter(|c| c.post_id == post_id)
            .collect();
        // Sort by created_at ascending (oldest first for threads)
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    pub fn edit_comment(&mut self, comment_id: String, new_body: String) -> app::Result<()> {
        let caller = caller_b58();

        let mut comment = self
            .comments
            .get(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(comment_id.clone())))?
            .clone();

        if comment.author != caller {
            app::bail!(ChatError::Forbidden(
                "can only edit your own comments".into()
            ));
        }

        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("comment body must not be empty".into()));
        }

        comment.body = new_body.chars().take(MAX_BODY_LEN).collect();

        self.comments
            .insert(comment_id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentEdited { id: &comment_id });
        Ok(())
    }

    pub fn delete_comment(&mut self, comment_id: String) -> app::Result<()> {
        let caller = caller_b58();

        let comment = self
            .comments
            .get(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(comment_id.clone())))?;

        if comment.author != caller {
            app::bail!(ChatError::Forbidden(
                "can only delete your own comments".into()
            ));
        }
        let post_id = comment.post_id.clone();
        drop(comment);

        self.comments
            .remove(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.remove: {e}")))?;

        // Decrement comment_count on the post
        self.decrement_comment_count(&post_id)?;

        app::emit!(Event::CommentDeleted { id: &comment_id });
        Ok(())
    }

    // ---- Voting ----

    pub fn cast_vote(&mut self, target_id: String, target_type: String, value: i8) -> app::Result<()> {
        let caller = caller_b58();

        if target_type != "post" && target_type != "comment" {
            app::bail!(ChatError::Invalid(
                "target_type must be 'post' or 'comment'".into()
            ));
        }
        if value != 1 && value != -1 && value != 0 {
            app::bail!(ChatError::Invalid(
                "vote value must be -1, 0, or 1".into()
            ));
        }

        // Verify target exists
        if target_type == "post" {
            let exists = self
                .posts
                .contains(&target_id)
                .map_err(|e| AppError::msg(format!("posts.contains: {e}")))?;
            if !exists {
                app::bail!(ChatError::NotFound(format!("post {target_id}")));
            }
        } else {
            let exists = self
                .comments
                .contains(&target_id)
                .map_err(|e| AppError::msg(format!("comments.contains: {e}")))?;
            if !exists {
                app::bail!(ChatError::NotFound(format!("comment {target_id}")));
            }
        }

        let vote_key = format!("{caller}-{target_id}");

        // Check for existing vote to compute score delta
        let old_value: i8 = self
            .votes
            .get(&vote_key)
            .map_err(|e| AppError::msg(format!("votes.get: {e}")))?
            .map(|v| v.value)
            .unwrap_or(0);

        let delta = (value as i64) - (old_value as i64);

        let vote = Vote {
            id: vote_key.clone(),
            target_id: target_id.clone(),
            target_type: target_type.clone(),
            author: caller,
            value,
        };

        self.votes
            .insert(vote_key, vote)
            .map_err(|e| AppError::msg(format!("votes.insert: {e}")))?;

        // Update vote_score on the target
        if delta != 0 {
            if target_type == "post" {
                self.update_post_score(&target_id, delta)?;
            } else {
                self.update_comment_score(&target_id, delta)?;
            }
        }

        app::emit!(Event::VoteCast {
            target_id: &target_id,
            target_type: &target_type,
        });
        Ok(())
    }

    // ---- Moderation ----

    /// Appoint a moderator. Only the founder (SharedStorage writer) can do this.
    pub fn appoint_moderator(&mut self, member_id: String) -> app::Result<String> {
        self.require_founder("appoint_moderator")?;

        if member_id.is_empty() {
            app::bail!(ChatError::Invalid("member_id must not be empty".into()));
        }

        // Check if already a moderator
        let entries = self
            .moderators
            .entries()
            .map_err(|e| AppError::msg(format!("moderators.entries: {e}")))?;
        for (_, mod_entry) in entries {
            if mod_entry.member_id == member_id {
                app::bail!(ChatError::Invalid(
                    "member is already a moderator".into()
                ));
            }
        }

        let mod_id = gen_id("mod");
        let moderator = Moderator {
            id: mod_id.clone(),
            member_id: member_id.clone(),
            appointed_at: now_ms(),
        };

        self.moderators
            .insert(mod_id.clone(), moderator)
            .map_err(|e| AppError::msg(format!("moderators.insert: {e}")))?;

        app::emit!(Event::ModeratorAppointed {
            id: &mod_id,
            member_id: &member_id,
        });
        Ok(mod_id)
    }

    /// Revoke a moderator. Only the founder can do this.
    pub fn revoke_moderator(&mut self, moderator_id: String) -> app::Result<()> {
        self.require_founder("revoke_moderator")?;

        let exists = self
            .moderators
            .contains(&moderator_id)
            .map_err(|e| AppError::msg(format!("moderators.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(moderator_id));
        }

        self.moderators
            .remove(&moderator_id)
            .map_err(|e| AppError::msg(format!("moderators.remove: {e}")))?;

        app::emit!(Event::ModeratorRevoked { id: &moderator_id });
        Ok(())
    }

    /// List all moderators.
    pub fn get_moderators(&self) -> app::Result<Vec<Moderator>> {
        let entries = self
            .moderators
            .entries()
            .map_err(|e| AppError::msg(format!("moderators.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Remove a post as a moderator or founder.
    pub fn moderate_remove_post(&mut self, post_id: String) -> app::Result<()> {
        self.require_founder_or_moderator("moderate_remove_post")?;

        let exists = self
            .posts
            .contains(&post_id)
            .map_err(|e| AppError::msg(format!("posts.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(post_id));
        }

        self.posts
            .remove(&post_id)
            .map_err(|e| AppError::msg(format!("posts.remove: {e}")))?;

        app::emit!(Event::PostModerated { id: &post_id });
        Ok(())
    }

    /// Remove a comment as a moderator or founder.
    pub fn moderate_remove_comment(&mut self, comment_id: String) -> app::Result<()> {
        self.require_founder_or_moderator("moderate_remove_comment")?;

        let comment = self
            .comments
            .get(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(comment_id.clone())))?;

        let post_id = comment.post_id.clone();
        drop(comment);

        self.comments
            .remove(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.remove: {e}")))?;

        // Decrement comment_count
        self.decrement_comment_count(&post_id)?;

        app::emit!(Event::CommentModerated { id: &comment_id });
        Ok(())
    }

    /// Rename the community. Only the founder can do this.
    pub fn rename_community(&mut self, new_name: String, new_topic: String) -> app::Result<()> {
        if new_name.is_empty() || new_name.chars().count() > 64 {
            app::bail!(ChatError::Invalid(
                "community name must be 1-64 characters".into()
            ));
        }
        if new_topic.chars().count() > 256 {
            app::bail!(ChatError::Invalid(
                "topic must be at most 256 characters".into()
            ));
        }

        let mut meta = self.read_metadata()?;
        meta.name = new_name.chars().take(64).collect();
        meta.topic = new_topic.chars().take(256).collect();
        self.write_metadata("rename", meta)?;

        app::emit!(Event::CommunityRenamed {});
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl CommunityState {
    fn read_metadata(&self) -> app::Result<CommunityMeta> {
        Ok(self
            .metadata
            .get()
            .map_err(|e| AppError::msg(format!("metadata.get: {e}")))?
            .get()
            .clone())
    }

    fn write_metadata(&mut self, action: &'static str, meta: CommunityMeta) -> app::Result<()> {
        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error(action))?;
        Ok(())
    }

    /// Check that the caller is the founder (in the SharedStorage writer set).
    fn require_founder(&self, action: &'static str) -> app::Result<()> {
        let executor = executor_pubkey();
        if !self.metadata.writers().contains(&executor) {
            app::bail!(ChatError::Forbidden(format!(
                "{action}: caller is not the community founder"
            )));
        }
        Ok(())
    }

    /// Check that the caller is the founder OR an appointed moderator.
    fn require_founder_or_moderator(&self, action: &'static str) -> app::Result<()> {
        let executor = executor_pubkey();
        // Founder check
        if self.metadata.writers().contains(&executor) {
            return Ok(());
        }
        // Moderator check
        let caller = caller_b58();
        let entries = self
            .moderators
            .entries()
            .map_err(|e| AppError::msg(format!("moderators.entries: {e}")))?;
        for (_, mod_entry) in entries {
            if mod_entry.member_id == caller {
                return Ok(());
            }
        }
        app::bail!(ChatError::Forbidden(format!(
            "{action}: caller is not a founder or moderator"
        )));
    }

    fn update_post_score(&mut self, post_id: &str, delta: i64) -> app::Result<()> {
        if let Some(mut post) = self
            .posts
            .get(post_id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .map(|p| p.clone())
        {
            post.vote_score = post.vote_score.saturating_add(delta);
            self.posts
                .insert(post_id.to_string(), post)
                .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;
        }
        Ok(())
    }

    fn update_comment_score(&mut self, comment_id: &str, delta: i64) -> app::Result<()> {
        if let Some(mut comment) = self
            .comments
            .get(comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .map(|c| c.clone())
        {
            comment.vote_score = comment.vote_score.saturating_add(delta);
            self.comments
                .insert(comment_id.to_string(), comment)
                .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;
        }
        Ok(())
    }

    fn decrement_comment_count(&mut self, post_id: &str) -> app::Result<()> {
        if let Some(mut post) = self
            .posts
            .get(post_id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .map(|p| p.clone())
        {
            post.comment_count = post.comment_count.saturating_sub(1);
            self.posts
                .insert(post_id.to_string(), post)
                .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;
        }
        Ok(())
    }
}
