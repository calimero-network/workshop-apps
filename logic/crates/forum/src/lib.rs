//! Forum service — posts and replies for the trading pod.

use chat_types::{generate_id, ChatError, PublicKey};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::AuthoredMap;
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Post {
    pub id: String,
    pub author: String,
    pub title: String,
    pub body: String,
    pub post_type: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Reply {
    pub id: String,
    pub post_id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Base58-encode the caller's executor id into a display string.
fn caller_b58() -> Result<String, AppError> {
    PublicKey::from_raw_bytes(&calimero_sdk::env::executor_id())
        .map(|pk| pk.to_base58())
        .map_err(|e| AppError::msg(e.to_string()))
}

/// Map `AuthoredMap` storage errors — `ActionNotAllowed` becomes a
/// domain `Forbidden` so the frontend gets a clear error instead of a
/// raw storage string.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own entries"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Forum state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct ForumState {
    /// Per-author posts: AuthoredMap enforces that only the original author
    /// can edit or delete their own post; peers cannot spoof.
    posts: AuthoredMap<String, Post>,
    /// Per-author replies: same authorship enforcement as posts.
    replies: AuthoredMap<String, Reply>,
}

#[app::logic]
impl ForumState {
    #[app::init]
    pub fn init() -> ForumState {
        ForumState {
            posts: AuthoredMap::new_with_field_name("forum:posts"),
            replies: AuthoredMap::new_with_field_name("forum:replies"),
        }
    }

    // ---- Posts ----

    pub fn create_post(
        &mut self,
        title: String,
        body: String,
        post_type: String,
    ) -> app::Result<String> {
        let author = caller_b58()?;
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        if body.is_empty() {
            app::bail!(ChatError::Invalid("body must not be empty".into()));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("post", now, &nonce);

        let post = Post {
            id: id.clone(),
            author,
            title,
            body,
            post_type,
            created_at: now / 1_000_000,
        };

        self.posts
            .insert(id.clone(), post)
            .map_err(|e| AppError::msg(format!("posts.insert: {e}")))?;

        app::emit!(Event::PostCreated { id: &id });
        Ok(id)
    }

    pub fn edit_post(&mut self, id: String, new_body: String) -> app::Result<()> {
        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("body must not be empty".into()));
        }

        let mut post = self
            .posts
            .get(&id)
            .map_err(|e| AppError::msg(format!("posts.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;

        post.body = new_body;

        // AuthoredMap::update rejects non-authors with ActionNotAllowed.
        self.posts
            .update(&id, post)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::PostEdited { id: &id });
        Ok(())
    }

    pub fn delete_post(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .posts
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::PostDeleted { id: &id });
        Ok(())
    }

    /// Return all posts sorted chronologically by created_at (ascending).
    pub fn list_posts(&self) -> app::Result<Vec<Post>> {
        let mut out: Vec<Post> = self
            .posts
            .entries()
            .map_err(|e| AppError::msg(format!("posts.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(out)
    }

    // ---- Replies ----

    pub fn reply_to_post(&mut self, post_id: String, body: String) -> app::Result<String> {
        let author = caller_b58()?;

        // Verify the parent post exists before creating a reply.
        let post_exists = self
            .posts
            .contains(&post_id)
            .map_err(|e| AppError::msg(format!("posts.contains: {e}")))?;
        if !post_exists {
            app::bail!(ChatError::NotFound(post_id));
        }

        if body.is_empty() {
            app::bail!(ChatError::Invalid("reply body must not be empty".into()));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("reply", now, &nonce);

        let reply = Reply {
            id: id.clone(),
            post_id: post_id.clone(),
            author,
            body,
            created_at: now / 1_000_000,
        };

        self.replies
            .insert(id.clone(), reply)
            .map_err(|e| AppError::msg(format!("replies.insert: {e}")))?;

        app::emit!(Event::ReplyCreated {
            id: &id,
            post_id: &post_id,
        });
        Ok(id)
    }

    pub fn edit_reply(&mut self, id: String, new_body: String) -> app::Result<()> {
        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("body must not be empty".into()));
        }

        let mut reply = self
            .replies
            .get(&id)
            .map_err(|e| AppError::msg(format!("replies.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;

        reply.body = new_body;

        self.replies
            .update(&id, reply)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::ReplyEdited { id: &id });
        Ok(())
    }

    pub fn delete_reply(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .replies
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::ReplyDeleted { id: &id });
        Ok(())
    }

    /// Return all replies for a given post, sorted chronologically.
    pub fn get_replies(&self, post_id: String) -> app::Result<Vec<Reply>> {
        let mut out: Vec<Reply> = self
            .replies
            .entries()
            .map_err(|e| AppError::msg(format!("replies.entries: {e}")))?
            .map(|(_, v)| v)
            .filter(|r| r.post_id == post_id)
            .collect();
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(out)
    }
}
