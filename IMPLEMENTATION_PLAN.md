# Implementation Plan

App: collectors-circle
Summary: Peer-to-peer marketplace for trusted collectors with provenance tracking and escrow

## Backend (logic/src/lib.rs)
- [x] Define entity: [marketplace] Listing (id:LwwRegister<String>, author:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, category:LwwRegister<String>, asking_price:LwwRegister<u64>, condition:LwwRegister<String>, status:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [marketplace] Offer (id:LwwRegister<String>, author:LwwRegister<String>, listing_id:LwwRegister<String>, amount:LwwRegister<u64>, status:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [marketplace] Trade (id:LwwRegister<String>, listing_id:LwwRegister<String>, seller:LwwRegister<String>, buyer:LwwRegister<String>, amount:LwwRegister<u64>, escrow_status:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [marketplace] ProvenanceRecord (item_id:LwwRegister<String>, prior_owner:LwwRegister<String>, price:LwwRegister<u64>, sale_date:LwwRegister<u64>, notes:LwwRegister<String>)
- [x] Implement mutate: [marketplace] create_listing(title: String, description: String, category: String, asking_price: u64, condition: String) → app::Result<String>
- [x] Implement view: [marketplace] list_active_listings() → app::Result<Vec<Listing>>
- [x] Implement view: [marketplace] get_listing(id: String) → app::Result<Listing>
- [x] Implement mutate: [marketplace] cancel_listing(id: String) → app::Result<()>
- [x] Implement mutate: [marketplace] make_offer(listing_id: String, amount: u64) → app::Result<String>
- [x] Implement view: [marketplace] get_offers_for_listing(listing_id: String) → app::Result<Vec<Offer>>
- [x] Implement mutate: [marketplace] accept_offer(offer_id: String) → app::Result<String>
- [x] Implement mutate: [marketplace] deposit_to_escrow(trade_id: String, amount: u64) → app::Result<()>
- [x] Implement mutate: [marketplace] confirm_receipt(trade_id: String) → app::Result<()>
- [x] Implement view: [marketplace] get_provenance(item_id: String) → app::Result<Vec<ProvenanceRecord>>
- [x] Implement mutate: [marketplace] record_provenance(item_id: String, prior_owner: String, price: u64, sale_date: u64, notes: String) → app::Result<()>

## Frontend (app/)
- [ ] Screen: MarketplaceView — Browse active listings by category, filter by condition, see seller name
- [ ] Screen: ListingDetailView — Full item details, provenance timeline, offers panel, escrow status
- [ ] Screen: MyListingsView — Seller's active listings, pending offers, completed trades
- [ ] Screen: MyOffersView — Buyer's open offers and their statuses
- [ ] Screen: TradesView — Active escrows and completed transaction history
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (seller): list an item I'm selling with photos, description, and provenance details
- [ ] Test story (buyer): browse items my trusted friends are selling
- [ ] Test story (seller): see offers on my items and accept one
- [ ] Test story (buyer and seller): use escrow to protect both of us—I deposit funds, you ship, I confirm receipt and release payment
- [ ] Test story (collector): see the full history of an item—past prices, previous owners, condition notes
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
