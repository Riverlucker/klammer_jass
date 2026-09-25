import { InitializeGame } from 'boardgame.io/internal';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armDecisionTimer } from '@/game/decisionTimer';
import { JassGame } from '@/game/logic';
import { reduceGameMove } from '@/game/serverEngine';
import { otherPlayer, type PlayerID, type ServerGameState } from '@/game/types';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), transaction: vi.fn(), player: '0' as PlayerID,
}));
vi.mock('@/db', () => ({ prisma: {
  game: { findUnique: mocks.findUnique }, $transaction: mocks.transaction,
} }));
vi.mock('@/lib/auth', () => ({ readMatchToken: () => 'session', resolvePlayerID: () => mocks.player }));
vi.mock('@/lib/pusher', () => ({ pusherServer: null }));

const id = '00000000-0000-4000-8000-000000000001';
let stored: ServerGameState;
function tick(body?: unknown) {
  return POST(new NextRequest(`http://localhost/api/matches/${id}/tick`, {
    method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.clearAllMocks();
  stored = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  for (const playerID of ['0', '1'] as PlayerID[]) {
    stored = reduceGameMove(stored, { move: 'setReady', args: [], playerID }).state!;
  }
  stored = armDecisionTimer(stored);
  mocks.player = stored.ctx.currentPlayer as PlayerID;
  mocks.findUnique.mockImplementation(async () => ({ state: structuredClone(stored), match: { status: 'active' }, updatedAt: new Date(1_000) }));
  mocks.transaction.mockImplementation(async (action) => action({
    game: { updateMany: mocks.updateMany }, match: { update: mocks.update },
  }));
  mocks.updateMany.mockImplementation(async ({ data }) => { stored = data.state; return { count: 1 }; });
});
afterEach(() => { vi.useRealTimers(); });

describe('Online-Zeitprüfung über die API', () => {
  it('speichert die Unterbrechung nach drei Timeouts beider Spieler und stoppt die Uhr', async () => {
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(stored.G.deadlineAt!);
      expect((await tick()).status).toBe(200);
    }
    expect(stored.G.matchPaused).toBe(true);
    expect(stored.G.consecutiveTimeouts).toEqual({ '0': 3, '1': 3 });
    expect(stored.G.deadlineAt).toBeNull();
    expect(stored.G.decisionTimer).toBeNull();
    const before = stored._stateID;
    vi.setSystemTime(Date.now() + 120000);
    expect((await tick()).status).toBe(200);
    expect(stored._stateID).toBe(before);
  });
  it('startet nach Anzeige und führt nach einer zu frühen Prüfung später den Standardzug aus', async () => {
    const player = mocks.player;
    vi.setSystemTime(6_000);
    const response = await tick({ decisionID: stored.G.decisionTimer!.id });
    expect(response.status).toBe(200);
    expect((await response.json()).serverTime).toBe(6_000);
    expect(stored.G.deadlineAt).toBe(16_000);
    expect(mocks.update).not.toHaveBeenCalled();
    const beforeTimeout = stored._stateID;
    // The waiting opponent can drive the timeout even if the active browser disconnects.
    mocks.player = otherPlayer(player);
    vi.setSystemTime(15_999);
    expect((await tick()).status).toBe(200);
    expect(stored._stateID).toBe(beforeTimeout);
    vi.setSystemTime(16_000);
    expect((await tick()).status).toBe(200);
    expect(stored.ctx.currentPlayer).toBe(otherPlayer(player));
    expect(stored._stateID).toBeGreaterThan(beforeTimeout);
    expect(stored.G.decisionTimer?.started).toBe(false);
  });

  it('kann einen Datenbankkonflikt bei der Zeitprüfung erneut versuchen', async () => {
    vi.setSystemTime(stored.G.deadlineAt!);
    const before = stored._stateID;
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await tick()).status).toBe(409);
    expect(stored._stateID).toBe(before);
    expect((await tick()).status).toBe(200);
    expect(stored._stateID).toBeGreaterThan(before);
  });

  it('ignoriert eine Anzeigebestätigung vom wartenden Gegner', async () => {
    mocks.player = otherPlayer(mocks.player);
    expect((await tick({ decisionID: stored.G.decisionTimer!.id })).status).toBe(200);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(stored.G.decisionTimer?.started).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('liest unveränderte Spielstände ohne Transaktion und liefert Messinformationen', async () => {
    const response = await tick();
    expect(response.status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(response.headers.get('Server-Timing')).toMatch(/^app;dur=/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await response.json()).realtimeEnabled).toBe(false);
  });
});
