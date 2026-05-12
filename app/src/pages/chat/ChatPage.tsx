/**
 * TripPage (ChatPage) — main page for trip-splitter.
 *
 * Architecture:
 *  - Each namespace = one trip group with a single "trip" context.
 *  - useChatLobby selects the namespace and resolves the trip context.
 *  - useTripData fetches expenses + balances from that context via TripClient.
 *  - Three views: Expenses, Settlement (TripSetup is embedded in the sidebar).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTripData, saveTripCurrency } from '../../hooks/useTripData';
import { TripClient } from '../../api/trip/TripClient';
import Sidebar from '../../components/Sidebar';
import ExpenseList from '../../components/ExpenseList';
import SettlementView from '../../components/SettlementView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const lobby = useChatLobby();

  const [activeTab, setActiveTab] = useState<'expenses' | 'settlement'>('expenses');
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // After creating a new namespace+context, we need to call create_trip to
  // set the trip name and currency. Store the pending values here and
  // trigger the call once lobbyContextId + executorPublicKey are resolved.
  const [pendingTripInit, setPendingTripInit] = useState<{ name: string; currency: string } | null>(null);
  const initFiredRef = useRef<string | null>(null); // tracks contextId to avoid double-firing

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Members polling — namespace membership has no SSE channel
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Fire create_trip once the context is ready after a new trip is created
  useEffect(() => {
    if (
      !pendingTripInit ||
      !lobby.lobbyContextId ||
      !lobby.executorPublicKey ||
      !mero ||
      initFiredRef.current === lobby.lobbyContextId
    ) return;

    initFiredRef.current = lobby.lobbyContextId;
    const { name, currency } = pendingTripInit;
    setPendingTripInit(null);

    const client = new TripClient(mero, lobby.lobbyContextId, lobby.executorPublicKey);
    client.createTrip({ name, currency })
      .then(() => { saveTripCurrency(lobby.lobbyContextId!, currency); })
      .catch((err) => { console.error('create_trip failed:', err); });
  }, [pendingTripInit, lobby.lobbyContextId, lobby.executorPublicKey, mero]);

  const handleCreateTrip = useCallback(async (name: string, currency: string) => {
    await lobby.createLobby(name);
    setPendingTripInit({ name, currency });
  }, [lobby]);

  // Per-trip data (expenses, balances) — feeds off the resolved trip context
  const tripData = useTripData(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  // ---- Welcome screen (no trips yet) ----
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{
          justifyContent: 'center', alignItems: 'center', gap: '1.25rem',
          maxWidth: 440, margin: '0 auto', padding: '2rem',
        }}>
          <div style={{ fontSize: '3rem' }}>✈️</div>
          <h2 style={{ textAlign: 'center', color: '#f1f5f9' }}>
            No trips yet
          </h2>
          <p style={{ color: '#64748b', textAlign: 'center', fontSize: '0.9rem' }}>
            Create a new trip to start tracking shared expenses, or join one with an invitation from a friend.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateTrip(true)}
              style={{
                padding: '0.5rem 1.25rem', background: 'var(--color-primary, #0066CC)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Create Trip
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem', background: '#1e293b', color: '#cbd5e1',
                border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Join with Invitation
            </button>
          </div>

          {showCreateTrip && (
            <CreateWorkspaceModal
              onCreate={handleCreateTrip}
              onClose={() => setShowCreateTrip(false)}
            />
          )}
          {showJoin && (
            <JoinModal
              onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
              onClose={() => setShowJoin(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ---- Main layout ----
  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateTrip(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          tripCurrency={tripData.currency}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onInvite={() => setShowInvite(true)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d1b2e' }}>
          {!lobby.lobbyContextId ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#475569', flexDirection: 'column', gap: '0.5rem',
            }}>
              <div style={{ fontSize: '1.5rem' }}>⏳</div>
              <div>Loading trip data…</div>
            </div>
          ) : activeTab === 'expenses' ? (
            <ExpenseList
              expenses={tripData.expenses}
              currency={tripData.currency}
              members={lobby.members}
              selfIdentity={lobby.selfIdentity}
              memberNames={{}}
              onAddExpense={tripData.addExpense}
              onEditExpense={tripData.editExpense}
              onDeleteExpense={tripData.deleteExpense}
            />
          ) : (
            <SettlementView
              balances={tripData.balances}
              currency={tripData.currency}
              members={lobby.members}
              selfIdentity={lobby.selfIdentity}
              memberNames={{}}
              onRecordPayment={tripData.recordPayment}
            />
          )}
        </div>
      </div>

      {showCreateTrip && (
        <CreateWorkspaceModal
          onCreate={handleCreateTrip}
          onClose={() => setShowCreateTrip(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
