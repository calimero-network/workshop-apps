//! Whiteboard service — shared infinite canvas with shapes, text, comments, and cursor tracking.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, StoreError};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

fn map_authored_error(action: &'static str) -> impl FnOnce(StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::msg(format!("forbidden: can only {action} your own entries"))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Shape {
    pub id: String,
    pub author: String,
    pub shape_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: String,
    /// Milliseconds since epoch (time_now() / 1_000_000).
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TextElement {
    pub id: String,
    pub author: String,
    pub content: String,
    pub x: f64,
    pub y: f64,
    pub font_size: u32,
    pub color: String,
    /// Milliseconds since epoch (time_now() / 1_000_000).
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub target_id: String,
    pub body: String,
    /// Milliseconds since epoch (time_now() / 1_000_000).
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Cursor {
    pub user_id: String,
    pub x: f64,
    pub y: f64,
    /// Milliseconds since epoch (time_now() / 1_000_000).
    pub last_updated_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct WhiteboardState {
    /// Timestamp (ms) of the last canvas clear. Shapes/text/comments with
    /// created_at < cleared_at_ms are hidden by all query methods, giving a
    /// CRDT-safe "clear" that doesn't require removing authored entries.
    cleared_at_ms: LwwRegister<u64>,
    shapes: AuthoredMap<String, Shape>,
    texts: AuthoredMap<String, TextElement>,
    comments: AuthoredMap<String, Comment>,
    /// Keyed by caller pubkey (base58); each user owns only their own entry.
    cursors: AuthoredMap<String, Cursor>,
}

#[app::logic]
impl WhiteboardState {
    #[app::init]
    pub fn init() -> WhiteboardState {
        WhiteboardState {
            cleared_at_ms: LwwRegister::new(0u64),
            shapes: AuthoredMap::new_with_field_name("whiteboard:shapes"),
            texts: AuthoredMap::new_with_field_name("whiteboard:texts"),
            comments: AuthoredMap::new_with_field_name("whiteboard:comments"),
            cursors: AuthoredMap::new_with_field_name("whiteboard:cursors"),
        }
    }

    // -----------------------------------------------------------------------
    // Shape methods
    // -----------------------------------------------------------------------

    pub fn add_shape(
        &mut self,
        shape_type: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        color: String,
    ) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;
        let id = format!("shape-{now_ns}");

        let shape = Shape {
            id: id.clone(),
            author: caller,
            shape_type,
            x,
            y,
            width,
            height,
            color,
            created_at: now_ms,
        };

        self.shapes
            .insert(id.clone(), shape)
            .map_err(|e| AppError::msg(format!("shapes.insert: {e}")))?;

        app::emit!(Event::ShapeAdded { id: &id });
        Ok(id)
    }

    pub fn update_shape_position(
        &mut self,
        shape_id: String,
        x: f64,
        y: f64,
    ) -> app::Result<()> {
        let mut shape = self
            .shapes
            .get(&shape_id)
            .map_err(|e| AppError::msg(format!("shapes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("shape not found: {shape_id}")))?;

        shape.x = x;
        shape.y = y;

        self.shapes
            .update(&shape_id, shape)
            .map_err(map_authored_error("update shape position"))?;

        app::emit!(Event::ShapePositionUpdated { id: &shape_id });
        Ok(())
    }

    pub fn delete_shape(&mut self, shape_id: String) -> app::Result<()> {
        let exists = self
            .shapes
            .contains(&shape_id)
            .map_err(|e| AppError::msg(format!("shapes.contains: {e}")))?;
        if !exists {
            app::bail!("shape not found: {shape_id}");
        }

        self.shapes
            .remove(&shape_id)
            .map_err(map_authored_error("delete shape"))?;

        app::emit!(Event::ShapeDeleted { id: &shape_id });
        Ok(())
    }

    pub fn get_all_shapes(&self) -> app::Result<Vec<Shape>> {
        let cleared = *self.cleared_at_ms.get();
        let entries = self
            .shapes
            .entries()
            .map_err(|e| AppError::msg(format!("shapes.entries: {e}")))?;
        Ok(entries
            .map(|(_, v)| v)
            .filter(|s| s.created_at >= cleared)
            .collect())
    }

    // -----------------------------------------------------------------------
    // Text methods
    // -----------------------------------------------------------------------

    pub fn add_text(
        &mut self,
        content: String,
        x: f64,
        y: f64,
        font_size: u32,
        color: String,
    ) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;
        let id = format!("text-{now_ns}");

        let text = TextElement {
            id: id.clone(),
            author: caller,
            content,
            x,
            y,
            font_size,
            color,
            created_at: now_ms,
        };

        self.texts
            .insert(id.clone(), text)
            .map_err(|e| AppError::msg(format!("texts.insert: {e}")))?;

        app::emit!(Event::TextAdded { id: &id });
        Ok(id)
    }

    pub fn update_text(&mut self, text_id: String, content: String) -> app::Result<()> {
        let mut text = self
            .texts
            .get(&text_id)
            .map_err(|e| AppError::msg(format!("texts.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("text not found: {text_id}")))?;

        text.content = content;

        self.texts
            .update(&text_id, text)
            .map_err(map_authored_error("update text"))?;

        app::emit!(Event::TextUpdated { id: &text_id });
        Ok(())
    }

    pub fn delete_text(&mut self, text_id: String) -> app::Result<()> {
        let exists = self
            .texts
            .contains(&text_id)
            .map_err(|e| AppError::msg(format!("texts.contains: {e}")))?;
        if !exists {
            app::bail!("text not found: {text_id}");
        }

        self.texts
            .remove(&text_id)
            .map_err(map_authored_error("delete text"))?;

        app::emit!(Event::TextDeleted { id: &text_id });
        Ok(())
    }

    pub fn get_all_text(&self) -> app::Result<Vec<TextElement>> {
        let cleared = *self.cleared_at_ms.get();
        let entries = self
            .texts
            .entries()
            .map_err(|e| AppError::msg(format!("texts.entries: {e}")))?;
        Ok(entries
            .map(|(_, v)| v)
            .filter(|t| t.created_at >= cleared)
            .collect())
    }

    // -----------------------------------------------------------------------
    // Comment methods
    // -----------------------------------------------------------------------

    pub fn add_comment(&mut self, target_id: String, body: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;
        let id = format!("comment-{now_ns}");

        let comment = Comment {
            id: id.clone(),
            author: caller,
            target_id,
            body,
            created_at: now_ms,
        };

        self.comments
            .insert(id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentAdded { id: &id });
        Ok(id)
    }

    pub fn delete_comment(&mut self, comment_id: String) -> app::Result<()> {
        let exists = self
            .comments
            .contains(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.contains: {e}")))?;
        if !exists {
            app::bail!("comment not found: {comment_id}");
        }

        self.comments
            .remove(&comment_id)
            .map_err(map_authored_error("delete comment"))?;

        app::emit!(Event::CommentDeleted { id: &comment_id });
        Ok(())
    }

    pub fn get_comments_for_target(&self, target_id: String) -> app::Result<Vec<Comment>> {
        let cleared = *self.cleared_at_ms.get();
        let entries = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?;
        Ok(entries
            .map(|(_, v)| v)
            .filter(|c| c.target_id == target_id && c.created_at >= cleared)
            .collect())
    }

    // -----------------------------------------------------------------------
    // Cursor methods
    // -----------------------------------------------------------------------

    /// Update the caller's cursor position. Each user owns their own cursor entry.
    /// Emits CursorUpdated so peers can refresh the live cursor overlay.
    pub fn update_cursor(&mut self, x: f64, y: f64) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        let cursor = Cursor {
            user_id: caller.clone(),
            x,
            y,
            last_updated_at: now_ms,
        };

        let exists = self
            .cursors
            .contains(&caller)
            .map_err(|e| AppError::msg(format!("cursors.contains: {e}")))?;

        if exists {
            self.cursors
                .update(&caller, cursor)
                .map_err(map_authored_error("update cursor"))?;
        } else {
            self.cursors
                .insert(caller, cursor)
                .map_err(|e| AppError::msg(format!("cursors.insert: {e}")))?;
        }

        app::emit!(Event::CursorUpdated {});
        Ok(())
    }

    pub fn get_all_cursors(&self) -> app::Result<Vec<Cursor>> {
        let entries = self
            .cursors
            .entries()
            .map_err(|e| AppError::msg(format!("cursors.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // -----------------------------------------------------------------------
    // Canvas management
    // -----------------------------------------------------------------------

    /// Clear the canvas. Sets cleared_at_ms to the current time; all shapes,
    /// text, and comments with created_at < cleared_at_ms are hidden by query
    /// methods. CRDT-safe: the LwwRegister timestamp resolves concurrent clears
    /// by keeping the latest.
    pub fn clear_canvas(&mut self) -> app::Result<()> {
        let now_ms = storage_env::time_now() / 1_000_000;
        self.cleared_at_ms = LwwRegister::new(now_ms);
        app::emit!(Event::CanvasCleared {});
        Ok(())
    }
}
