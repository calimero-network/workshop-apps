/**
 * useCrm — real data binding over the generated CrmClient for the shared CRM
 * (contacts, deals through a pipeline, and per-contact interaction history).
 *
 * Mirrors the canonical useItems pattern: a memoized typed client wraps
 * `mero.rpc.execute`, `useSubscription` re-fetches on every sync event so
 * teammates' edits show up live, and every mutation refetches immediately
 * after so the caller's own UI doesn't lag its own write.
 *
 * `list_interactions` is per-contact, so interactions are cached in a map
 * keyed by contact id and only fetched for contacts the user has selected —
 * `selectContact` drives that fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { CrmClient, type Contact, type Deal, type Interaction } from '../api/crm/CrmClient';

export interface UseCrmArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseCrmReturn {
  contacts: Contact[];
  deals: Deal[];
  interactions: Interaction[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  selectedContactId: string | null;
  selectContact: (id: string | null) => void;
  addContact: (name: string, email: string, phone: string, company: string) => Promise<void>;
  createDeal: (contactId: string, title: string, value: number) => Promise<void>;
  updateDealStage: (dealId: string, stage: string) => Promise<void>;
  setContractDetails: (dealId: string, details: string) => Promise<void>;
  logInteraction: (contactId: string, kind: string, note: string) => Promise<void>;
  editInteraction: (id: string, note: string) => Promise<void>;
  deleteInteraction: (id: string) => Promise<void>;
}

export function useCrm({ contextId, executorPublicKey }: UseCrmArgs): UseCrmReturn {
  const { mero } = useMero();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [interactionsByContact, setInteractionsByContact] = useState<Record<string, Interaction[]>>({});
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new CrmClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refreshContacts = useCallback(async () => {
    if (!client) return;
    setContacts(await client.listContacts());
  }, [client]);

  const refreshDeals = useCallback(async () => {
    if (!client) return;
    setDeals(await client.listDeals());
  }, [client]);

  const refreshInteractions = useCallback(async (contactId: string) => {
    if (!client) return;
    const list = await client.listInteractions({ contact_id: contactId });
    setInteractionsByContact((prev) => ({ ...prev, [contactId]: list }));
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        refreshContacts(),
        refreshDeals(),
        selectedContactId ? refreshInteractions(selectedContactId) : Promise.resolve(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, refreshContacts, refreshDeals, refreshInteractions, selectedContactId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const selectContact = useCallback((id: string | null) => {
    setSelectedContactId(id);
    if (id) void refreshInteractions(id);
  }, [refreshInteractions]);

  const addContact = useCallback(async (name: string, email: string, phone: string, company: string) => {
    if (!client) return;
    await client.addContact({ name, email, phone, company });
    await refreshContacts();
  }, [client, refreshContacts]);

  const createDeal = useCallback(async (contactId: string, title: string, value: number) => {
    if (!client) return;
    await client.createDeal({ contact_id: contactId, title, value });
    await refreshDeals();
  }, [client, refreshDeals]);

  const updateDealStage = useCallback(async (dealId: string, stage: string) => {
    if (!client) return;
    await client.updateDealStage({ deal_id: dealId, stage });
    await refreshDeals();
  }, [client, refreshDeals]);

  const setContractDetails = useCallback(async (dealId: string, details: string) => {
    if (!client) return;
    await client.setContractDetails({ deal_id: dealId, details });
    await refreshDeals();
  }, [client, refreshDeals]);

  const logInteraction = useCallback(async (contactId: string, kind: string, note: string) => {
    if (!client) return;
    await client.logInteraction({ contact_id: contactId, kind, note });
    await refreshInteractions(contactId);
  }, [client, refreshInteractions]);

  const editInteraction = useCallback(async (id: string, note: string) => {
    if (!client || !selectedContactId) return;
    await client.editInteraction({ id, note });
    await refreshInteractions(selectedContactId);
  }, [client, refreshInteractions, selectedContactId]);

  const deleteInteraction = useCallback(async (id: string) => {
    if (!client || !selectedContactId) return;
    await client.deleteInteraction({ id });
    await refreshInteractions(selectedContactId);
  }, [client, refreshInteractions, selectedContactId]);

  // Flatten the per-contact cache; ContactsView filters by contact_id itself.
  const interactions = useMemo(
    () => Object.values(interactionsByContact).flat(),
    [interactionsByContact],
  );

  return {
    contacts,
    deals,
    interactions,
    loading,
    error,
    ready: client !== null,
    selectedContactId,
    selectContact,
    addContact,
    createDeal,
    updateDealStage,
    setContractDetails,
    logInteraction,
    editInteraction,
    deleteInteraction,
  };
}
