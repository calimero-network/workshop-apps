#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A founder posted a new update.
    UpdatePosted { id: &'a str },
    /// A founder logged a new metric value.
    MetricLogged { id: &'a str },
    /// A fund manager or investor posted a comment on an update.
    CommentPosted { id: &'a str },
    /// An investor started following a company.
    CompanyFollowed { id: &'a str },
}
