import { describe, expect, it } from 'vitest';
import { groupChatMessages } from './chatGroups';
import type { ChatMessage } from './types';

function message(id: number, kind: ChatMessage['kind'], gameNumber: number, handNumber = 1, text = `Nachricht ${id}`): ChatMessage {
  return {
    id,
    kind,
    playerId: kind === 'player' ? '0' : null,
    text,
    createdAt: id * 1_000,
    gameNumber,
    handNumber,
  };
}

describe('Chat-Gruppierung', () => {
  it('fasst aufeinanderfolgende Dealer-Nachrichten innerhalb eines Spiels zusammen', () => {
    const groups = groupChatMessages([
      message(1, 'dealer', 1),
      message(2, 'dealer', 1),
      message(3, 'dealer', 1),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it('beginnt nach Spieler-Chat, neuer Hand und neuem Spiel einen neuen Dealer-Block', () => {
    const groups = groupChatMessages([
      message(1, 'dealer', 1),
      message(2, 'player', 1),
      message(3, 'dealer', 1),
      message(4, 'dealer', 1, 2),
      message(5, 'dealer', 1, 2),
      message(6, 'dealer', 2),
    ]);

    expect(groups.map((group) => group.messages.map((entry) => entry.id))).toEqual([
      [1],
      [2],
      [3],
      [4, 5],
      [6],
    ]);
  });
});
