/**
 * useMemberDisplayName — per-(namespace, member) display name backed by core's
 * member metadata (replicates to peers). Returns null when unset; callers
 * render a truncated key as the fallback (see <MemberLabel>).
 *
 * Writes are SELF-ONLY: `setName` always targets `selfIdentity` and ignores
 * `memberId`, so a component holding this hook can't rename another member.
 * Bind the hook to `selfIdentity` when you need to write.
 *
 * Ported from mero-drive's display-name system (member metadata).
 */
import { useCallback } from 'react';
import {
  useMemberMetadata,
  useSetMemberMetadata,
} from '@calimero-network/mero-react';

// Core caps `name` at 64 BYTES server-side (not code units), so a name of
// multibyte characters can exceed the cap well before 64 characters. The real
// guard is the byte length below; the gate's input `maxLength` is only a rough
// code-unit pre-filter.
export const MAX_DISPLAY_NAME_BYTES = 64;

/** UTF-8 byte length — the unit core enforces. */
export function displayNameByteLength(name: string): number {
  return new TextEncoder().encode(name).length;
}

export interface MemberDisplayName {
  name: string | null;
  loading: boolean;
  error: Error | null;
  /** Set the caller's own display name in this namespace (self-only). */
  setName: (name: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMemberDisplayName(
  namespaceId: string | null | undefined,
  memberId: string | null | undefined,
  selfIdentity: string | null | undefined,
): MemberDisplayName {
  const { metadata, loading, error, refetch } = useMemberMetadata(
    namespaceId ?? null,
    memberId ?? null,
  );
  const { setMemberMetadata } = useSetMemberMetadata();

  const name = metadata?.name ?? null;

  const setName = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) throw new Error('Display name cannot be empty.');
      if (displayNameByteLength(trimmed) > MAX_DISPLAY_NAME_BYTES) {
        throw new Error(`Name is too long (max ${MAX_DISPLAY_NAME_BYTES} bytes).`);
      }
      if (!namespaceId) throw new Error('No workspace resolved yet.');
      if (!selfIdentity) throw new Error('Your identity is not resolved yet.');
      if (memberId && memberId !== selfIdentity) {
        throw new Error('setName is self-only — bind the hook to selfIdentity.');
      }
      await setMemberMetadata(namespaceId, selfIdentity, {
        name: trimmed,
        data: {},
      });
      await refetch();
    },
    [namespaceId, memberId, selfIdentity, setMemberMetadata, refetch],
  );

  return { name, loading, error, setName, refetch };
}
