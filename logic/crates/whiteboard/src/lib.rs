//! Whiteboard service — shared canvas with shapes.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

const MAX_NAME_LEN: usize = 128;
const MAX_SHAPE_TYPE_LEN: usize = 32;
const MAX_COLOR_LEN: usize = 32;

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
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Whiteboard state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct WhiteboardState {
    /// Project identifier — empty until create_project is called.
    project_id: LwwRegister<String>,
    /// Project display name.
    project_name: LwwRegister<String>,
    /// Project creation timestamp in milliseconds since epoch.
    project_created_at_ms: LwwRegister<u64>,
    /// All shapes on the canvas, keyed by shape ID.
    /// AuthoredMap ensures each shape can only be modified by its author.
    shapes: AuthoredMap<String, Shape>,
}

#[app::logic]
impl WhiteboardState {
    #[app::init]
    pub fn init() -> WhiteboardState {
        WhiteboardState {
            project_id: LwwRegister::new(String::new()),
            project_name: LwwRegister::new(String::new()),
            project_created_at_ms: LwwRegister::new(0u64),
            shapes: AuthoredMap::new_with_field_name("whiteboard:shapes"),
        }
    }

    // ---- Project API ----

    /// Create the project for this whiteboard context. Should be called once
    /// after the context is created. Returns the generated project ID.
    pub fn create_project(&mut self, name: String) -> app::Result<String> {
        if !self.project_id.get().is_empty() {
            app::bail!(AppError::msg("project already created for this context"));
        }
        if name.is_empty() {
            app::bail!(AppError::msg("project name must not be empty"));
        }
        let name: String = name.chars().take(MAX_NAME_LEN).collect();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("proj-{}", now_ms);

        self.project_id = LwwRegister::new(id.clone());
        self.project_name = LwwRegister::new(name.clone());
        self.project_created_at_ms = LwwRegister::new(now_ms);

        app::emit!(Event::ProjectCreated { id: &id, name: &name });
        Ok(id)
    }

    // ---- Shape API ----

    /// Add a new shape to the canvas. The caller becomes the shape's author
    /// and is the only one who may later update or delete it.
    pub fn add_shape(
        &mut self,
        shape_type: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        color: String,
    ) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let shape_type: String = shape_type.chars().take(MAX_SHAPE_TYPE_LEN).collect();
        let color: String = color.chars().take(MAX_COLOR_LEN).collect();
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;
        // Include nanosecond tail for uniqueness within the same millisecond.
        let id = format!("shape-{}-{}", now_ns, &author.chars().take(6).collect::<String>());

        let shape = Shape {
            id: id.clone(),
            author,
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

    /// Update the position, size, and color of a shape.
    /// Only the shape's original author may perform this operation.
    pub fn update_shape(
        &mut self,
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        color: String,
    ) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let existing = self
            .shapes
            .get(&id)
            .map_err(|e| AppError::msg(format!("shapes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("shape not found: {id}")))?;

        if existing.author != caller {
            app::bail!(AppError::msg(
                "forbidden: only the shape's author may update it"
            ));
        }

        let color: String = color.chars().take(MAX_COLOR_LEN).collect();
        let updated = Shape {
            id: id.clone(),
            author: existing.author,
            shape_type: existing.shape_type,
            x,
            y,
            width,
            height,
            color,
            created_at: existing.created_at,
        };

        self.shapes
            .update(&id, updated)
            .map_err(|e| AppError::msg(format!("shapes.update: {e}")))?;

        app::emit!(Event::ShapeUpdated { id: &id });
        Ok(())
    }

    /// Delete a shape from the canvas.
    /// Only the shape's original author may perform this operation.
    pub fn delete_shape(&mut self, id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let existing = self
            .shapes
            .get(&id)
            .map_err(|e| AppError::msg(format!("shapes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("shape not found: {id}")))?;

        if existing.author != caller {
            app::bail!(AppError::msg(
                "forbidden: only the shape's author may delete it"
            ));
        }

        self.shapes
            .remove(&id)
            .map_err(|e| AppError::msg(format!("shapes.remove: {e}")))?;

        app::emit!(Event::ShapeDeleted { id: &id });
        Ok(())
    }

    /// List all shapes currently on the canvas.
    pub fn list_shapes(&self) -> app::Result<Vec<Shape>> {
        let entries = self
            .shapes
            .entries()
            .map_err(|e| AppError::msg(format!("shapes.entries: {e}")))?;
        Ok(entries.map(|(_, shape)| shape).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_creates_empty_state() {
        let state = WhiteboardState::init();
        assert!(state.project_id.get().is_empty());
        assert_eq!(*state.project_created_at_ms.get(), 0u64);
    }
}
