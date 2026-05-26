#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new listing was created.
    ListingCreated { id: &'a str },
    /// A listing was cancelled by the seller.
    ListingCancelled { id: &'a str },
    /// A buyer made an offer on a listing.
    OfferMade { id: &'a str, listing_id: &'a str },
    /// The seller accepted an offer, creating a trade.
    OfferAccepted { offer_id: &'a str, trade_id: &'a str },
    /// The buyer deposited funds into escrow.
    EscrowDeposited { trade_id: &'a str },
    /// The buyer confirmed receipt, completing the trade.
    ReceiptConfirmed { trade_id: &'a str },
    /// A provenance record was added for an item.
    ProvenanceRecorded { item_id: &'a str },
}
