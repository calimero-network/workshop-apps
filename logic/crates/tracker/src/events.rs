#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A project was created in this context.
    ProjectCreated { id: &'a str },
    /// A new submission was created.
    SubmissionCreated { id: &'a str },
    /// A submission was edited by its author.
    SubmissionEdited { id: &'a str },
    /// A submission was withdrawn by its author.
    SubmissionWithdrawn { id: &'a str },
    /// The owner submitted a triage result for a submission.
    TriageResultSubmitted { id: &'a str, submission_id: &'a str },
}
