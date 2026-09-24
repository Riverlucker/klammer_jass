import { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { JassGame } from '@/game/logic';
import type { PlayerID, ServerGameState } from '@/game/types';
import { createPlayerToken } from './auth';
import { loadGameRecord } from './gameRecord';

function fixture() {
  const legacyGame = {
    ...JassGame,
    phases: {
      ...JassGame.phases,
      trumpSelection: { ...JassGame.phases!.trumpSelection, next: 'trumpExchange' },
    },
  };
  const reducer = CreateGameReducer({ game: legacyGame });
  let state = InitializeGame({ game: legacyGame, numPlayers: 2 }) as ServerGameState;
  function move(type: string, playerID: PlayerID) {
    state = reducer(state, { type: 'MAKE_MOVE', payload: { type, playerID, args: [] } }) as ServerGameState;
  }
  move('setReady', '0');
  move('setReady', '1');
  move('acceptOriginal', state.ctx.currentPlayer as PlayerID);
  expect(state.ctx.phase).toBe('trumpExchange');
  const access = createPlayerToken();
  const record = {
    id: 'match', state, updatedAt: new Date(1000),
    match: { player1TokenHash: access.tokenHash, player2TokenHash: null, status: 'active' },
  };
  const game = {
    findUnique: vi.fn(async () => structuredClone(record)),
    updateMany: vi.fn(async ({ where, data }) => {
      expect(where.updatedAt).toEqual(record.updatedAt);
      record.state = data.state;
      record.updatedAt = new Date(2000);
      return { count: 1 };
    }),
  };
  return { record, game, token: access.token, database: { game } as unknown as Pick<Prisma.TransactionClient, 'game'> };
}

describe('Laufende Matches aus der gemeinsamen Räuber-Phase übernehmen', () => {
  it('gibt dem Ausspieler das Zugrecht, erhält Karten und Punkte und migriert nur einmal', async () => {
    const { record, game, database, token } = fixture();
    const before = structuredClone(record.state);
    await loadGameRecord(database, record.id, token);
    expect(record.state.ctx.phase).toBe('playing');
    expect(record.state.ctx.currentPlayer).toBe(before.G.vorne);
    expect(record.state.G.hands).toEqual(before.G.hands);
    expect(record.state.G.handScores).toEqual(before.G.handScores);
    expect(record.state.G.revealedCard).toEqual(before.G.revealedCard);
    expect(record.state.G.chatMessages).toEqual(before.G.chatMessages);
    expect(record.state.G.decisionTimer?.waitingFor).toEqual([before.G.vorne]);
    expect(record.state._stateID).toBeGreaterThan(before._stateID);
    await loadGameRecord(database, record.id, token);
    expect(game.updateMany).toHaveBeenCalledTimes(1);
  });

  it('wiederholt nach einem Schreibkonflikt mit dem aktuellen Spielstand', async () => {
    const { record, game, database, token } = fixture();
    game.updateMany.mockResolvedValueOnce({ count: 0 });
    await loadGameRecord(database, record.id, token);
    expect(record.state.ctx.phase).toBe('playing');
    expect(game.updateMany).toHaveBeenCalledTimes(2);
  });

  it('verändert ohne gültige Spielsitzung keinen Spielstand', async () => {
    const { record, game, database } = fixture();
    await loadGameRecord(database, record.id, undefined);
    expect(game.updateMany).not.toHaveBeenCalled();
    expect(record.state.ctx.phase).toBe('trumpExchange');
  });
});
