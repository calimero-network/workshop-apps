/**
 * RoomView (Table View) — the main D&D game interface.
 *
 * Layout (two-column):
 *   Left (280px):  Character roster + DM control panel (DM only)
 *   Right (flex):  Game log + chat input
 *
 * CharacterSheet modal overlays the view.
 */

import React, { useRef, useEffect, useState } from 'react';
import { useChatRoom } from '../hooks/useChatRoom';
import { Character, GameSession } from '../api/table/TableClient';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import CreateRoomModal from './CreateRoomModal';

interface RoomViewProps {
  contextId: string;
  executorPublicKey: string | null;
  onRoomDeleted?: () => void;
}

const ACCENT = 'var(--color-accent, #d4af37)';
const PRIMARY = 'var(--color-primary, #1a1a2e)';

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type Ability = typeof ABILITIES[number];

const GAME_STATES = ['exploring', 'combat', 'resting', 'lobby'] as const;

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function stateBadge(state: string) {
  const map: Record<string, { icon: string; color: string }> = {
    combat: { icon: '⚔️', color: '#ef4444' },
    exploring: { icon: '🗺️', color: '#22c55e' },
    resting: { icon: '🌙', color: '#3b82f6' },
    lobby: { icon: '🏰', color: '#a3a3a3' },
  };
  const s = map[state] ?? { icon: '❓', color: '#888' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      padding: '0.15rem 0.5rem', borderRadius: 4,
      background: `${s.color}22`, color: s.color,
      fontSize: '0.75rem', fontWeight: 600,
    }}>
      {s.icon} {state}
    </span>
  );
}

// ---- Character Panel ----

interface CharacterCardProps {
  char: Character;
  isSelf: boolean;
  isDm: boolean;
  onAdjustHp: (delta: number) => void;
  memberName?: string;
}

