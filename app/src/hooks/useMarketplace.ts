import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  MarketplaceClient,
  type Listing,
  type Offer,
  type Trade,
  type ProvenanceRecord,
} from '../api/marketplace/MarketplaceClient';

export type { Listing, Offer, Trade, ProvenanceRecord };

export interface UseMarketplaceReturn {
  listings: Listing[];
  offers: Offer[];           // offers on the currently selected listing
  trades: Trade[];           // all trades visible (fetched from state)
  provenance: ProvenanceRecord[]; // provenance for currently selected listing
  loading: boolean;
  error: Error | null;
  selectedListingId: string | null;
  selectListing: (id: string | null) => void;
  selectedListing: Listing | null;

  // Seller actions
  createListing: (params: {
    title: string;
    description: string;
    category: string;
    asking_price: number;
    condition: string;
  }) => Promise<string>;
  cancelListing: (id: string) => Promise<void>;

  // Buyer actions
  makeOffer: (listingId: string, amount: number) => Promise<string>;

  // Seller accepts
  acceptOffer: (offerId: string) => Promise<string>;

  // Escrow
  depositToEscrow: (tradeId: string, amount: number) => Promise<void>;
  confirmReceipt: (tradeId: string) => Promise<void>;

  // Provenance
  recordProvenance: (params: {
    item_id: string;
    prior_owner: string;
    price: number;
    sale_date: number;
    notes: string;
  }) => Promise<void>;

  refresh: () => Promise<void>;
  executorPublicKey: string | null;
}

export function useMarketplace(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseMarketplaceReturn {
  const { mero } = useMero();
  const [listings, setListings] = useState<Listing[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  // Trades are not listable via RPC (no list_trades endpoint in the contract).
  // We accumulate them locally in this session whenever accept_offer is called.
  const [trades, setTrades] = useState<Trade[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  // Resolve executor identity for this context
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorPublicKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
        } else if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorPublicKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorPublicKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const clientRef = useRef<MarketplaceClient | null>(null);
  clientRef.current =
    mero && contextId && executorPublicKey
      ? new MarketplaceClient(mero, contextId, executorPublicKey)
      : null;

  const getClient = useCallback((): MarketplaceClient | null => clientRef.current, []);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const all = await client.listActiveListings();
      setListings(all);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Fetch offers + provenance when selectedListingId changes
  useEffect(() => {
    const client = getClient();
    if (!client || !selectedListingId) {
      setOffers([]);
      setProvenance([]);
      return;
    }
    (async () => {
      try {
        const [off, prov] = await Promise.all([
          client.getOffersForListing({ listing_id: selectedListingId }),
          client.getProvenance({ item_id: selectedListingId }),
        ]);
        setOffers(off);
        setProvenance(prov);
      } catch {
        // transient
      }
    })();
  }, [selectedListingId, getClient, listings]); // re-fetch when listings refresh too

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to any marketplace state change
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  // Derived
  const selectedListing = listings.find((l) => l.id === selectedListingId) ?? null;

  // ---- Mutations ----

  const createListing = useCallback(async (params: {
    title: string;
    description: string;
    category: string;
    asking_price: number;
    condition: string;
  }): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    const id = await client.createListing(params);
    await refresh();
    return id;
  }, [getClient, refresh]);

  const cancelListing = useCallback(async (id: string): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    await client.cancelListing({ id });
    if (selectedListingId === id) setSelectedListingId(null);
    await refresh();
  }, [getClient, refresh, selectedListingId]);

  const makeOffer = useCallback(async (listingId: string, amount: number): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    const offerId = await client.makeOffer({ listing_id: listingId, amount });
    await refresh();
    return offerId;
  }, [getClient, refresh]);

  const acceptOffer = useCallback(async (offerId: string): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    const tradeId = await client.acceptOffer({ offer_id: offerId });
    // Reconstruct the Trade locally since there is no list_trades RPC.
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      const newTrade: Trade = {
        id: tradeId,
        listing_id: offer.listing_id,
        seller: executorPublicKey ?? '',
        buyer: offer.author,
        amount: offer.amount,
        escrow_status: 'awaiting_deposit',
        created_at: Date.now(),
      };
      setTrades((prev) => [...prev.filter((t) => t.id !== tradeId), newTrade]);
    }
    await refresh();
    return tradeId;
  }, [getClient, refresh, offers, executorPublicKey]);

  const depositToEscrow = useCallback(async (tradeId: string, amount: number): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    await client.depositToEscrow({ trade_id: tradeId, amount });
    setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, escrow_status: 'deposited' } : t));
    await refresh();
  }, [getClient, refresh]);

  const confirmReceipt = useCallback(async (tradeId: string): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    await client.confirmReceipt({ trade_id: tradeId });
    setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, escrow_status: 'completed' } : t));
    await refresh();
  }, [getClient, refresh]);

  const recordProvenance = useCallback(async (params: {
    item_id: string;
    prior_owner: string;
    price: number;
    sale_date: number;
    notes: string;
  }): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Marketplace client not ready');
    await client.recordProvenance(params);
    await refresh();
  }, [getClient, refresh]);

  return {
    listings,
    offers,
    trades,
    provenance,
    loading,
    error,
    selectedListingId,
    selectListing: setSelectedListingId,
    selectedListing,
    createListing,
    cancelListing,
    makeOffer,
    acceptOffer,
    depositToEscrow,
    confirmReceipt,
    recordProvenance,
    refresh,
    executorPublicKey,
  };
}
