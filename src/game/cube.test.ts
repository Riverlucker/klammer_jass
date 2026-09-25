import { InitializeGame } from 'boardgame.io/internal';
import { describe, expect, it } from 'vitest';
import { JassGame } from './logic';
import { canDouble } from './cube';
import { reduceGameMove, timeoutAction } from './serverEngine';
import { otherPlayer, type PlayerID, type ServerGameState } from './types';

function apply(state: ServerGameState, move: string, playerID: PlayerID, args: unknown[] = []) {
  const next = reduceGameMove(state, { move, playerID, args }).state;
  if (!next) throw new Error(`Ungültiger Testzug: ${move}`);
  return next;
}

function ready() {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  state = apply(state, 'setReady', '0');
  return apply(state, 'setReady', '1');
}

function checkOfferAndResume(state: ServerGameState, player: PlayerID) {
  expect(canDouble(state.G, state.ctx.phase, state.ctx.currentPlayer, player)).toBe(true);
  const offered = apply(state, 'doubleCube', player);
  expect(offered.ctx.currentPlayer).toBe(otherPlayer(player));
  expect(offered.G.cubeOffer).toEqual({ from: player, resumePlayer: player });
  expect(canDouble(offered.G, offered.ctx.phase, offered.ctx.currentPlayer, otherPlayer(player))).toBe(false);
  const accepted = apply(offered, 'acceptCube', otherPlayer(player));
  expect(accepted.ctx.currentPlayer).toBe(player);
  expect(accepted.G.cube.value).toBe(state.G.cube.value * 2);
  expect(accepted.G.cube.holder).toBe(otherPlayer(player));
  expect(accepted.G.currentTrick).toEqual(state.G.currentTrick);
  expect(accepted.G.hands).toEqual(state.G.hands);
  expect(accepted.G.meldContest).toEqual(state.G.meldContest);
  expect(canDouble(accepted.G, accepted.ctx.phase, accepted.ctx.currentPlayer, player)).toBe(false);
}

describe('Drehen nur beim eigenen Zug', () => {
  it('setzt nach der Annahme die Trumpfwahl des Anbieters fort', () => {
    const state = ready();
    checkOfferAndResume(state, state.G.vorne);
  });

  it('erlaubt Drehen beim Bedienen, aber nicht mehr dem Ausspieler', () => {
    let state = ready();
    const front = state.G.vorne;
    state = apply(state, 'acceptOriginal', front);
    state = apply(state, 'playCard', front, [state.G.hands[front][0]]);
    expect(canDouble(state.G, state.ctx.phase, state.ctx.currentPlayer, front)).toBe(false);
    expect(reduceGameMove(state, { move: 'doubleCube', playerID: front, args: [] }).state).toBeNull();
    checkOfferAndResume(state, state.G.dealer);
  });

  it('erlaubt Drehen auch nach einer Meldungsantwort vor dem Bedienen', () => {
    let state = ready();
    state = structuredClone(apply(state, 'acceptOriginal', state.G.vorne));
    state.G.hands[state.G.vorne] = [
      { suit: 'Clubs', rank: '8' }, { suit: 'Clubs', rank: '9' }, { suit: 'Clubs', rank: '10' },
    ];
    state = apply(state, 'playCard', state.G.vorne, [{ suit: 'Clubs', rank: '8' }, ['Terz']]);
    const response = timeoutAction(state)!;
    expect(response.move).toBe('respondMeld');
    state = apply(state, response.move, response.playerID, response.args);
    expect(state.G.meldContest?.stage).toBe('dealerPlay');
    checkOfferAndResume(state, state.G.dealer);
  });

  it.each(['disabled', 'paused'] as const)('verbietet Drehen bei %s auch während des eigenen Zuges', (restriction) => {
    const state = structuredClone(ready());
    if (restriction === 'disabled') state.G.settings.cubeEnabled = false;
    else state.G.matchPaused = true;
    expect(canDouble(state.G, state.ctx.phase, state.ctx.currentPlayer, state.G.vorne)).toBe(false);
    expect(reduceGameMove(state, { move: 'doubleCube', playerID: state.G.vorne, args: [] }).state).toBeNull();
  });

  it('lässt bereits gespeicherte Angebote nach der alten Regel noch annehmen', () => {
    const state = structuredClone(ready());
    const receiver = state.G.vorne;
    state.G.cubeOffer = { from: state.G.dealer, resumePlayer: receiver };
    const accepted = apply(state, 'acceptCube', receiver);
    expect(accepted.ctx.currentPlayer).toBe(receiver);
    expect(accepted.G.cube.value).toBe(2);
    expect(accepted.G.cubeOffer).toBeNull();
  });
});
