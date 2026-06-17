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

/// Maximum size (bytes) of a shared blob/attachment. Mirrors the frontend's
/// upload guard. The bytes live in the node blob store; the room only holds
/// the reference, so this caps what a peer is asked to download per message.
pub const MAX_ATTACHMENT_SIZE: u64 = 25 * 1024 * 1024; // 25 MiB
/// Maximum length of an attachment file name.
pub const MAX_FILENAME_LEN: usize = 256;

/// Validate the metadata that accompanies a shared blob before it is stored in
/// a message. Pure (no host calls) so it is unit-testable on the host and
/// reusable across services. The blob bytes themselves are validated by the
/// node's blob store; here we only sanity-check the reference + display fields.
pub fn validate_attachment(
    blob_id: &str,
    file_name: &str,
    mime_type: &str,
    size: u64,
) -> Result<(), ChatError> {
    if blob_id.trim().is_empty() {
        return Err(ChatError::Invalid("attachment blob_id is empty".into()));
    }
    if file_name.is_empty() || file_name.len() > MAX_FILENAME_LEN {
        return Err(ChatError::Invalid(format!(
            "attachment file name must be 1-{MAX_FILENAME_LEN} bytes"
        )));
    }
    // A minimal `type/subtype` shape check — keeps junk out of the rendered UI.
    if !mime_type.contains('/') || mime_type.len() > 128 {
        return Err(ChatError::Invalid("attachment mime type is invalid".into()));
    }
    if size == 0 {
        return Err(ChatError::Invalid("attachment is empty".into()));
    }
    if size > MAX_ATTACHMENT_SIZE {
        return Err(ChatError::MessageTooLong);
    }
    Ok(())
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

    #[test]
    fn validate_attachment_accepts_valid() {
        assert!(validate_attachment("blob123", "photo.png", "image/png", 1024).is_ok());
    }

    #[test]
    fn validate_attachment_rejects_empty_blob_id() {
        assert!(validate_attachment("  ", "photo.png", "image/png", 1024).is_err());
    }

    #[test]
    fn validate_attachment_rejects_empty_or_long_filename() {
        assert!(validate_attachment("b", "", "image/png", 10).is_err());
        let long = "a".repeat(MAX_FILENAME_LEN + 1);
        assert!(validate_attachment("b", &long, "image/png", 10).is_err());
    }

    #[test]
    fn validate_attachment_rejects_bad_mime() {
        assert!(validate_attachment("b", "f.bin", "notamime", 10).is_err());
    }

    #[test]
    fn validate_attachment_rejects_zero_and_oversize() {
        assert!(validate_attachment("b", "f.png", "image/png", 0).is_err());
        assert!(matches!(
            validate_attachment("b", "f.png", "image/png", MAX_ATTACHMENT_SIZE + 1),
            Err(ChatError::MessageTooLong)
        ));
    }

    #[test]
    fn validate_attachment_accepts_max_size() {
        assert!(validate_attachment("b", "f.png", "image/png", MAX_ATTACHMENT_SIZE).is_ok());
    }
}