function CharacterCard({ char, isSelf, isDm, onAdjustHp, memberName }: CharacterCardProps) {
  const [delta, setDelta] = useState('');
  const hpPct = char.hp_max > 0 ? (char.hp_current / char.hp_max) * 100 : 0;
  const hpColor = hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      padding: '0.6rem 0.75rem',
      borderRadius: 6,
      background: isSelf ? `${ACCENT}11` : '#0f0f1a',
      border: `1px solid ${isSelf ? ACCENT : '#2a1e3a'}`,
      marginBottom: '0.4rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, color: isSelf ? ACCENT : '#e2e8f0', fontSize: '0.9rem' }}>
            {char.name}
            {isSelf && <span style={{ fontSize: '0.65rem', color: ACCENT, marginLeft: 4 }}>(you)</span>}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            {char.class_} · {memberName ? memberName : shortenId(char.author)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: hpColor, fontSize: '0.88rem' }}>
            {char.hp_current}<span style={{ color: '#64748b', fontWeight: 400 }}>/{char.hp_max}</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>HP</div>
        </div>
      </div>

      {/* HP bar */}
      <div style={{
        marginTop: '0.35rem', height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden',
      }}>
        <div style={{ height: '100%', width: `${hpPct}%`, background: hpColor, transition: 'width 0.3s' }} />
      </div>

      {/* DM HP adjuster */}
      {isDm && (
        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', alignItems: 'center' }}>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="±HP"
            style={{
              width: 60, padding: '0.2rem 0.3rem', background: '#111',
              border: '1px solid #334155', borderRadius: 3, color: '#e2e8f0',
              fontSize: '0.75rem', outline: 'none',
            }}
          />
          <button
            onClick={() => {
              const d = parseInt(delta, 10);
              if (!isNaN(d)) { onAdjustHp(d); setDelta(''); }
            }}
            style={{
              padding: '0.2rem 0.45rem', background: '#1e3a5f',
              color: '#93c5fd', border: 'none', borderRadius: 3,
              cursor: 'pointer', fontSize: '0.72rem',
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ---- DM Control Panel ----

interface DmPanelProps {
  gameInfo: GameSession | null;
  characters: Character[];
  tableExecutorKey: string | null;
  onRollForPlayer: (playerId: string, ability: Ability, reason: string) => Promise<void>;
  onRollNpc: (npcName: string, modifier: number, reason: string) => Promise<void>;
  onSetDifficulty: (dc: number) => Promise<void>;
  onSetGameState: (state: string) => Promise<void>;
  onSetTurnOrder: (players: string[]) => Promise<void>;
  onAdvanceTurn: () => Promise<void>;
  onCreateGame: (name: string) => Promise<void>;
}

function DmPanel({
  gameInfo, characters, tableExecutorKey,
  onRollForPlayer, onRollNpc, onSetDifficulty,
  onSetGameState, onSetTurnOrder, onAdvanceTurn, onCreateGame,
}: DmPanelProps) {
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [selectedAbility, setSelectedAbility] = useState<Ability>('strength');
  const [rollReason, setRollReason] = useState('');
  const [npcName, setNpcName] = useState('');
  const [npcMod, setNpcMod] = useState('0');
  const [npcReason, setNpcReason] = useState('');
  const [dc, setDc] = useState('');
  const [gameName, setGameName] = useState('');
  const [busy, setBusy] = useState(false);
  const [turnOrder, setTurnOrder] = useState(gameInfo?.turn_order.join(', ') ?? '');

  // Sync turn order field when gameInfo changes
  useEffect(() => {
    if (gameInfo?.turn_order) setTurnOrder(gameInfo.turn_order.join(', '));
  }, [gameInfo?.turn_order]);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); } finally { setBusy(false); }
  };

  const sectionLabel = (label: string) => (
    <div style={{
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em',
      color: ACCENT, marginTop: '0.75rem', marginBottom: '0.3rem',
    }}>
      {label}
    </div>
  );

  const btn = (label: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        padding: '0.3rem 0.6rem', background: busy || disabled ? '#1e293b' : PRIMARY,
        color: busy || disabled ? '#64748b' : ACCENT,
        border: `1px solid ${busy || disabled ? '#334155' : ACCENT}`,
        borderRadius: 4, cursor: busy || disabled ? 'default' : 'pointer',
        fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.3rem 0.4rem', background: '#111',
    border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0',
    fontSize: '0.78rem', outline: 'none', marginBottom: '0.25rem',
  };

  const isLobbyState = gameInfo?.game_state === 'lobby' || !gameInfo?.name;

  return (
    <div style={{
      padding: '0.6rem 0.7rem',
      background: '#070710',
      borderTop: `1px solid #2a1e3a`,
      overflowY: 'auto',
      maxHeight: '55vh',
    }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: ACCENT, marginBottom: '0.3rem' }}>
        🎲 DM Controls
      </div>

      {/* Create / name game */}
      {isLobbyState && (
        <>
          {sectionLabel('START GAME')}
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <input
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Game name…"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            />
            {btn('Start', () => wrap(() => onCreateGame(gameName.trim() || 'Unnamed Adventure')))}
          </div>
        </>
      )}

      {/* Game state */}
      {sectionLabel('GAME STATE')}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {GAME_STATES.filter((s) => s !== 'lobby').map((s) => (
          <button
            key={s}
            onClick={() => wrap(() => onSetGameState(s))}
            disabled={busy || gameInfo?.game_state === s}
            style={{
              padding: '0.25rem 0.5rem',
              background: gameInfo?.game_state === s ? `${ACCENT}22` : 'transparent',
              color: gameInfo?.game_state === s ? ACCENT : '#94a3b8',
              border: `1px solid ${gameInfo?.game_state === s ? ACCENT : '#334155'}`,
              borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Set DC */}
      {sectionLabel('SET DIFFICULTY (DC)')}
      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
        <input
          type="number"
          value={dc}
          onChange={(e) => setDc(e.target.value)}
          placeholder={gameInfo?.current_dc != null ? String(gameInfo.current_dc) : 'e.g. 15'}
          style={{ ...inputStyle, marginBottom: 0, width: 80 }}
        />
        {btn('Set DC', () => {
          const n = parseInt(dc, 10);
          if (!isNaN(n)) wrap(() => onSetDifficulty(n));
        })}
      </div>

      {/* Roll for player */}
      {sectionLabel('ROLL FOR PLAYER')}
      <select
        value={selectedPlayer}
        onChange={(e) => setSelectedPlayer(e.target.value)}
        style={{ ...inputStyle }}
      >
        <option value="">Select player…</option>
        {characters.map((c) => (
          <option key={c.author} value={c.author}>{c.name} ({shortenId(c.author)})</option>
        ))}
      </select>
      <select
        value={selectedAbility}
        onChange={(e) => setSelectedAbility(e.target.value as Ability)}
        style={{ ...inputStyle }}
      >
        {ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <input
        value={rollReason}
        onChange={(e) => setRollReason(e.target.value)}
        placeholder="Reason (e.g. attack roll)"
        style={inputStyle}
      />
      {btn('🎲 Roll d20', () => {
        if (!selectedPlayer) return;
        wrap(() => onRollForPlayer(selectedPlayer, selectedAbility, rollReason || 'check'));
      }, !selectedPlayer)}

      {/* Roll NPC */}
      {sectionLabel('ROLL FOR NPC / MONSTER')}
      <input
        value={npcName}
        onChange={(e) => setNpcName(e.target.value)}
        placeholder="NPC / monster name"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.25rem' }}>
        <input
          type="number"
          value={npcMod}
          onChange={(e) => setNpcMod(e.target.value)}
          placeholder="Modifier"
          style={{ ...inputStyle, width: 80, marginBottom: 0 }}
        />
        <input
          value={npcReason}
          onChange={(e) => setNpcReason(e.target.value)}
          placeholder="Reason"
          style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
        />
      </div>
      {btn('🎲 Roll NPC', () => {
        const mod = parseInt(npcMod, 10);
        if (!npcName.trim()) return;
        wrap(() => onRollNpc(npcName.trim(), isNaN(mod) ? 0 : mod, npcReason || 'roll'));
      }, !npcName.trim())}

      {/* Turn order */}
      {sectionLabel('COMBAT TURN ORDER')}
      <textarea
        value={turnOrder}
        onChange={(e) => setTurnOrder(e.target.value)}
        placeholder={'Player pubkeys, comma-separated (e.g. abc123, def456)'}
        rows={2}
        style={{
          ...inputStyle,
          resize: 'none',
          fontFamily: 'monospace',
          fontSize: '0.72rem',
        }}
      />
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        {btn('Set Order', () => {
          const players = turnOrder.split(',').map((s) => s.trim()).filter(Boolean);
          if (players.length > 0) wrap(() => onSetTurnOrder(players));
        })}
        {btn('Next Turn ▶', () => wrap(onAdvanceTurn))}
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function RoomView({ contextId, executorPublicKey }: RoomViewProps) {
  const table = useChatRoom(contextId, executorPublicKey);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [showCharSheet, setShowCharSheet] = useState(false);

  // Auto-scroll game log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [table.events]);

  const gameInfo = table.gameInfo;
  const gameName = gameInfo?.name || 'Loading…';
  const gameState = gameInfo?.game_state ?? 'lobby';
  const currentTurn = gameInfo?.current_turn_player;
  const currentDc = gameInfo?.current_dc;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>

      {/* ── Game Header ── */}
      <div style={{
        padding: '0.6rem 1rem',
        borderBottom: '1px solid #2a1e3a',
        background: PRIMARY,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexShrink: 0,
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: ACCENT, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🏰 {gameName}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {stateBadge(gameState)}
          {currentDc != null && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>DC&nbsp;{currentDc}</span>
          )}
          {currentTurn && (
            <span style={{
              fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4,
              background: '#7c3aed22', color: '#a78bfa',
            }}>
              ⚡ {shortenId(currentTurn)}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCharSheet(true)}
          style={{
            padding: '0.25rem 0.6rem', background: 'transparent',
            color: ACCENT, border: `1px solid ${ACCENT}`,
            borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
          }}
        >
          📋 My Character
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: Character Roster + DM Panel */}
        <div style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid #2a1e3a',
          display: 'flex',
          flexDirection: 'column',
          background: '#0b0b18',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '0.5rem 0.6rem', overflowY: 'auto', flex: 1 }}>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em',
              color: ACCENT, marginBottom: '0.4rem',
            }}>
              CHARACTERS
            </div>
            {table.loading && table.characters.length === 0 && (
              <div style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', padding: '1rem' }}>
                Loading…
              </div>
            )}
            {table.characters.length === 0 && !table.loading && (
              <div style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', padding: '0.5rem' }}>
                No characters yet
              </div>
            )}
            {table.characters.map((c) => (
              <CharacterCard
                key={c.id}
                char={c}
                isSelf={c.author === table.tableExecutorKey}
                isDm={table.isDm}
                onAdjustHp={(d) => void table.adjustHp(c.id, d)}
              />
            ))}
          </div>

          {/* DM panel lives below character roster */}
          {table.isDm && gameInfo && (
            <DmPanel
              gameInfo={gameInfo}
              characters={table.characters}
              tableExecutorKey={table.tableExecutorKey}
              onRollForPlayer={table.rollForPlayer}
              onRollNpc={table.rollNpc}
              onSetDifficulty={table.setDifficulty}
              onSetGameState={table.setGameState}
              onSetTurnOrder={table.setTurnOrder}
              onAdvanceTurn={table.advanceTurn}
              onCreateGame={table.createGame}
            />
          )}
        </div>

        {/* Right: Game Log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}>
            {table.loading && table.events.length === 0 && (
              <div style={{ color: '#475569', textAlign: 'center', padding: '2rem' }}>
                Loading game log…
              </div>
            )}
            {!table.loading && table.events.length === 0 && (
              <div style={{ color: '#475569', textAlign: 'center', padding: '2rem' }}>
                The adventure begins! Post a message or the DM can start the game.
              </div>
            )}
            {table.error && (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem' }}>
                Error: {table.error.message}
              </div>
            )}
            {table.events.map((evt) => (
              <MessageBubble
                key={evt.id}
                event={evt}
                isSelf={evt.author === table.tableExecutorKey}
              />
            ))}
            <div ref={logEndRef} />
          </div>

          <MessageInput onSend={table.postMessage} />
        </div>
      </div>

      {/* Character Sheet Modal */}
      {showCharSheet && (
        <CreateRoomModal
          myCharacter={table.myCharacter}
          tableExecutorKey={table.tableExecutorKey}
          onCreateCharacter={table.createCharacter}
          onClose={() => setShowCharSheet(false)}
        />
      )}
    </div>
  );
}
