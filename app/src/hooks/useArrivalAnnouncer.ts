import { useEffect, useRef } from 'react';
import { useFeedback } from '../components/Feedback';

/**
 * Announces items that arrived from OTHER members, so a screen-reader user hears
 * a peer's change instead of the list silently growing.
 *
 * Not `aria-live` on the list itself: an `aria-live` container re-reads its whole
 * subtree whenever it mutates, so every CRDT sync tick would replay the entire
 * list. Announcing only the delta is what the spec's "aria-live on lists" is
 * actually asking for.
 *
 * BUILD AGENT: call this with your domain list and name the entity, e.g.
 * `useArrivalAnnouncer(trips, ws.executorPublicKey, 'trip')`.
 */

export interface Arrival {
  id: string;
  author?: string;
}

/** Ids in `items` that are new since `seen` and were written by someone else.
 *  Pure so the announcing rule is testable without a DOM. */
export function peerArrivals<T extends Arrival>(
  items: readonly T[],
  seen: ReadonlySet<string>,
  selfId: string | null | undefined,
): string[] {
  return items
    .filter((i) => !seen.has(i.id) && i.author !== undefined && i.author !== selfId)
    .map((i) => i.id);
}

export function describeArrivals(count: number, noun: string): string {
  return count === 1 ? `1 new ${noun} from another member` : `${count} new ${noun}s from another member`;
}

export function useArrivalAnnouncer<T extends Arrival>(
  items: readonly T[],
  selfId: string | null | undefined,
  noun = 'item',
): void {
  const { announce } = useFeedback();
  const seen = useRef<Set<string>>(new Set());
  // The first non-empty render is existing state, not an arrival, so it seeds
  // the set silently. Without this every reload announces the whole list.
  const seeded = useRef(false);

  useEffect(() => {
    const fresh = peerArrivals(items, seen.current, selfId);
    for (const item of items) seen.current.add(item.id);
    if (!seeded.current) {
      seeded.current = true;
      return;
    }
    if (fresh.length) announce(describeArrivals(fresh.length, noun));
  }, [items, selfId, noun, announce]);
}
