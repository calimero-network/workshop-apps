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
  CardContent,
  useToast,
  Text,
  Grid,
  GridItem,
} from '@calimero-network/mero-ui';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SimplechatClient, MessageView } from '../../generated/SimplechatClient';
import translations from '../../constants/en.global.json';

/**
 * Normalise a timestamp coming from the Calimero backend to milliseconds.
 * The value may be in nanoseconds, microseconds, seconds, or milliseconds.
 */
function normalizeTimestamp(ts: number): number {
  if (ts > 1e18) return Math.floor(ts / 1e6);  // nanoseconds → ms
  if (ts > 1e15) return Math.floor(ts / 1e3);  // microseconds → ms
  if (ts < 1e12) return ts * 1000;              // seconds → ms
  return ts;                                     // already ms
}

function formatTime(ts: number): string {
  const ms = normalizeTimestamp(ts);
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number): string {
  const ms = normalizeTimestamp(ts);
  const d = new Date(ms);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const PRIMARY = '#4F46E5';
const ACCENT = '#10B981';

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatId = searchParams.get('chatId') ?? '';

  const {
    isAuthenticated,
    contextId,
    contextIdentity,
    mero,
    logout,
  } = useMero();
  const { show } = useToast();

  const [messages, setMessages] = useState<MessageView[]>([]);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const loadingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const client = useMemo(
    () =>
      mero && contextId && contextIdentity
        ? new SimplechatClient(mero, contextId, contextIdentity)
        : null,
    [mero, contextId, contextIdentity],
  );

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Redirect to home if no chatId in URL
  useEffect(() => {
    if (isAuthenticated && !chatId) navigate('/home');
  }, [isAuthenticated, chatId, navigate]);

  const loadMessages = useCallback(async () => {
    if (loadingRef.current || !client || !chatId) return;
    loadingRef.current = true;
    try {
      const data = await client.getMessages({ chatId });
      const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sorted);
    } catch (error) {
      console.error('loadMessages error:', error);
    } finally {
      loadingRef.current = false;
    }
  }, [client, chatId]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated && contextId && contextIdentity && chatId) {
      loadMessages();
    }
  }, [isAuthenticated, contextId, contextIdentity, chatId, loadMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time updates via SSE
  const contextIds = useMemo(() => (contextId ? [contextId] : []), [contextId]);
  const loadMessagesRef = useRef(loadMessages);
  loadMessagesRef.current = loadMessages;
  useSubscription(contextIds, () => {
    loadMessagesRef.current();
  });

  const doLogout = useCallback(() => {
    logout();
    window.location.replace('/');
  }, [logout]);

  const handleSend = useCallback(async () => {
    if (!client || !contextIdentity || !text.trim() || !chatId) return;
    const messageText = text.trim();
    setIsSending(true);
    setText('');
    try {
      await client.sendMessage({
        chatId,
        senderId: contextIdentity,
        text: messageText,
      });
      await loadMessages();
    } catch (error) {
      show({
        title:
          error instanceof Error
            ? error.message
            : translations.home.errors.sendFailed,
        variant: 'error',
      });
      setText(messageText); // restore on failure
    } finally {
      setIsSending(false);
    }
  }, [client, contextIdentity, text, chatId, loadMessages, show]);

  // Group messages by date for display
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: MessageView[] }[] = [];
    let lastDate = '';
    for (const msg of messages) {
      const date = formatDate(msg.timestamp);
      if (date !== lastDate) {
        groups.push({ date, messages: [] });
        lastDate = date;
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  }, [messages]);

  const isMe = (senderId: string) => senderId === contextIdentity;

  return (
    <>
      <MeroNavbar variant="elevated" size="md">
        <NavbarBrand text="Simple Chat" />
        <NavbarMenu align="center">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: ACCENT,
                flexShrink: 0,
              }}
            />
            <Text size="sm" style={{ color: '#9ca3af' }}>Chat ID:</Text>
            <Text size="sm" style={{ fontFamily: 'monospace', color: '#e5e7eb' }}>
              {chatId ? `${chatId.slice(0, 8)}...${chatId.slice(-8)}` : '—'}
            </Text>
          </div>
        </NavbarMenu>
        <NavbarMenu align="right">
          <Menu variant="compact" size="md">
            <MenuGroup>
              <MenuItem onClick={() => navigate('/home')}>New Chat</MenuItem>
              <MenuItem onClick={doLogout}>{translations.home.logout}</MenuItem>
            </MenuGroup>
          </Menu>
        </NavbarMenu>
      </MeroNavbar>

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#111111',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Grid
          columns={1}
          gap={0}
          maxWidth="100%"
          justify="center"
          align="center"
          style={{ flex: 1, padding: '1.5rem 1rem', minHeight: 'calc(100vh - 64px)' }}
        >
          <GridItem>
            <div
              style={{
                width: '100%',
                maxWidth: '720px',
                margin: '0 auto',
                height: 'calc(100vh - 100px)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Message thread */}
              <Card
                variant="rounded"
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
                  border: `1px solid ${PRIMARY}44`,
                  marginBottom: '0.75rem',
                }}
              >
                <CardContent
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0',
                  }}
                >
                  {messages.length === 0 ? (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        color: '#4b5563',
                        padding: '3rem 2rem',
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          background: `${PRIMARY}22`,
                          border: `2px solid ${PRIMARY}44`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                        }}
                      >
                        💬
                      </div>
                      <Text size="sm" style={{ color: '#6b7280', textAlign: 'center' }}>
                        No messages yet. Say hello!
                      </Text>
                    </div>
                  ) : (
                    <>
                      {groupedMessages.map((group) => (
                        <div key={group.date}>
                          {/* Date separator */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              margin: '1rem 0 0.75rem',
                            }}
                          >
                            <div style={{ flex: 1, height: '1px', background: '#2d3748' }} />
                            <Text
                              size="sm"
                              style={{ color: '#4b5563', fontSize: '0.75rem', flexShrink: 0 }}
                            >
                              {group.date}
                            </Text>
                            <div style={{ flex: 1, height: '1px', background: '#2d3748' }} />
                          </div>

                          {/* Messages */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {group.messages.map((msg) => {
                              const mine = isMe(msg.senderId);
                              return (
                                <div
                                  key={msg.id}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: mine ? 'flex-end' : 'flex-start',
                                  }}
                                >
                                  {/* Sender label (only for other person) */}
                                  {!mine && (
                                    <Text
                                      size="sm"
                                      style={{
                                        color: '#6b7280',
                                        fontSize: '0.7rem',
                                        marginBottom: '0.2rem',
                                        marginLeft: '0.25rem',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {msg.senderId.slice(0, 8)}...
                                    </Text>
                                  )}

                                  {/* Bubble */}
                                  <div
                                    style={{
                                      maxWidth: '70%',
                                      padding: '0.6rem 0.9rem',
                                      borderRadius: mine
                                        ? '18px 18px 4px 18px'
                                        : '18px 18px 18px 4px',
                                      background: mine
                                        ? `linear-gradient(135deg, ${PRIMARY} 0%, #6366f1 100%)`
                                        : 'rgba(255,255,255,0.07)',
                                      border: mine ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                      boxShadow: mine
                                        ? `0 2px 12px ${PRIMARY}44`
                                        : 'none',
                                    }}
                                  >
                                    <p
                                      style={{
                                        margin: 0,
                                        fontSize: '0.9rem',
                                        lineHeight: '1.45',
                                        color: mine ? '#ffffff' : '#e5e7eb',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {msg.text}
                                    </p>
                                  </div>

                                  {/* Timestamp */}
                                  <Text
                                    size="sm"
                                    style={{
                                      color: '#4b5563',
                                      fontSize: '0.68rem',
                                      marginTop: '0.2rem',
                                      marginLeft: mine ? 0 : '0.25rem',
                                      marginRight: mine ? '0.25rem' : 0,
                                    }}
                                  >
                                    {formatTime(msg.timestamp)}
                                  </Text>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Input bar */}
              <Card
                variant="rounded"
                style={{
                  background: '#1a1a2e',
                  border: `1px solid ${PRIMARY}44`,
                  flexShrink: 0,
                }}
              >
                <CardContent style={{ padding: '0.75rem' }}>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
                  >
                    <Input
                      type="text"
                      placeholder="Type a message..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      style={{
                        background: PRIMARY,
                        minHeight: '2.5rem',
                        minWidth: '80px',
                        fontWeight: '600',
                        flexShrink: 0,
                      }}
                    >
                      {isSending ? '...' : 'Send'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </GridItem>
        </Grid>
      </div>
    </>
  );
}
