import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Button,
  Input,
  Navbar as MeroNavbar,
  NavbarBrand,
  NavbarMenu,
  NavbarItem,
  Menu,
  MenuItem,
  MenuGroup,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  useToast,
  CopyToClipboard,
  Text,
  Grid,
  GridItem,
} from '@calimero-network/mero-ui';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useNavigate } from 'react-router-dom';
import { SimplechatClient } from '../../generated/SimplechatClient';
import translations from '../../constants/en.global.json';

export default function HomePage() {
  const navigate = useNavigate();
  const {
    isAuthenticated,
    contextId,
    contextIdentity,
    nodeUrl,
    applicationId,
    mero,
    logout,
  } = useMero();
  const { show } = useToast();

  const [inviteCode, setInviteCode] = useState<string>('');
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEnteringChat, setIsEnteringChat] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const client = useMemo(
    () =>
      mero && contextId && contextIdentity
        ? new SimplechatClient(mero, contextId, contextIdentity)
        : null,
    [mero, contextId, contextIdentity],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const doLogout = useCallback(() => {
    logout();
    window.location.replace('/');
  }, [logout]);

  // Create a new invitation and display the code
  const handleCreateInvitation = useCallback(async () => {
    if (!client || !contextIdentity) return;
    setIsCreating(true);
    try {
      const code = await client.createInvitation({ creatorId: contextIdentity });
      setGeneratedCode(code);
      show({ title: 'Invitation created! Share the code with your friend.', variant: 'success' });
    } catch (error) {
      show({
        title:
          error instanceof Error
            ? error.message
            : translations.home.errors.createInvitationFailed,
        variant: 'error',
      });
    } finally {
      setIsCreating(false);
    }
  }, [client, contextIdentity, show]);

  // Creator uses their generated code to look up the invitation and open the chat
  const handleEnterChat = useCallback(async () => {
    if (!client || !generatedCode) return;
    setIsEnteringChat(true);
    try {
      const invitation = await client.getInvitation({ code: generatedCode });
      navigate(`/chat?chatId=${encodeURIComponent(invitation.id)}&code=${encodeURIComponent(generatedCode)}`);
    } catch (error) {
      show({
        title:
          error instanceof Error
            ? error.message
            : translations.home.errors.getInvitationFailed,
        variant: 'error',
      });
    } finally {
      setIsEnteringChat(false);
    }
  }, [client, generatedCode, navigate, show]);

  // Acceptor: enter a code to join someone else's chat
  const handleJoinChat = useCallback(async () => {
    if (!client || !contextIdentity || !inviteCode.trim()) return;
    setIsJoining(true);
    try {
      const chatId = await client.acceptInvitation({
        code: inviteCode.trim(),
        acceptorId: contextIdentity,
      });
      show({ title: 'Joined chat successfully!', variant: 'success' });
      navigate(`/chat?chatId=${encodeURIComponent(chatId)}`);
    } catch (error) {
      show({
        title:
          error instanceof Error
            ? error.message
            : translations.home.errors.acceptInvitationFailed,
        variant: 'error',
      });
    } finally {
      setIsJoining(false);
    }
  }, [client, contextIdentity, inviteCode, navigate, show]);

  // Keep subscription active (for real-time updates if needed later)
  const contextIds = useMemo(() => (contextId ? [contextId] : []), [contextId]);
  useSubscription(contextIds, () => {});

  const PRIMARY = '#4F46E5';
  const ACCENT = '#10B981';

  return (
    <>
      <MeroNavbar variant="elevated" size="md">
        <NavbarBrand text="Simple Chat" />
        <NavbarMenu align="center">
          {contextId && (
            <div
              style={{
                display: 'flex',
                gap: '1.5rem',
                alignItems: 'center',
                fontSize: '0.875rem',
                color: '#9ca3af',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {nodeUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Text size="sm" color="muted">Node:</Text>
                  <Text size="sm" style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                    {nodeUrl.replace('http://', '').replace('https://', '')}
                  </Text>
                  <CopyToClipboard text={nodeUrl} variant="icon" size="small" successMessage="Node URL copied!" />
                </div>
              )}
              {applicationId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Text size="sm" color="muted">App ID:</Text>
                  <Text size="sm" style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                    {applicationId.slice(0, 8)}...{applicationId.slice(-8)}
                  </Text>
                  <CopyToClipboard text={applicationId} variant="icon" size="small" successMessage="Application ID copied!" />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Text size="sm" color="muted">Context:</Text>
                <Text size="sm" style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
                  {contextId.slice(0, 8)}...{contextId.slice(-8)}
                </Text>
                <CopyToClipboard text={contextId} variant="icon" size="small" successMessage="Context ID copied!" />
              </div>
            </div>
          )}
        </NavbarMenu>
        <NavbarMenu align="right">
          {isAuthenticated ? (
            <Menu variant="compact" size="md">
              <MenuGroup>
                <MenuItem onClick={doLogout}>{translations.home.logout}</MenuItem>
              </MenuGroup>
            </Menu>
          ) : (
            <NavbarItem>
              <Button variant="primary" onClick={() => navigate('/')}>
                Connect
              </Button>
            </NavbarItem>
          )}
        </NavbarMenu>
      </MeroNavbar>

      <div style={{ minHeight: '100vh', backgroundColor: '#111111', color: 'white' }}>
        <Grid
          columns={1}
          gap={32}
          maxWidth="100%"
          justify="center"
          align="center"
          style={{ minHeight: '100vh', padding: '2rem' }}
        >
          <GridItem>
            <main
              style={{
                width: '100%',
                maxWidth: '900px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '2rem',
              }}
            >
              {/* Identity badge */}
              {contextIdentity && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    background: 'rgba(79, 70, 229, 0.12)',
                    border: `1px solid ${PRIMARY}44`,
                    width: 'fit-content',
                    margin: '0 auto',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: ACCENT,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="sm" style={{ color: '#c7d2fe', fontFamily: 'monospace' }}>
                    {contextIdentity.slice(0, 12)}...{contextIdentity.slice(-8)}
                  </Text>
                  <CopyToClipboard text={contextIdentity} variant="icon" size="small" successMessage="Identity copied!" />
                </div>
              )}

              {/* Two-panel layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: '1.5rem',
                  width: '100%',
                }}
              >
                {/* LEFT: Create a Chat */}
                <Card
                  variant="rounded"
                  style={{
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    border: `1px solid ${PRIMARY}55`,
                    boxShadow: `0 0 30px ${PRIMARY}22`,
                  }}
                >
                  <CardHeader
                    style={{
                      borderBottom: `1px solid ${PRIMARY}33`,
                      padding: '1.25rem 1.5rem',
                    }}
                  >
                    <CardTitle
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: '700',
                        color: '#e0e7ff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: PRIMARY,
                        }}
                      />
                      {translations.home.createChat}
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0, lineHeight: '1.5' }}>
                      {translations.home.createDescription}
                    </p>

                    <Button
                      variant="primary"
                      onClick={handleCreateInvitation}
                      style={{
                        background: PRIMARY,
                        minHeight: '2.75rem',
                        fontWeight: '600',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isCreating ? 'Generating...' : translations.home.generateCode}
                    </Button>

                    {generatedCode && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          padding: '1rem',
                          borderRadius: '8px',
                          background: `${ACCENT}11`,
                          border: `1px solid ${ACCENT}44`,
                        }}
                      >
                        <Text size="sm" style={{ color: ACCENT, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {translations.home.generatedCodeLabel}
                        </Text>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '6px',
                            padding: '0.625rem 0.875rem',
                          }}
                        >
                          <code
                            style={{
                              flex: 1,
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              color: '#e5e7eb',
                              wordBreak: 'break-all',
                            }}
                          >
                            {generatedCode}
                          </code>
                          <CopyToClipboard text={generatedCode} variant="icon" size="small" successMessage="Code copied!" />
                        </div>
                        <Button
                          variant="success"
                          onClick={handleEnterChat}
                          style={{ minHeight: '2.5rem', fontWeight: '600' }}
                        >
                          {isEnteringChat ? 'Opening...' : translations.home.enterChat}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* RIGHT: Join a Chat */}
                <Card
                  variant="rounded"
                  style={{
                    background: 'linear-gradient(135deg, #0f2027 0%, #1a2a1a 100%)',
                    border: `1px solid ${ACCENT}55`,
                    boxShadow: `0 0 30px ${ACCENT}22`,
                  }}
                >
                  <CardHeader
                    style={{
                      borderBottom: `1px solid ${ACCENT}33`,
                      padding: '1.25rem 1.5rem',
                    }}
                  >
                    <CardTitle
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: '700',
                        color: '#d1fae5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: ACCENT,
                        }}
                      />
                      {translations.home.joinChat}
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0, lineHeight: '1.5' }}>
                      {translations.home.joinDescription}
                    </p>

                    <div
                      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === 'Enter') handleJoinChat();
                      }}
                    >
                      <Input
                        type="text"
                        placeholder={translations.home.inviteCodePlaceholder}
                        value={inviteCode}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteCode(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <Button
                      variant="success"
                      onClick={handleJoinChat}
                      style={{
                        background: ACCENT,
                        minHeight: '2.75rem',
                        fontWeight: '600',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isJoining ? 'Joining...' : translations.home.joinButton}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </main>
          </GridItem>
        </Grid>
      </div>
    </>
  );
}
