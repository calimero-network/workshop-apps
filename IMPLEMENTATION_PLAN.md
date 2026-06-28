# Implementation Plan

App: shared-shopping-list
Summary: Real-time shopping list where members add, check off, and clear items together

## Backend (logic/src/lib.rs)
- [ ] Define entity: [shopping-list] ShoppingList (items:UnorderedMap<String, Item>)
- [ ] Define entity: [shopping-list] Item (id:Immutable<String>, name:LwwRegister<String>, quantity:LwwRegister<u32>, category:LwwRegister<String>, completed:LwwRegister<bool>, author:Immutable<String>, created_at:Immutable<u64>)
- [ ] Implement mutate: [shopping-list] add_item(name: String, quantity: u32, category: String) → app::Result<String>
- [ ] Implement mutate: [shopping-list] set_completed(id: String, completed: bool) → app::Result<()>
- [ ] Implement mutate: [shopping-list] clear_completed() → app::Result<u32>
- [ ] Implement mutate: [shopping-list] delete_item(id: String) → app::Result<()>
- [ ] Implement view: [shopping-list] get_items() → app::Result<Vec<Item>>

## Frontend (app/)
- [ ] Screen: ShoppingListPage — Main view: items grouped by category with quantity badges and completion checkboxes, an add-item form (name, quantity, category), and a 'Clear completed' button. Subscribes to service events to live-refresh via get_items.
- [ ] Screen: InvitePanel — Organizer-only panel to invite members by identity and display pending/accepted membership, using CAN_INVITE / MANAGE_MEMBERS capabilities.
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (group member): add items to the list with a quantity and category
- [ ] Test story (shopper): check off items as I buy them
- [ ] Test story (anyone): clear all the completed items at once
- [ ] Test story (list organizer): invite family or roommates to edit the same list
- [ ] Test story (member): see the current list organized by category
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
