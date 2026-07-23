import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import type { Contact } from './ContactsView';

/**
 * SHELL PASS (ABI-free): Deal mirrors the spec's Deal entity exactly, so the
 * data-fetching pass can swap the parent's local state for real hooks over
 * TeamcrmClient without reshaping this component.
 */
export interface Deal {
  id: string;
  contact_id: string;
  title: string;
  stage: string;
  value: number;
  contract_details: string;
  created_at: number;
}

// Mirrors the flow in the spec's example (Lead → Contacted → Proposal → Won).
const STAGES = ['Lead', 'Contacted', 'Proposal', 'Won'];

interface Props {
  contacts: Contact[];
  deals: Deal[];
  createDeal: (contactId: string, title: string, value: number) => void;
  updateDealStage: (dealId: string, stage: string) => void;
  setContractDetails: (dealId: string, details: string) => void;
}

export default function PipelineView({ contacts, deals, createDeal, updateDealStage, setContractDetails }: Props) {
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [draftDetails, setDraftDetails] = useState<Record<string, string>>({});

  // Controlled-select default: seed a real value once contacts load, rather
  // than falling back inline (a fallback that matches the picked option never
  // fires onChange).
  useEffect(() => {
    if (!contactId && contacts.length > 0) setContactId(contacts[0].id);
  }, [contacts, contactId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(value);
    if (!contactId || !title.trim() || !Number.isFinite(amount) || amount < 0) return;
    createDeal(contactId, title.trim(), Math.round(amount));
    setTitle('');
    setValue('');
  };

  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? 'Unknown contact';

  const saveDetails = (dealId: string) => {
    const next = (draftDetails[dealId] ?? '').trim();
    setContractDetails(dealId, next);
  };

  return (
    <div>
      <Panel>
        <h3>New deal</h3>
        <Form onSubmit={submit}>
          <select
            data-testid="field-contact_id"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            disabled={contacts.length === 0}
          >
            {contacts.length === 0 && <option value="">Add a contact first</option>}
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input data-testid="field-title" placeholder="Deal title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input data-testid="field-value" type="number" min={0} placeholder="Value ($)" value={value} onChange={(e) => setValue(e.target.value)} />
          <Primary type="submit" data-testid="action-create_deal" disabled={!contactId || !title.trim()}>Create deal</Primary>
        </Form>
      </Panel>

      <Board>
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          return (
            <Column key={stage}>
              <ColHead>
                <span>{stage}</span>
                <i>{stageDeals.length}</i>
              </ColHead>
              <ColBody>
                {stageDeals.length === 0 && <Hint>No deals here.</Hint>}
                {stageDeals.map((d) => (
                  <DealCard key={d.id} data-testid={`item-deal-${d.id}`}>
                    <strong>{d.title}</strong>
                    <span className="contact">{contactName(d.contact_id)}</span>
                    <span className="value">${d.value.toLocaleString()}</span>

                    <select
                      data-testid="field-stage"
                      value={d.stage}
                      onChange={(e) => updateDealStage(d.id, e.target.value)}
                    >
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <MoveBtn type="button" data-testid="action-update_deal_stage" onClick={() => {
                      const next = STAGES[(STAGES.indexOf(d.stage) + 1) % STAGES.length];
                      updateDealStage(d.id, next);
                    }}>
                      Advance stage →
                    </MoveBtn>

                    {d.stage === 'Won' && (
                      <ContractBox>
                        <label>Contract details</label>
                        <textarea
                          data-testid="field-details"
                          placeholder="Signed 12-mo contract, NET 30…"
                          value={draftDetails[d.id] ?? d.contract_details}
                          onChange={(e) => setDraftDetails((prev) => ({ ...prev, [d.id]: e.target.value }))}
                        />
                        <Secondary type="button" data-testid="action-set_contract_details" onClick={() => saveDetails(d.id)}>
                          Save contract
                        </Secondary>
                        {d.contract_details && <Saved>Saved: {d.contract_details}</Saved>}
                      </ContractBox>
                    )}
                  </DealCard>
                ))}
              </ColBody>
            </Column>
          );
        })}
      </Board>
    </div>
  );
}

const Panel = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  padding: 18px; margin-bottom: 20px;
  h3 { font-size: 15px; font-weight: 800; color: ${C.ink}; margin-bottom: 14px; }
`;
const Form = styled.form`
  display: flex; gap: 8px; flex-wrap: wrap;
  input, select {
    flex: 1; min-width: 140px;
    padding: 9px 11px; font-size: 13.5px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Primary = styled.button`
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent);
  &:hover:not(:disabled) { filter: brightness(1.06); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 7px 12px; font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line};
  &:hover { border-color: ${C.green}; }
`;
const Board = styled.div`
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  @media (max-width: 980px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;
const Column = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  padding: 12px; min-height: 160px; display: flex; flex-direction: column; gap: 10px;
`;
const ColHead = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  span { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.ink}; }
  i { font-style: normal; font-size: 11px; font-weight: 700; color: ${C.mutedSoft}; background: ${C.paper}; border-radius: 999px; padding: 2px 8px; }
`;
const ColBody = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const Hint = styled.p`font-size: 12.5px; color: ${C.muted};`;
const DealCard = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 11px; padding: 12px;
  strong { font-size: 13.5px; color: ${C.ink}; }
  .contact { font-size: 12px; color: ${C.muted}; }
  .value { font-size: 12.5px; font-weight: 700; color: ${C.accentText}; }
  select { margin-top: 4px; padding: 6px 8px; font-size: 12.5px; border-radius: 8px; border: 1px solid ${C.line}; background: ${C.paper2}; color: ${C.ink}; }
`;
const MoveBtn = styled.button`
  align-self: flex-start;
  font-size: 11.5px; font-weight: 600; color: ${C.accentText};
  background: transparent; border: none; cursor: pointer; padding: 2px 0;
  &:hover { text-decoration: underline; }
`;
const ContractBox = styled.div`
  margin-top: 6px; padding-top: 8px; border-top: 1px solid ${C.line};
  display: flex; flex-direction: column; gap: 6px;
  label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.mutedSoft}; }
  textarea {
    resize: vertical; min-height: 52px; padding: 7px 9px; font-size: 12.5px;
    border: 1px solid ${C.line}; border-radius: 8px; color: ${C.ink}; background: ${C.paper2};
    font-family: inherit;
  }
`;
const Saved = styled.p`font-size: 11px; color: ${C.muted}; font-style: italic;`;
