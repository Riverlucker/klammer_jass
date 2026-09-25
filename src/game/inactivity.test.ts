import { InitializeGame } from 'boardgame.io/internal';
import { describe, expect, it } from 'vitest';
import { JassGame } from './logic';
import { armDecisionTimer } from './decisionTimer';
import { reduceGameMove, reduceTimedOutMove, timeoutAction } from './serverEngine';
import { createClientState } from './playerView';
import { otherPlayer, type PlayerID, type ServerGameState } from './types';

function apply(state: ServerGameState, move: string, playerID: PlayerID) {
  const result = reduceGameMove(state, { move, playerID, args: [] });
  expect(result.errorType).toBeNull();
  return result.state!;
}
function ready() {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  state = apply(state, 'setReady', '0');
  return apply(state, 'setReady', '1');
}
function expired(state: ServerGameState) {
  const next = structuredClone(state);
  next.G.redealUntil = null;
  next.G.deadlineAt = Date.now() - 1;
  return next;
}
function timedOut(state: ServerGameState) {
  const result = reduceTimedOutMove(expired(state));
  expect(result.errorType).toBeNull();
  return result.state!;
}
function paused() {
  let state = ready();
  for (let i = 0; i < 6; i++) state = timedOut(state);
  return state;
}

describe('Unterbrechung bei beidseitigen Timeouts', () => {
  it('stoppt vor der sechsten automatischen Entscheidung ohne den Spielstand zu verändern', () => {
    let state = ready();
    for (let i = 0; i < 5; i++) {
      state = timedOut(state);
      expect(state.G.matchPaused).toBe(false);
    }
    const next = timedOut(state);
    expect(next.G.consecutiveTimeouts).toEqual({ '0': 3, '1': 3 });
    expect(next.G.pauseReason).toBe('inactivity');
    expect(next.G.matchPaused).toBe(true);
    expect(next.G.hands).toEqual(state.G.hands);
    expect(next.G.revealedCard).toEqual(state.G.revealedCard);
    expect(next.G.scores).toEqual(state.G.scores);
    expect(next.ctx).toEqual(state.ctx);
    expect(next.G.deadlineAt).toBeNull();
    expect(timeoutAction(next)).toBeNull();
    expect(reduceTimedOutMove(expired(next)).state).toBeNull();
    expect(reduceGameMove(next, { move: 'decline', playerID: next.ctx.currentPlayer as PlayerID, args: [] }).state).toBeNull();
  });

  it.each(['0', '1'] as const)('braucht beide Spieler und setzt mit demselben Zug fort, zuerst %s', (first) => {
    const original = paused();
    let state = apply(original, 'resumeMatch', first);
    state = apply(state, 'resumeMatch', first);
    expect(state.G.resumePlayers).toEqual([first]);
    expect(state.G.matchPaused).toBe(true);
    expect(armDecisionTimer(state).G.deadlineAt).toBeNull();
    state = apply(state, 'resumeMatch', otherPlayer(first));
    expect(state.G.matchPaused).toBe(false);
    expect(state.G.hands).toEqual(original.G.hands);
    expect(state.ctx).toEqual(original.ctx);
    expect(state.G.consecutiveTimeouts).toEqual({ '0': 0, '1': 0 });
    expect(armDecisionTimer(state).G.decisionTimer?.waitingFor).toEqual([original.ctx.currentPlayer]);
  });

  it('setzt nur den Zähler des manuell antwortenden Spielers zurück', () => {
    let state = ready();
    for (let i = 0; i < 4; i++) state = timedOut(state);
    const player = state.ctx.currentPlayer as PlayerID;
    state = apply(state, 'decline', player);
    expect(state.G.consecutiveTimeouts?.[player]).toBe(0);
    expect(state.G.consecutiveTimeouts?.[otherPlayer(player)]).toBe(2);
    state = timedOut(state);
    expect(state.G.matchPaused).toBe(false);
  });

  it.each(['0', '1'] as const)('beendet die Unterbrechung auf Wunsch von %s für beide endgültig', (player) => {
    let state = paused();
    state = apply(state, 'resumeMatch', otherPlayer(player));
    state = apply(state, 'endMatch', player);
    expect(state.ctx.gameover).toEqual(state.G.matchResult);
    expect(state.G.matchEndedAt).toBeGreaterThan(0);
    expect(state.G.resumePlayers).toEqual([]);
    for (const viewer of ['0', '1'] as const) {
      expect(createClientState(state, viewer).G.matchResult?.endedBy).toBe(player);
      expect(reduceGameMove(state, { move: 'resumeMatch', playerID: viewer, args: [] }).state).toBeNull();
    }
  });

  it('beendet auch nach einer Zusage zum nächsten Spiel das Match für beide', () => {
    let state = ready();
    state = apply(state, 'doubleCube', state.ctx.currentPlayer as PlayerID);
    state = apply(state, 'declineCube', state.ctx.currentPlayer as PlayerID);
    state = apply(state, 'nextGame', '0');
    state = apply(state, 'endMatch', '1');
    expect(state.G.nextGamePlayers).toEqual([]);
    expect(state.G.matchEndedAt).toBeGreaterThan(0);
    expect(reduceGameMove(state, { move: 'nextGame', playerID: '0', args: [] }).state).toBeNull();
  });
});
