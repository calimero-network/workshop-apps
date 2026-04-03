#![allow(clippy::len_without_is_empty)]

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_storage::collections::{LwwRegister, UnorderedMap};
use thiserror::Error;

// ── Entity structs (serialized as JSON strings inside LwwRegister<String>) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Invitation {
    pub id: String,
    pub code: String,
    pub creator_id: String,
    pub accepted: bool,
    pub acceptor_id: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub text: String,
    pub timestamp: u64,
}


// ── App state ──────────────────────────────────────────────────────────────

#[app::state(emits = for<'a> Event<'a>)]
#[derive(Debug, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct AppState {
    invitations: UnorderedMap<String, LwwRegister<String>>,
    messages: UnorderedMap<String, LwwRegister<String>>,
}

// ── Events ─────────────────────────────────────────────────────────────────

#[app::event]
pub enum Event<'a> {
    InvitationCreated { id: &'a str, code: &'a str },
    InvitationAccepted { id: &'a str, acceptor_id: &'a str },
    MessageSent { id: &'a str, chat_id: &'a str },
}

// ── Errors ─────────────────────────────────────────────────────────────────

#[derive(Debug, Error, Serialize)]
#[serde(crate = "calimero_sdk::serde")]
#[serde(tag = "kind", content = "data")]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invitation already accepted")]
    AlreadyAccepted,
}

// ── Logic ──────────────────────────────────────────────────────────────────

#[app::logic]
impl AppState {
    #[app::init]
    pub fn init() -> AppState {
        AppState {
            invitations: UnorderedMap::new(),
            messages: UnorderedMap::new(),
        }
    }

    /// Create an invitation and return its unique join code.
    pub fn create_invitation(&mut self, creator_id: String) -> app::Result<String> {
        let count = self.invitations.entries()?.count();
        let now = calimero_sdk::env::time_now();
        let id = format!("inv-{}", count + 1);
        // Short alphanumeric code derived from count + low bits of timestamp
        let code = format!("{:04X}{:04X}", (count + 1) & 0xFFFF, now & 0xFFFF);

        let invitation = Invitation {
            id: id.clone(),
            code: code.clone(),
            creator_id,
            accepted: false,
            acceptor_id: String::new(),
            created_at: now,
        };

        let json = serde_json::to_string(&invitation)?;
        app::emit!(Event::InvitationCreated { id: &id, code: &code });
        self.invitations.insert(id, json.into())?;
        Ok(code)
    }

    /// Accept an invitation by code; returns the chat_id for the new conversation.
    pub fn accept_invitation(
        &mut self,
        code: String,
        acceptor_id: String,
    ) -> app::Result<String> {
        // Collect to release the borrow on self.invitations before mutating
        let entries: Vec<(String, String)> = self
            .invitations
            .entries()?
            .map(|(k, v)| (k, v.get().clone()))
            .collect();

        let found = entries
            .into_iter()
            .find_map(|(id, json)| {
                let inv = serde_json::from_str::<Invitation>(&json).ok()?;
                if inv.code == code { Some((id, inv)) } else { None }
            });
        let (inv_id, mut inv) = match found {
            Some(pair) => pair,
            None => app::bail!("Invitation not found for code: {}", code),
        };

        if inv.accepted {
            app::bail!("Invitation already accepted");
        }

        inv.accepted = true;
        inv.acceptor_id = acceptor_id.clone();

        let chat_id: String = inv_id.clone();
        let json = serde_json::to_string(&inv)?;
        app::emit!(Event::InvitationAccepted {
            id: &inv_id,
            acceptor_id: &acceptor_id,
        });
        self.invitations.insert(inv_id, json.into())?;

        Ok(chat_id)
    }

    /// Send a message into a chat.
    pub fn send_message(
        &mut self,
        chat_id: String,
        sender_id: String,
        text: String,
    ) -> app::Result<()> {
        let count = self.messages.entries()?.count();
        let now = calimero_sdk::env::time_now();
        let id = format!("msg-{}", count + 1);

        let message = Message {
            id: id.clone(),
            chat_id: chat_id.clone(),
            sender_id,
            text,
            timestamp: now,
        };

        let json = serde_json::to_string(&message)?;
        app::emit!(Event::MessageSent { id: &id, chat_id: &chat_id });
        self.messages.insert(id, json.into())?;
        Ok(())
    }

    /// Return all messages for a given chat, sorted oldest-first.
    pub fn get_messages(&self, chat_id: String) -> app::Result<Vec<Message>> {
        let mut result: Vec<Message> = self
            .messages
            .entries()?
            .filter_map(|(_, reg)| serde_json::from_str::<Message>(reg.get()).ok())
            .filter(|m| m.chat_id == chat_id)
            .collect();

        result.sort_by_key(|m| m.timestamp);
        Ok(result)
    }

    /// Look up an invitation by its join code.
    pub fn get_invitation(&self, code: String) -> app::Result<Invitation> {
        for (_, reg) in self.invitations.entries()? {
            if let Ok(inv) = serde_json::from_str::<Invitation>(reg.get()) {
                if inv.code == code {
                    return Ok(inv);
                }
            }
        }
        app::bail!("Invitation not found for code: {}", code);
    }
}
