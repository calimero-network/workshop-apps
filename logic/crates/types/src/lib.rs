use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum ChatError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("room already exists")]
    RoomAlreadyExists,
    #[error("message too long")]
    MessageTooLong,
}

/// Player public key — 32-byte Ed25519 key with base58 encoding.
///
/// Note: `from_executor_id()` lives in each service crate (requires calimero-sdk).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicKey(pub [u8; 32]);

impl PublicKey {
    pub fn from_raw_bytes(v: &[u8]) -> Result<PublicKey, ChatError> {
        if v.len() != 32 {
            return Err(ChatError::Invalid("key length".into()));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(v);
        Ok(PublicKey(arr))
    }

    pub fn from_base58(encoded: &str) -> Result<PublicKey, ChatError> {
        let decoded = bs58::decode(encoded)
            .into_vec()
            .map_err(|e| ChatError::Invalid(format!("bad base58 key: {e}")))?;
        if decoded.len() != 32 {
            return Err(ChatError::Invalid("key length".into()));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&decoded);
        Ok(PublicKey(arr))
    }

    pub fn to_base58(&self) -> String {
        bs58::encode(&self.0).into_string()
    }
}

/// Generate an ID from prefix, timestamp, and 4 random bytes.
/// Format: `{prefix}-{timestamp}-{hex}`.
pub fn generate_id(prefix: &str, timestamp: u64, nonce: &[u8; 4]) -> String {
    let hex = nonce
        .iter()
        .fold(String::with_capacity(8), |mut acc, b| {
            acc.push_str(&format!("{:02x}", b));
            acc
        });
    format!("{prefix}-{timestamp}-{hex}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_key_base58_roundtrip() {
        let key = PublicKey([42u8; 32]);
        let encoded = key.to_base58();
        let decoded = PublicKey::from_base58(&encoded).unwrap();
        assert_eq!(key, decoded);
    }

    #[test]
    fn public_key_bad_base58_fails() {
        assert!(PublicKey::from_base58("!!!invalid!!!").is_err());
    }

    #[test]
    fn public_key_wrong_length_fails() {
        let short = bs58::encode(&[1u8; 16]).into_string();
        assert!(PublicKey::from_base58(&short).is_err());
    }

    #[test]
    fn public_key_borsh_roundtrip() {
        let key = PublicKey([7u8; 32]);
        let bytes = borsh::to_vec(&key).unwrap();
        let decoded: PublicKey = borsh::from_slice(&bytes).unwrap();
        assert_eq!(key, decoded);
    }

    #[test]
    fn chat_error_display() {
        let err = ChatError::NotFound("test".into());
        assert!(err.to_string().contains("test"));
        assert!(ChatError::RoomAlreadyExists
            .to_string()
            .contains("already exists"));
    }
}
