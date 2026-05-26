import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import { useMarketplace } from '../../hooks/useMarketplace';
import Sidebar from '../../components/Sidebar';
import MarketplaceView from '../../components/MarketplaceView';
import ListingDetailView from '../../components/ListingDetailView';
import MyListingsView from '../../components/MyListingsView';
import MyOffersView from '../../components/MyOffersView';
import TradesView from '../../components/TradesView';
import CreateListingModal from '../../components/CreateListingModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

type View = 'marketplace' | 'my-listings' | 'my-offers' | 'trades';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const marketplace = useMarketplace(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const [activeView, setActiveView] = useState<View>('marketplace');
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateListing, setShowCreateListing] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll members (no SSE for joins)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  const handleSelectListing = useCallback((id: string) => {
    marketplace.selectListing(id);
    setShowDetail(true);
  }, [marketplace]);

  const handleBack = useCallback(() => {
    setShowDetail(false);
    marketplace.selectListing(null);
  }, [marketplace]);

  const handleNavigate = (view: string) => {
    setActiveView(view as View);
    setShowDetail(false);
    marketplace.selectListing(null);
  };

  // Welcome screen when no workspaces exist
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>💎</div>
          <h2 style={{ color: 'var(--color-accent)', margin: 0 }}>Welcome to Collectors Circle</h2>
          <p style={{ color: '#6b7280', maxWidth: 360, textAlign: 'center' }}>
            Create a private circle to start buying and selling collectibles with trusted peers.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={BTN_PRIMARY}
            >
              Create a Circle
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={BTN_SECONDARY}
            >
              Join with Invitation
            </button>
          </div>
          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={async (name) => { await lobby.createLobby(name); setShowCreateWorkspace(false); }}
              onClose={() => setShowCreateWorkspace(false)}
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

  // Waiting for marketplace context to become available
  const marketplaceReady = !!lobby.lobbyContextId && !!marketplace.executorPublicKey;

  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onlineMembers={onlineMembers}
          memberNames={memberNames}
          onSetName={setName}
          activeView={activeView}
          onNavigate={handleNavigate}
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!marketplaceReady ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
              Connecting to circle marketplace…
            </div>
          ) : showDetail && marketplace.selectedListing ? (
            <ListingDetailView
              listing={marketplace.selectedListing}
              offers={marketplace.offers}
              provenance={marketplace.provenance}
              trades={marketplace.trades}
              selfIdentity={lobby.selfIdentity}
              executorPublicKey={marketplace.executorPublicKey}
              memberNames={memberNames}
              onMakeOffer={marketplace.makeOffer}
              onAcceptOffer={marketplace.acceptOffer}
              onCancelListing={marketplace.cancelListing}
              onDepositEscrow={marketplace.depositToEscrow}
              onConfirmReceipt={marketplace.confirmReceipt}
              onBack={handleBack}
            />
          ) : activeView === 'marketplace' ? (
            <MarketplaceView
              listings={marketplace.listings}
              loading={marketplace.loading}
              memberNames={memberNames}
              selfIdentity={lobby.selfIdentity}
              onSelectListing={handleSelectListing}
              onCreateListing={() => setShowCreateListing(true)}
            />
          ) : activeView === 'my-listings' ? (
            <MyListingsView
              listings={marketplace.listings}
              allOffers={marketplace.offers}
              selfIdentity={lobby.selfIdentity}
              executorPublicKey={marketplace.executorPublicKey}
              memberNames={memberNames}
              onSelectListing={handleSelectListing}
              onCancelListing={marketplace.cancelListing}
              onCreateListing={() => setShowCreateListing(true)}
            />
          ) : activeView === 'my-offers' ? (
            <MyOffersView
              allListings={marketplace.listings}
              offers={marketplace.offers}
              selfIdentity={lobby.selfIdentity}
              executorPublicKey={marketplace.executorPublicKey}
              memberNames={memberNames}
              onSelectListing={handleSelectListing}
            />
          ) : (
            <TradesView
              trades={marketplace.trades}
              allListings={marketplace.listings}
              selfIdentity={lobby.selfIdentity}
              executorPublicKey={marketplace.executorPublicKey}
              memberNames={memberNames}
              onDepositEscrow={marketplace.depositToEscrow}
              onConfirmReceipt={marketplace.confirmReceipt}
              onSelectListing={handleSelectListing}
            />
          )}
        </div>
      </div>

      {showCreateListing && (
        <CreateListingModal
          onSubmit={marketplace.createListing}
          onClose={() => setShowCreateListing(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); setShowCreateWorkspace(false); }}
          onClose={() => setShowCreateWorkspace(false)}
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

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.55rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
};
const BTN_SECONDARY: React.CSSProperties = {
  background: 'transparent', color: '#9ca3af', border: '1px solid #374151',
  borderRadius: 6, padding: '0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.9rem',
};
