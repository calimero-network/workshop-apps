/**
 * CreateRoomModal — repurposed as the Character Sheet modal.
 *
 * Shows the player's existing character if one exists, or a creation form
 * if they don't have one yet.
 */
import React, { useState } from 'react';
import { Character } from '../api/table/TableClient';
import { CharCreateParams } from '../hooks/useChatRoom';

interface CharacterSheetModalProps {
  myCharacter: Character | null;
  tableExecutorKey: string | null;
  onCreateCharacter: (params: CharCreateParams) => Promise<void>;
  onClose: () => void;
}

const ABILITIES: { key: keyof CharCreateParams; label: string }[] = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
];

const DND_CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter',
  'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer',
  'Warlock', 'Wizard',
];

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
}

const ACCENT = 'var(--color-accent, #d4af37)';
const PRIMARY = 'var(--color-primary, #1a1a2e)';

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  background: '#0b0b18',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: '0.88rem',
  outline: 'none',
};

export default function CreateRoomModal({
  myCharacter,
  tableExecutorKey: _tableExecutorKey,
  onCreateCharacter,
  onClose,
}: CharacterSheetModalProps) {
  const [name, setName] = useState('');
  const [charClass, setCharClass] = useState('Fighter');
  const [stats, setStats] = useState<Record<string, number>>({
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateCharacter({
        name: name.trim(),
        class: charClass,
        str: stats.str,
        dex: stats.dex,
        con: stats.con,
        int: stats.int,
        wis: stats.wis,
        cha: stats.cha,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const hpPct = myCharacter
    ? myCharacter.hp_max > 0 ? (myCharacter.hp_current / myCharacter.hp_max) * 100 : 0
    : 0;
  const hpColor = hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0d0d1a', borderRadius: 10, padding: '1.5rem',
          width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
          border: `1px solid ${ACCENT}`, boxShadow: `0 0 32px ${ACCENT}33`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: ACCENT, fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>
          📋 Character Sheet
        </h3>

        {myCharacter ? (
          /* ─── View existing character ─── */
          <div>
            <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '1rem' }}>
              Your adventurer is ready for battle.
            </p>

            <div style={{
              background: PRIMARY, border: `1px solid ${ACCENT}22`,
              borderRadius: 8, padding: '1rem', marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: ACCENT }}>
                    {myCharacter.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{myCharacter.class_}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: hpColor }}>
                    {myCharacter.hp_current}
                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 400 }}>
                      /{myCharacter.hp_max}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>HP</div>
                </div>
              </div>

              {/* HP bar */}
              <div style={{ marginTop: '0.5rem', height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${hpPct}%`, background: hpColor, transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Ability scores grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem',
            }}>
              {[
                { label: 'STR', value: myCharacter.strength },
                { label: 'DEX', value: myCharacter.dexterity },
                { label: 'CON', value: myCharacter.constitution },
                { label: 'INT', value: myCharacter.intelligence },
                { label: 'WIS', value: myCharacter.wisdom },
                { label: 'CHA', value: myCharacter.charisma },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: '#0b0b18', border: '1px solid #2a1e3a',
                    borderRadius: 6, padding: '0.5rem', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0' }}>{value}</div>
                  <div style={{ fontSize: '0.75rem', color: ACCENT }}>{abilityMod(value)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.4rem 1.2rem', background: 'transparent',
                  color: ACCENT, border: `1px solid ${ACCENT}`,
                  borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem',
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* ─── Create character form ─── */
          <div>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              You don't have a character at this table yet. Create one to join the adventure!
            </p>

            {/* Name */}
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>
              Character Name *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aragorn"
              style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem' }}
            />

            {/* Class */}
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>
              Class
            </label>
            <select
              value={charClass}
              onChange={(e) => setCharClass(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem' }}
            >
              {DND_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Ability scores */}
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              Ability Scores <span style={{ color: '#475569' }}>(standard: 15, 14, 13, 12, 10, 8)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {ABILITIES.map(({ key, label }) => (
                <div key={key}>
                  <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginBottom: '0.15rem' }}>
                    {label.slice(0, 3).toUpperCase()}
                    <span style={{ color: ACCENT, fontSize: '0.75rem', marginLeft: 4 }}>
                      {abilityMod(stats[key] ?? 10)}
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={stats[key] ?? 10}
                    onChange={(e) =>
                      setStats((prev) => ({ ...prev, [key]: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 10)) }))
                    }
                    style={{ ...inputStyle, width: '100%', textAlign: 'center' }}
                  />
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '0.75rem' }}>
              HP max is derived from your Constitution modifier (d10 base + CON mod).
            </p>

            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '0.4rem 1rem', background: 'transparent',
                  color: '#94a3b8', border: '1px solid #334155',
                  borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                style={{
                  padding: '0.4rem 1.2rem',
                  background: name.trim() && !creating ? ACCENT : '#1e293b',
                  color: name.trim() && !creating ? '#0d0d1a' : '#64748b',
                  border: 'none', borderRadius: 6,
                  cursor: name.trim() && !creating ? 'pointer' : 'default',
                  fontSize: '0.88rem', fontWeight: 700,
                }}
              >
                {creating ? 'Creating…' : 'Enter the Adventure'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
