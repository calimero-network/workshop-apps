import React from 'react';
import styled from 'styled-components';
import { CAPABILITIES } from '@calimero-network/mero-js';
import { C } from '../theme';

// Preset capability bitmasks. Rooms adds MANAGE_MEMBERS to the default in a
// later phase; phase 1 (single/multi) defaults to Contributor.
export const CAP_PRESETS: { label: string; mask: number }[] = [
  { label: 'Viewer', mask: 0 },
  { label: 'Contributor', mask: CAPABILITIES.CAN_CREATE_CONTEXT | CAPABILITIES.CAN_INVITE_MEMBERS },
  { label: 'Manager', mask: CAPABILITIES.CAN_CREATE_CONTEXT | CAPABILITIES.CAN_INVITE_MEMBERS | CAPABILITIES.MANAGE_MEMBERS },
];

export const DEFAULT_MEMBER_CAPS =
  CAPABILITIES.CAN_CREATE_CONTEXT | CAPABILITIES.CAN_INVITE_MEMBERS;

interface Props {
  value: number | null;
  onChange: (mask: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export default function CapabilityPresetSelect({ value, onChange, disabled, ariaLabel }: Props): React.ReactElement {
  const matched = value === null ? null : CAP_PRESETS.find((p) => p.mask === value);
  const current = matched?.label ?? (value === null ? '' : 'Custom');
  return (
    <Select
      aria-label={ariaLabel ?? 'Capability preset'}
      value={current}
      disabled={disabled || value === null}
      onChange={(e) => {
        const preset = CAP_PRESETS.find((p) => p.label === e.target.value);
        if (preset) onChange(preset.mask);
      }}
    >
      {value === null && <option value="">Loading…</option>}
      {CAP_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
      {current === 'Custom' && <option value="Custom">Custom</option>}
    </Select>
  );
}

const Select = styled.select`
  height: 30px; padding: 0 8px; font-size: 12px; font-weight: 600;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: 8px; outline: none; cursor: pointer;
  &:focus { border-color: ${C.green}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
