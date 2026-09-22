import { afterEach, describe, expect, it, vi } from 'vitest';
import { InitializeGame } from 'boardgame.io/internal';
import { JassGame } from './logic';
import { createClientState } from './playerView';
import { isTrickBeingDisplayed, reduceGameMove } from './serverEngine';
import type { ServerGameState } from './types';

function stateWithTricks(): ServerGameState {
  const state = structuredClone(InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState);
  state.ctx.phase = 'playing';
  state.ctx.currentPlayer = '1';
  state.G.playerNames['0'] = 'Chris';
  state.G.deadlineAt = 20_000;
  state.G.pastTricks = [
    { leadPlayer: '1', winner: '1', cards: { '0': { suit: 'Clubs', rank: '7' }, '1': { suit: 'Clubs', rank: 'A' } } },
    { leadPlayer: '0', winner: '0', cards: { '0': { suit: 'Hearts', rank: '10' }, '1': { suit: 'Hearts', rank: '9' } } },
  ];
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe('Letzten Stich ansehen', () => {
  it('zeigt beiden Spielern den neuesten Stich für drei Sekunden, auch außerhalb des eigenen Zugs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const state = stateWithTricks();
    const result = reduceGameMove(state, { move: 'inspectLastTrick', playerID: '0', args: [] });
    expect(result.errorType).toBeNull();
    const next = result.state!;
    expect(next.G.deadlineAt).toBe(23_000);
    expect(next.G.inspectingLastTrick).toBe(true);
    expect(next.ctx).toEqual(state.ctx);
    expect(next.G.handScores).toEqual(state.G.handScores);
    expect(next.G.pastTricks).toEqual(state.G.pastTricks);
    expect(next._stateID).toBe(state._stateID + 1);
    expect(next.G.chatMessages.at(-1)?.text).toBe('Chris schaut letzten Stich: ♥ T, ♥ 9');
    expect(isTrickBeingDisplayed(next, 12_999)).toBe(true);
    expect(isTrickBeingDisplayed(next, 13_000)).toBe(false);
    for (const player of ['0', '1'] as const) {
      expect(createClientState(next, player).G.trickDisplayUntil).toBe(13_000);
      expect(createClientState(next, player).G.inspectingLastTrick).toBe(true);
    }
    expect(reduceGameMove(next, { move: 'inspectLastTrick', playerID: '0', args: [] }).state).toBeNull();
  });

  it('verweigert ältere Stiche, fremde Stapel und frei gewählte Stichnummern', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const state = stateWithTricks();
    expect(reduceGameMove(state, { move: 'inspectLastTrick', playerID: '1', args: [] }).state).toBeNull();
    expect(reduceGameMove(state, { move: 'inspectLastTrick', playerID: '0', args: [0] }).state).toBeNull();
    state.G.pastTricks = [];
    expect(reduceGameMove(state, { move: 'inspectLastTrick', playerID: '0', args: [] }).state).toBeNull();
  });
});
