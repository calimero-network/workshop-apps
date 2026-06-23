# Implementation Plan

App: team-expenses
Summary: A shared expense tracker where team members submit expenses and the ops team reviews, approves, and tracks reimbursements

## Backend (logic/src/lib.rs)
- [x] Define entity: [expenses] Expense (id:LwwRegister<String>, author:LwwRegister<String>, description:LwwRegister<String>, amount:LwwRegister<u64>, currency:LwwRegister<String>, category:LwwRegister<String>, status:LwwRegister<String>, reviewer_note:LwwRegister<String>, submitted_at:LwwRegister<u64>)
- [x] Define entity: [expenses] Category (id:LwwRegister<String>, name:LwwRegister<String>)
- [x] Implement mutate: [expenses] submit_expense(description: String, amount: u64, currency: String, category: String) → app::Result<String>
- [x] Implement mutate: [expenses] edit_expense(expense_id: String, description: String, amount: u64, currency: String, category: String) → app::Result<()>
- [x] Implement mutate: [expenses] approve_expense(expense_id: String, note: String) → app::Result<()>
- [x] Implement mutate: [expenses] reject_expense(expense_id: String, note: String) → app::Result<()>
- [x] Implement mutate: [expenses] mark_reimbursed(expense_id: String) → app::Result<()>
- [x] Implement view: [expenses] list_my_expenses() → app::Result<Vec<Expense>>
- [x] Implement view: [expenses] list_pending_expenses() → app::Result<Vec<Expense>>
- [x] Implement view: [expenses] list_all_expenses() → app::Result<Vec<Expense>>
- [x] Implement mutate: [expenses] add_category(name: String) → app::Result<String>
- [x] Implement view: [expenses] list_categories() → app::Result<Vec<Category>>

## Frontend (app/)
- [x] Screen: SubmitExpensePage — Form to submit a new expense with category picker, plus a list of the current user's expenses and their statuses
- [x] Screen: ReviewDashboard — Ops view showing all pending expenses with approve/reject/reimburse actions and reviewer note field
- [x] Screen: SpendingSummary — Overview of team spending broken down by category and status, with totals
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): submit an expense with a description, amount, and category
- [ ] Test story (team member): see all my submitted expenses and their current status
- [ ] Test story (ops team member): see every pending expense from the whole team in one place
- [ ] Test story (ops team member): approve or reject an expense with an optional note
- [ ] Test story (ops team member): mark approved expenses as reimbursed
- [ ] Test story (anyone on the team): see a spending summary broken down by category
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
