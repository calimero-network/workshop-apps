import React from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import type { Move } from '../../api/chess-game/ChessGameClient';

/**
 * MoveHistoryView — every submitted move so far, in ascending move order,
 * visible to both players. Purely a read view over `list_moves`; the parent
 * hook (`useChessGame`) keeps it live via `useSubscription`.
 */
interface MoveHistoryViewProps {
  moves: Move[];
}

export default function MoveHistoryView({ moves }: MoveHistoryViewProps) {
  return (
    <Wrap data-testid="move-history">
      <h3>Move history</h3>
      {moves.length === 0 ? (
        <Hint>No moves yet.</Hint>
      ) : (
        <List>
          {moves.map((move) => (
            <Row key={move.id} data-testid={`item-move-${move.id}`}>
              <span className="num">{move.move_number}.</span>
              <span className="san">{move.san}</span>
              <span className="squares">{move.from_square}–{move.to_square}</span>
              <MemberLabel className="player" memberId={move.player} showYou={false} />
            </Row>
          ))}
        </List>
      )}
    </Wrap>
  );
}

const Wrap = styled.div`
  max-width: 480px;
  margin: 0 auto;
  h3 { font-size: 14px; font-weight: 700; color: ${C.ink}; margin-bottom: 10px; }
`;
const Hint = styled.p`font-size: 13px; color: ${C.muted};`;
const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
`;
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  font-size: 13px;
  .num { color: ${C.mutedSoft}; min-width: 22px; }
  .san { font-weight: 700; color: ${C.ink}; min-width: 44px; }
  .squares { color: ${C.muted}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; }
  .player { margin-left: auto; font-size: 12px; }
`;
