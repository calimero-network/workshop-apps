/**
 * useRooms (rooms topology) - owns the room lifecycle as SCAFFOLD code: the
 * create sequence (allocate in the directory, subgroup, room context,
 * linkback, self-join) and the staged join (retry/backoff through the two
 * transient races a joiner hits before a fresh subgroup context is usable).
 *
 * Grounded in the private-rooms recipe (createGroupInNamespace ->
 * setSubgroupVisibility -> createContext -> linkback) and the battleships
 * match-join state machine (connecting/joining/syncing phases +
 * joinContextWithBackoff). The build agent reskins RoomList/RoomGate copy,
 * never this wiring.
 */
import { useCallback, useState } from 'react';
import { MeroJs } from '@calimero-network/mero-react';
import { DirectoryClient } from '../api/directory/DirectoryClient';
import { RoomClient } from '../api/room/RoomClient';
import { requireService } from '../config';

export type JoinPhase = 'idle' | 'connecting' | 'joining' | 'syncing' | 'failed';

export interface UseRoomsArgs {
  mero: MeroJs | null;
  applicationId: string | null;
  namespaceId: string | null;
  directoryContextId: string | null;
  /** 'open' | 'restricted' - the private-rooms recipe's subgroup visibility. */
  roomVisibility: string;
  minMembers: number;
}

export interface UseRoomsReturn {
  createRoom: (name: string) => Promise<string | null>;
  joinRoom: (contextId: string) => Promise<void>;
  joinPhase: JoinPhase;
  /** The context id of the room create/join last landed in, or null. */
  activeRoomContextId: string | null;
  /** The executor identity owned in that room's context, or null. */
  activeRoomIdentity: string | null;
}

// Pure error-shape predicates - hoisted so they have a stable identity and
// don't fight react-hooks/exhaustive-deps (mirrors battleships match/index.tsx:28-46).
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : '';

// merod returns one of two strings when a node touches a context whose state
// hasn't been bootstrapped locally yet.
const isContextNotAvailableError = (error: unknown): boolean => {
  const m = errorMessage(error).toLowerCase();
  return m.includes('not available on this node') || m.includes('context not found');
};

// A freshly created context's state can lag the same way pre-sync.
const isUninitializedError = (error: unknown): boolean =>
  errorMessage(error).includes('Uninitialized');

// Fired when joinContext races ahead of the subgroup-membership delta on the
// joiner's node. Transient - the caller retries with backoff.
const isNotMemberError = (error: unknown): boolean => {
  const m = errorMessage(error).toLowerCase();
  return m.includes('not a member of group') || m.includes('not a member');
};

// Up to ~30s of joinContext retries (10 attempts: 200ms, 400ms, ... up to 3s,
// then 3s thereafter) - long enough for the membership op to converge even on
// a noisy mesh, bounded so a genuinely stuck join still fails loudly.
// joinContext's response already carries the new memberPublicKey, so the
// caller uses it directly instead of re-querying getContextIdentitiesOwned
// (which would otherwise race the same post-join sync lag).
async function joinContextWithBackoff(mero: MeroJs, contextId: string): Promise<string> {
  const attempts = 10;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { memberPublicKey } = await mero.admin.joinContext(contextId);
      return memberPublicKey;
    } catch (err) {
      if (!isNotMemberError(err) || i === attempts - 1) throw err;
      const delay = Math.min(3000, 200 * 2 ** i);
      await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
    }
  }
  throw new Error('joinContextWithBackoff: exhausted attempts');
}

// The identity this node owns in `contextId`, or null if the context isn't
// locally available yet / we're not a member yet (both recoverable via join).
async function resolveOwnedIdentity(mero: MeroJs, contextId: string): Promise<string | null> {
  try {
    const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
    return identities.length > 0 ? identities[0] : null;
  } catch (err) {
    if (isContextNotAvailableError(err) || isUninitializedError(err)) return null;
    throw err;
  }
}

export function useRooms({
  mero,
  applicationId,
  namespaceId,
  directoryContextId,
  roomVisibility,
  minMembers,
}: UseRoomsArgs): UseRoomsReturn {
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('idle');
  const [activeRoomContextId, setActiveRoomContextId] = useState<string | null>(null);
  const [activeRoomIdentity, setActiveRoomIdentity] = useState<string | null>(null);

  // Allocate the room in the directory, make it a subgroup with the spec's
  // visibility, create the room context, link it back, then self-join (the
  // gate counts join_room calls, so the creator must be one).
  //
  // Not rollback-safe: a failure after createRoom() but before setRoomContextId()
  // orphans a Pending directory entry (the directory crate has no remove_room,
  // and room_id must exist before the room context can be created/linked).
  // RoomList/RoomGate must status-gate on this: a Pending row with
  // `context_id: null` has no room to join yet and should render as
  // pending/hidden rather than clickable.
  const createRoom = useCallback(async (name: string): Promise<string | null> => {
    // Throw rather than return null so the failure surfaces via ws.error
    // instead of a silent no-op if a create is attempted before the workspace
    // and directory context have resolved.
    if (!mero || !applicationId || !namespaceId || !directoryContextId) {
      throw new Error('Workspace is still loading - try again in a moment.');
    }

    const directoryIdentity = await resolveOwnedIdentity(mero, directoryContextId);
    if (!directoryIdentity) throw new Error('No identity owned in the directory context yet.');
    const dirClient = new DirectoryClient(mero, directoryContextId, directoryIdentity);

    const roomId = await dirClient.createRoom({ name });
    const { groupId: subgroupId } = await mero.admin.createGroupInNamespace(namespaceId, {
      name: `room-${roomId}`,
    });
    await mero.admin.setSubgroupVisibility(subgroupId, { subgroupVisibility: roomVisibility });

    const initParams = new TextEncoder().encode(JSON.stringify({
      directory_context_id: directoryContextId,
      room_id: roomId,
      min_members_to_start: minMembers,
    }));
    const ctx = await mero.admin.createContext({
      applicationId,
      groupId: subgroupId,
      serviceName: requireService('room').name,
      initializationParams: Array.from(initParams),
    });

    await dirClient.setRoomContextId({ room_id: roomId, context_id: ctx.contextId });

    const roomClient = new RoomClient(mero, ctx.contextId, ctx.memberPublicKey);
    await roomClient.joinRoom();

    setActiveRoomContextId(ctx.contextId);
    setActiveRoomIdentity(ctx.memberPublicKey);
    return ctx.contextId;
  }, [mero, applicationId, namespaceId, directoryContextId, roomVisibility, minMembers]);

  // Staged join: resolve an owned identity if the subgroup delta already
  // landed here, else join with backoff (which returns the new identity
  // directly off the joinContext response), then register as a member.
  // Throws on terminal failure (never resolves into 'failed').
  const joinRoom = useCallback(async (contextId: string): Promise<void> => {
    if (!mero) throw new Error('Not connected yet - try again in a moment.');
    setJoinPhase('connecting');
    try {
      let identity = await resolveOwnedIdentity(mero, contextId);
      if (!identity) {
        setJoinPhase('joining');
        identity = await joinContextWithBackoff(mero, contextId);
      }
      setJoinPhase('syncing');
      const client = new RoomClient(mero, contextId, identity);
      await client.joinRoom();
      setActiveRoomContextId(contextId);
      setActiveRoomIdentity(identity);
      setJoinPhase('idle');
    } catch (err) {
      setJoinPhase('failed');
      throw err;
    }
  }, [mero]);

  return { createRoom, joinRoom, joinPhase, activeRoomContextId, activeRoomIdentity };
}
