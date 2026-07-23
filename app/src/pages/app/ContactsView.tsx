import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';

/**
 * SHELL PASS (ABI-free): types mirror the spec's Contact / Interaction
 * entities exactly, so the data-fetching pass can swap the parent's local
 * state for real hooks over TeamcrmClient without reshaping this component.
 */
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  created_at: number;
}

export interface Interaction {
  id: string;
  author: string;
  contact_id: string;
  kind: string;
  note: string;
  created_at: number;
}

const KINDS = ['call', 'email', 'meeting'];

interface Props {
  contacts: Contact[];
  addContact: (name: string, email: string, phone: string, company: string) => void;
  interactions: Interaction[];
  logInteraction: (contactId: string, kind: string, note: string, author: string) => void;
  editInteraction: (id: string, note: string) => void;
  deleteInteraction: (id: string) => void;
  selfIdentity: string | null;
}

export default function ContactsView({
  contacts,
  addContact,
  interactions,
  logInteraction,
  editInteraction,
  deleteInteraction,
  selfIdentity,
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [kind, setKind] = useState(KINDS[0]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');

  const submitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addContact(name.trim(), email.trim(), phone.trim(), company.trim());
    setName(''); setEmail(''); setPhone(''); setCompany('');
  };

  const submitInteraction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !note.trim()) return;
    logInteraction(selectedId, kind, note.trim(), selfIdentity ?? 'you');
    setNote('');
  };

  const startEdit = (it: Interaction) => { setEditingId(it.id); setEditNote(it.note); };
  const saveEdit = (id: string) => {
    const next = editNote.trim();
    if (!next) return;
    editInteraction(id, next);
    setEditingId(null);
  };

  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const history = interactions.filter((it) => it.contact_id === selectedId).slice().reverse();

  return (
    <Layout>
      <Panel>
        <h3>Contacts</h3>
        <Form onSubmit={submitContact}>
          <input data-testid="field-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input data-testid="field-email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input data-testid="field-phone" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input data-testid="field-company" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Primary type="submit" data-testid="action-add_contact" disabled={!name.trim()}>Add contact</Primary>
        </Form>

        <List>
          {contacts.length === 0 && <Hint>No contacts yet — add the first lead above.</Hint>}
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              data-testid={`item-contact-${c.id}`}
              $active={c.id === selectedId}
              onClick={() => setSelectedId(c.id)}
            >
              <strong>{c.name}</strong>
              {c.company && <span>{c.company}</span>}
              <span className="muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
            </ContactRow>
          ))}
        </List>
      </Panel>

      <Panel>
        {!selected ? (
          <Hint>Select a contact to see their interaction history.</Hint>
        ) : (
          <>
            <h3>{selected.name}</h3>
            <Meta>{[selected.company, selected.email, selected.phone].filter(Boolean).join(' · ')}</Meta>

            <Form onSubmit={submitInteraction}>
              <select data-testid="field-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input data-testid="field-note" placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
              <Primary type="submit" data-testid="action-log_interaction" disabled={!note.trim()}>Log</Primary>
            </Form>

            <List>
              {history.length === 0 && <Hint>No interactions logged yet.</Hint>}
              {history.map((it) => {
                const mine = selfIdentity !== null && it.author === selfIdentity;
                return (
                  <InteractionRow key={it.id} data-testid={`item-interaction-${it.id}`}>
                    <div className="head">
                      <span className="kind">{it.kind}</span>
                      <MemberLabel memberId={it.author} />
                    </div>
                    {editingId === it.id ? (
                      <EditRow>
                        <input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                        <button type="button" onClick={() => saveEdit(it.id)}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </EditRow>
                    ) : (
                      <p>{it.note}</p>
                    )}
                    {mine && editingId !== it.id && (
                      <Actions>
                        <button type="button" data-testid="action-edit_interaction" onClick={() => startEdit(it)}>Edit</button>
                        <button type="button" data-testid="action-delete_interaction" onClick={() => deleteInteraction(it.id)}>Delete</button>
                      </Actions>
                    )}
                  </InteractionRow>
                );
              })}
            </List>
          </>
        )}
      </Panel>
    </Layout>
  );
}

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 20px;
  align-items: start;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;
const Panel = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  padding: 18px;
  h3 { font-size: 15px; font-weight: 800; color: ${C.ink}; margin-bottom: 14px; }
`;
const Meta = styled.p`font-size: 12.5px; color: ${C.muted}; margin-bottom: 14px;`;
const Form = styled.form`
  display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
  input, select {
    flex: 1; min-width: 120px;
    padding: 9px 11px; font-size: 13.5px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const Hint = styled.p`font-size: 13.5px; color: ${C.muted}; padding: 6px 2px;`;
const ContactRow = styled.button<{ $active: boolean }>`
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  padding: 10px 12px; border-radius: 10px; cursor: pointer;
  background: ${(p) => (p.$active ? C.paper : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? C.green : C.line)};
  strong { font-size: 13.5px; color: ${C.ink}; }
  span { font-size: 12px; color: ${C.muted}; }
  .muted { color: ${C.mutedSoft}; }
`;
const InteractionRow = styled.div`
  padding: 10px 12px; border-radius: 10px; background: ${C.paper}; border: 1px solid ${C.line};
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .kind { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.accentText}; }
  p { font-size: 13px; color: ${C.ink}; }
`;
const EditRow = styled.div`
  display: flex; gap: 6px;
  input { flex: 1; padding: 7px 9px; font-size: 13px; border: 1px solid ${C.line}; border-radius: 8px; color: ${C.ink}; background: ${C.paper2}; }
  button { padding: 6px 10px; font-size: 12px; font-weight: 600; border-radius: 8px; border: 1px solid ${C.line}; background: ${C.paper2}; cursor: pointer; color: ${C.ink}; }
`;
const Actions = styled.div`
  display: flex; gap: 8px; margin-top: 8px;
  button {
    font-size: 11.5px; font-weight: 600; color: ${C.mutedSoft};
    background: transparent; border: none; cursor: pointer; padding: 2px 0;
    &:hover { color: ${C.ink}; }
  }
`;
const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent);
  transition: filter 0.18s;
  &:hover:not(:disabled) { filter: brightness(1.06); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
