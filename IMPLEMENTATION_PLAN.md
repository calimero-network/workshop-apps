# Implementation Plan

App: group-event-planner
Summary: Plan shared events together: RSVP, comment, and coordinate dish contributions

## Backend (logic/src/lib.rs)
- [ ] Define entity: [event-planner] Event (id:LwwRegister<String>, title:LwwRegister<String>, date:LwwRegister<u64>, location:LwwRegister<String>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Define entity: [event-planner] RSVP (id:String, event_id:String, guest:String, status:String, updated_at:u64)
- [ ] Define entity: [event-planner] Comment (id:String, event_id:String, author:String, body:String, posted_at:u64)
- [ ] Define entity: [event-planner] DishItem (id:String, event_id:String, item_name:String, claimed_by:Option<String>, claimed_at:Option<u64>)
- [ ] Implement mutate: [event-planner] create_event(title: String, date: u64, location: String) → app::Result<String>
- [ ] Implement view: [event-planner] list_events() → app::Result<Vec<Event>>
- [ ] Implement mutate: [event-planner] submit_rsvp(event_id: String, status: String) → app::Result<String>
- [ ] Implement view: [event-planner] get_rsvp_counts(event_id: String) → app::Result<(u64, u64, u64)>
- [ ] Implement mutate: [event-planner] post_comment(event_id: String, body: String) → app::Result<String>
- [ ] Implement mutate: [event-planner] edit_comment(comment_id: String, new_body: String) → app::Result<()>
- [ ] Implement mutate: [event-planner] delete_comment(comment_id: String) → app::Result<()>
- [ ] Implement view: [event-planner] get_comments(event_id: String) → app::Result<Vec<Comment>>
- [ ] Implement mutate: [event-planner] add_dish_item(event_id: String, item_name: String) → app::Result<String>
- [ ] Implement mutate: [event-planner] claim_dish_item(dish_id: String) → app::Result<()>
- [ ] Implement mutate: [event-planner] unclaim_dish_item(dish_id: String) → app::Result<()>
- [ ] Implement view: [event-planner] get_dish_list(event_id: String) → app::Result<Vec<DishItem>>

## Frontend (app/)
- [ ] Screen: EventFeedView — List of all events ordered by date with RSVP counts, create-event button
- [ ] Screen: EventDetailView — Full event info + RSVP options + comment thread + bring-a-dish list with claim buttons
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (organizer): create a new event with a title, date, and location
- [ ] Test story (guest): RSVP yes, no, or maybe to an event
- [ ] Test story (guest): comment on an event to ask questions or share ideas
- [ ] Test story (guest): claim an item from the bring-a-dish list
- [ ] Test story (anyone in the group): see a live feed of all events with RSVP counts
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
