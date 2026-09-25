import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/game/logic';
import { createClientState } from '@/game/playerView';
import type { ServerGameState } from '@/game/types';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ create: vi.fn(), transaction: vi.fn() }));
vi.mock('@/db', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/playerAccounts', () => ({
  authenticatePlayer: async () => ({ id: 'host', name: 'Anna' }),
  PlayerLoginError: class extends Error {},
}));

describe('Match mit Avatar erstellen', () => {
  it.each([null, 14])('speichert Avatar %s und Startzeit, sichtbar für beide Spieler', async (avatar) => {
    mocks.transaction.mockImplementation(async (callback) => callback({
      match: { create: async () => ({ id: '00000000-0000-4000-8000-000000000001' }) },
      game: { create: mocks.create },
    }));
    const response = await POST(new NextRequest('http://localhost/api/matches', {
      method: 'POST', body: JSON.stringify({ ...DEFAULT_SETTINGS, playerName: 'Anna', password: '', avatar }),
    }));
    expect(response.status).toBe(200);
    const state = mocks.create.mock.lastCall![0].data.state as ServerGameState;
    expect(state.G.matchStartedAt).toBeGreaterThan(0);
    expect(state.G.completedHands).toBe(0);
    for (const viewer of ['0', '1'] as const) {
      expect(createClientState(state, viewer).G.playerAvatars?.['0']).toBe(avatar);
    }
  });
});
