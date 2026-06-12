#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new post was created.
    PostCreated { id: &'a str, author: &'a str },
    /// A post was edited by its author.
    PostEdited { id: &'a str },
    /// A post was deleted by its author.
    PostDeleted { id: &'a str },
    /// A new comment was created.
    CommentCreated { id: &'a str, post_id: &'a str },
    /// A comment was edited by its author.
    CommentEdited { id: &'a str },
    /// A comment was deleted by its author.
    CommentDeleted { id: &'a str },
    /// A vote was cast on a post or comment.
    VoteCast { target_id: &'a str, target_type: &'a str },
    /// A moderator was appointed by the founder.
    ModeratorAppointed { id: &'a str, member_id: &'a str },
    /// A moderator was revoked by the founder.
    ModeratorRevoked { id: &'a str },
    /// A post was removed by a moderator.
    PostModerated { id: &'a str },
    /// A comment was removed by a moderator.
    CommentModerated { id: &'a str },
    /// Community name/topic were changed.
    CommunityRenamed {},
}
