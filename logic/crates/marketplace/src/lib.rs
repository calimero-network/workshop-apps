//! Marketplace service — listings, offers, trades, and provenance tracking.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Listing {
    pub id: String,
    pub author: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub asking_price: u64,
    pub condition: String,
    /// "active" | "in_escrow" | "cancelled" | "completed"
    pub status: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Offer {
    pub id: String,
    pub author: String,
    pub listing_id: String,
    pub amount: u64,
    /// "pending" | "accepted" | "cancelled"
    pub status: String,
    pub created_at: u64,
}

fn offer_status_rank(s: &str) -> u8 {
    match s {
        "pending" => 0,
        "accepted" => 1,
        "cancelled" => 2,
        _ => 0,
    }
}

impl Mergeable for Offer {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Status advances monotonically: pending → accepted/cancelled.
        if offer_status_rank(&other.status) > offer_status_rank(&self.status) {
            self.status = other.status.clone();
        }
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Trade {
    pub id: String,
    pub listing_id: String,
    pub seller: String,
    pub buyer: String,
    pub amount: u64,
    /// "awaiting_deposit" | "funded" | "completed" | "disputed"
    pub escrow_status: String,
    pub created_at: u64,
}

fn escrow_status_rank(s: &str) -> u8 {
    match s {
        "awaiting_deposit" => 0,
        "funded" => 1,
        "completed" => 2,
        "disputed" => 3,
        _ => 0,
    }
}

impl Mergeable for Trade {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Escrow status advances monotonically through its lifecycle.
        if escrow_status_rank(&other.escrow_status) > escrow_status_rank(&self.escrow_status) {
            self.escrow_status = other.escrow_status.clone();
        }
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct ProvenanceRecord {
    pub item_id: String,
    pub prior_owner: String,
    pub price: u64,
    pub sale_date: u64,
    pub notes: String,
}

impl Mergeable for ProvenanceRecord {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Provenance records are immutable historical facts; fill in any empty fields.
        if self.prior_owner.is_empty() && !other.prior_owner.is_empty() {
            self.prior_owner = other.prior_owner.clone();
        }
        if self.notes.is_empty() && !other.notes.is_empty() {
            self.notes = other.notes.clone();
        }
        if self.price == 0 && other.price != 0 {
            self.price = other.price;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct MarketplaceState {
    /// Per-seller listings; only the seller can cancel/update their own listing.
    listings: AuthoredMap<String, Listing>,
    /// Offers stored as shared so the seller can update status on accept.
    offers: UnorderedMap<String, Offer>,
    /// Trades created when a seller accepts an offer.
    trades: UnorderedMap<String, Trade>,
    /// Provenance records keyed by "{item_id}:{timestamp_ns}" for multi-record support.
    provenance: UnorderedMap<String, ProvenanceRecord>,
}

#[app::logic]
impl MarketplaceState {
    #[app::init]
    pub fn init() -> MarketplaceState {
        MarketplaceState {
            listings: AuthoredMap::new_with_field_name("marketplace:listings"),
            offers: UnorderedMap::new_with_field_name("marketplace:offers"),
            trades: UnorderedMap::new_with_field_name("marketplace:trades"),
            provenance: UnorderedMap::new_with_field_name("marketplace:provenance"),
        }
    }

    // ---- Listings ----

    pub fn create_listing(
        &mut self,
        title: String,
        description: String,
        category: String,
        asking_price: u64,
        condition: String,
    ) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let id = format!("list-{}", now_ns);

        let listing = Listing {
            id: id.clone(),
            author: caller,
            title,
            description,
            category,
            asking_price,
            condition,
            status: "active".to_string(),
            created_at: now_ns / 1_000_000,
        };

        self.listings
            .insert(id.clone(), listing)
            .map_err(|e| AppError::msg(format!("listings.insert: {e}")))?;

        app::emit!(Event::ListingCreated { id: &id });
        Ok(id)
    }

    pub fn list_active_listings(&self) -> app::Result<Vec<Listing>> {
        let entries = self
            .listings
            .entries()
            .map_err(|e| AppError::msg(format!("listings.entries: {e}")))?;
        Ok(entries
            .filter(|(_, l)| l.status == "active")
            .map(|(_, l)| l)
            .collect())
    }

    pub fn get_listing(&self, id: String) -> app::Result<Listing> {
        self.listings
            .get(&id)
            .map_err(|e| AppError::msg(format!("listings.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("listing not found: {id}")))
    }

    pub fn cancel_listing(&mut self, id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let mut listing = self
            .listings
            .get(&id)
            .map_err(|e| AppError::msg(format!("listings.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("listing not found: {id}")))?;

        if listing.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the seller can cancel a listing".into()
            ));
        }
        if listing.status != "active" {
            app::bail!(ChatError::Invalid(
                "only active listings can be cancelled".into()
            ));
        }

        listing.status = "cancelled".to_string();
        self.listings
            .update(&id, listing)
            .map_err(|e| AppError::msg(format!("listings.update: {e}")))?;

        app::emit!(Event::ListingCancelled { id: &id });
        Ok(())
    }

    // ---- Offers ----

    pub fn make_offer(&mut self, listing_id: String, amount: u64) -> app::Result<String> {
        let listing = self
            .listings
            .get(&listing_id)
            .map_err(|e| AppError::msg(format!("listings.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("listing not found: {listing_id}")))?;

        if listing.status != "active" {
            app::bail!(ChatError::Invalid("listing is not active".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let id = format!("offer-{}", now_ns);

        let offer = Offer {
            id: id.clone(),
            author: caller,
            listing_id: listing_id.clone(),
            amount,
            status: "pending".to_string(),
            created_at: now_ns / 1_000_000,
        };

        self.offers
            .insert(id.clone(), offer)
            .map_err(|e| AppError::msg(format!("offers.insert: {e}")))?;

        app::emit!(Event::OfferMade {
            id: &id,
            listing_id: &listing_id,
        });
        Ok(id)
    }

    pub fn get_offers_for_listing(&self, listing_id: String) -> app::Result<Vec<Offer>> {
        let entries = self
            .offers
            .entries()
            .map_err(|e| AppError::msg(format!("offers.entries: {e}")))?;
        Ok(entries
            .filter(|(_, o)| o.listing_id == listing_id)
            .map(|(_, o)| o)
            .collect())
    }

    pub fn accept_offer(&mut self, offer_id: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let mut offer = self
            .offers
            .get(&offer_id)
            .map_err(|e| AppError::msg(format!("offers.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("offer not found: {offer_id}")))?;

        if offer.status != "pending" {
            app::bail!(ChatError::Invalid("offer is not pending".into()));
        }

        let listing_id = offer.listing_id.clone();
        let buyer = offer.author.clone();
        let offer_amount = offer.amount;

        let mut listing = self
            .listings
            .get(&listing_id)
            .map_err(|e| AppError::msg(format!("listings.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("listing not found: {listing_id}")))?;

        if listing.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the seller can accept an offer".into()
            ));
        }
        if listing.status != "active" {
            app::bail!(ChatError::Invalid("listing is not active".into()));
        }

        // Create trade.
        let now_ns = storage_env::time_now();
        let trade_id = format!("trade-{}", now_ns);

        let trade = Trade {
            id: trade_id.clone(),
            listing_id: listing_id.clone(),
            seller: caller,
            buyer,
            amount: offer_amount,
            escrow_status: "awaiting_deposit".to_string(),
            created_at: now_ns / 1_000_000,
        };

        self.trades
            .insert(trade_id.clone(), trade)
            .map_err(|e| AppError::msg(format!("trades.insert: {e}")))?;

        // Mark offer accepted.
        offer.status = "accepted".to_string();
        self.offers
            .insert(offer_id.clone(), offer)
            .map_err(|e| AppError::msg(format!("offers.insert(accept): {e}")))?;

        // Move listing to in_escrow.
        listing.status = "in_escrow".to_string();
        self.listings
            .update(&listing_id, listing)
            .map_err(|e| AppError::msg(format!("listings.update(escrow): {e}")))?;

        app::emit!(Event::OfferAccepted {
            offer_id: &offer_id,
            trade_id: &trade_id,
        });
        Ok(trade_id)
    }

    // ---- Escrow ----

    pub fn deposit_to_escrow(&mut self, trade_id: String, amount: u64) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let mut trade = self
            .trades
            .get(&trade_id)
            .map_err(|e| AppError::msg(format!("trades.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("trade not found: {trade_id}")))?;

        if trade.buyer != caller {
            app::bail!(ChatError::Forbidden(
                "only the buyer can deposit to escrow".into()
            ));
        }
        if trade.escrow_status != "awaiting_deposit" {
            app::bail!(ChatError::Invalid("trade is not awaiting deposit".into()));
        }
        if amount < trade.amount {
            app::bail!(ChatError::Invalid(
                "deposit amount is less than the agreed trade amount".into()
            ));
        }

        trade.escrow_status = "funded".to_string();
        self.trades
            .insert(trade_id.clone(), trade)
            .map_err(|e| AppError::msg(format!("trades.insert(funded): {e}")))?;

        app::emit!(Event::EscrowDeposited { trade_id: &trade_id });
        Ok(())
    }

    pub fn confirm_receipt(&mut self, trade_id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let mut trade = self
            .trades
            .get(&trade_id)
            .map_err(|e| AppError::msg(format!("trades.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("trade not found: {trade_id}")))?;

        if trade.buyer != caller {
            app::bail!(ChatError::Forbidden(
                "only the buyer can confirm receipt".into()
            ));
        }
        if trade.escrow_status != "funded" {
            app::bail!(ChatError::Invalid(
                "escrow must be funded before confirming receipt".into()
            ));
        }

        trade.escrow_status = "completed".to_string();
        self.trades
            .insert(trade_id.clone(), trade)
            .map_err(|e| AppError::msg(format!("trades.insert(completed): {e}")))?;

        app::emit!(Event::ReceiptConfirmed { trade_id: &trade_id });
        Ok(())
    }

    // ---- Provenance ----

    pub fn get_provenance(&self, item_id: String) -> app::Result<Vec<ProvenanceRecord>> {
        let prefix = format!("{item_id}:");
        let entries = self
            .provenance
            .entries()
            .map_err(|e| AppError::msg(format!("provenance.entries: {e}")))?;
        Ok(entries
            .filter(|(k, _)| k.starts_with(&prefix))
            .map(|(_, v)| v)
            .collect())
    }

    pub fn record_provenance(
        &mut self,
        item_id: String,
        prior_owner: String,
        price: u64,
        sale_date: u64,
        notes: String,
    ) -> app::Result<()> {
        let now_ns = storage_env::time_now();
        // Key includes item_id prefix so get_provenance can filter by it.
        let key = format!("{item_id}:{now_ns}");

        let record = ProvenanceRecord {
            item_id: item_id.clone(),
            prior_owner,
            price,
            sale_date,
            notes,
        };

        self.provenance
            .insert(key, record)
            .map_err(|e| AppError::msg(format!("provenance.insert: {e}")))?;

        app::emit!(Event::ProvenanceRecorded { item_id: &item_id });
        Ok(())
    }
}
