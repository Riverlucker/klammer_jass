import { describe, expect, it } from 'vitest';
import { InitializeGame } from 'boardgame.io/internal';
import type { State } from 'boardgame.io';
import { JassGame } from './logic';
import { createClientState } from './playerView';
import type { JassState } from './types';

describe('Spielersicht', () => {
  it('liefert nur die eigene Hand und keine internen Reducer-Snapshots', () => {
    const initialized = InitializeGame({ game: JassGame, numPlayers: 2 }) as State<JassState>;
    const state = structuredClone(initialized);
    state.G.hands['0'] = [{ suit: 'Spades', rank: 'A' }];
    state.G.hands['1'] = [{ suit: 'Hearts', rank: 'J' }];
    state.G.deck = [{ suit: 'Clubs', rank: '7' }];
    state.G.timeoutCard = { suit: 'Spades', rank: 'A' };
    state.ctx.currentPlayer = '0';

    const view = createClientState(state, '0');
    expect(view.G.hands['0']).toEqual([{ suit: 'Spades', rank: 'A' }]);
    expect(view.G.hands['1']).toEqual([]);
    expect(view.G.handCounts).toEqual({ '0': 1, '1': 1 });
    expect(view.G.talonCount).toBe(1);
    expect(view.G.deck).toEqual([]);
    expect(view.G.timeoutCard).toEqual({ suit: 'Spades', rank: 'A' });
    expect(createClientState(state, '1').G.timeoutCard).toBeNull();
    expect(Object.keys(view).sort()).toEqual(['G', '_stateID', 'ctx']);
  });
});
