import { describe, expect, it } from 'vitest';
import { InitializeGame } from 'boardgame.io/internal';
import { JassGame } from './logic';
import { createClientState } from './playerView';
import {
  isDeadlineExpired,
  isExtraDealBeingDisplayed,
  reduceGameMove,
  stampDeadline,
  timeoutAction,
} from './serverEngine';
import type { PlayerID, ServerGameState } from './types';
import { isPlayerID, otherPlayer } from './types';
import { canDouble } from './cube';

function readyState(): ServerGameState {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  state = apply(state, 'setReady', '0');
  return apply(state, 'setReady', '1');
}

function apply(state: ServerGameState, move: string, playerID: PlayerID, args: unknown[] = []) {
  const result = reduceGameMove(state, { move, playerID, args });
  if (!result.state) throw new Error(`Move ${move} fehlgeschlagen: ${result.errorType}`);
  return result.state;
}

function current(state: ServerGameState): PlayerID {
  if (!isPlayerID(state.ctx.currentPlayer)) throw new Error('Aktueller Spieler fehlt.');
  return state.ctx.currentPlayer;
}

function finishTrumpExchange(state: ServerGameState): ServerGameState {
  if (state.ctx.phase !== 'trumpExchange') return state;
  const automatic = timeoutAction(state);
  if (!automatic) throw new Error('Keine Standardentscheidung für die Trumpf-7 verfügbar.');
  return apply(state, automatic.move, automatic.playerID, automatic.args);
}

describe('Serverseitige Zugzeiten', () => {
  it.each([true, false])('lässt beim Bedienen einen Terz vor dem Ausspielen auswählen: %s', (announce) => {
    let state = readyState();
    const front = current(state);
    const dealer = otherPlayer(front);
    state = structuredClone(finishTrumpExchange(apply(state, 'acceptOriginal', front)));
    state.G.extraDealUntil = null;
    state.G.trump = 'Clubs';
    state.G.hands[front] = [{ suit: 'Hearts', rank: 'A' }, { suit: 'Spades', rank: 'A' }];
    state.G.hands[dealer] = [
      { suit: 'Hearts', rank: '7' }, { suit: 'Hearts', rank: '8' }, { suit: 'Hearts', rank: '9' },
      { suit: 'Spades', rank: '7' },
    ];
    state = stampDeadline(apply(state, 'playCard', front, [state.G.hands[front][0]]));
    const selectionStartedAt = Date.now();
    state.G.deadlineAt = selectionStartedAt + 500;
    const before = structuredClone(state);
    const card = state.G.hands[dealer][0];
    state = apply(state, 'prepareCard', dealer, [card, ['Terz']]);
    expect(state.G.deadlineAt).toBeGreaterThanOrEqual(selectionStartedAt + state.G.settings.moveTimeSeconds * 1000);
    expect(state.ctx).toEqual(before.ctx);
    expect(state.G.hands).toEqual(before.G.hands);
    expect(state.G.currentTrick).toEqual(before.G.currentTrick);
    expect(state.G.pastTricks).toEqual(before.G.pastTricks);
    expect(state.G.handScores).toEqual(before.G.handScores);
    expect(state.G.shownMelds).toEqual(before.G.shownMelds);
    expect(state.G.chatMessages).toEqual(before.G.chatMessages);
    expect(state.G.meldAnnouncement).toEqual(before.G.meldAnnouncement);
    // Even near the new deadline, cancelling, reopening and toggling cannot buy more time.
    const remainingDeadline = Date.now() + 5_000;
    state.G.deadlineAt = remainingDeadline;
    state = apply(state, 'prepareCard', dealer);
    expect(state.G.timeoutSelection).toBeNull();
    state = apply(state, 'prepareCard', dealer, [state.G.hands[dealer][1], []]);
    state = apply(state, 'prepareCard', dealer, [card, ['Terz']]);
    expect(state.G.deadlineAt).toBe(remainingDeadline);
    const expired = structuredClone(state);
    expired.G.deadlineAt = Date.now() - 1;
    expect(reduceGameMove(expired, { move: 'prepareCard', playerID: dealer, args: [card, []] }).state).toBeNull();
    if (!announce) state = apply(state, 'prepareCard', dealer, [card, []]);
    state = apply(state, 'playCard', dealer, [card, announce ? ['Terz'] : []]);
    expect(state.G.pastTricks).toHaveLength(1);
    expect(state.G.handScoreDetails[dealer].terz).toBe(announce ? 20 : 0);
  });

  it('verlängert die Kartenauswahl ohne verfügbare Meldung nicht', () => {
    let state = readyState();
    const front = current(state);
    state = structuredClone(finishTrumpExchange(apply(state, 'acceptOriginal', front)));
    state.G.extraDealUntil = null;
    state.G.trump = 'Clubs';
    state.G.hands[front] = [{ suit: 'Hearts', rank: '7' }, { suit: 'Spades', rank: 'A' }];
    state.G.deadlineAt = Date.now() + 500;
    const deadline = state.G.deadlineAt;
    state = apply(state, 'prepareCard', front, [state.G.hands[front][0], []]);
    expect(state.G.deadlineAt).toBe(deadline);
    expect(state.G.meldSelectionTurn).not.toBe(state.ctx.turn);
  });

  it.each([true, false])('übernimmt die vorgemerkte Karte mit Terz-Checkbox %s beim Timeout', (announce) => {
    let state = readyState();
    const front = current(state);
    state = apply(state, 'acceptOriginal', front);
    state = structuredClone(finishTrumpExchange(state));
    state.G.extraDealUntil = null;
    state.G.trump = 'Clubs';
    state.G.hands[front] = [
      { suit: 'Hearts', rank: '7' }, { suit: 'Hearts', rank: '8' }, { suit: 'Hearts', rank: '9' },
      { suit: 'Spades', rank: 'A' },
    ];
    state = stampDeadline(state, Date.now());
    const card = state.G.hands[front][0];
    const melds = announce ? ['Terz'] : [];
    state = apply(state, 'prepareCard', front, [card, ['Terz']]);
    const deadline = state.G.deadlineAt;
    if (!announce) state = apply(state, 'prepareCard', front, [card, []]);
    expect(state.G.deadlineAt).toBe(deadline);
    expect(state.G.hands[front]).toHaveLength(4);
    expect(state.G.chatMessages.some((message) => message.text.includes('prepareCard'))).toBe(false);
    const opponent = front === '0' ? '1' : '0';
    expect(createClientState(state, opponent).G.timeoutSelection).toBeNull();
    expect(reduceGameMove(state, { move: 'prepareCard', playerID: opponent, args: [card, []] }).state).toBeNull();
    state.G.deadlineAt = Date.now() - 1;
    const automatic = timeoutAction(state)!;
    expect(automatic).toEqual({ move: 'playCard', playerID: front, args: [card, melds] });
    state = stampDeadline(apply(state, automatic.move, automatic.playerID, automatic.args));
    expect(state.G.hands[front]).not.toContainEqual(card);
    expect(state.G.meldContest?.frontType ?? null).toBe(announce ? 'Terz' : null);
    expect(state.G.timeoutSelection).toBeNull();
  });

  it('setzt die konfigurierte Zugfrist und wählt bei Trumpf-Timeout „Nein“', () => {
    const state = stampDeadline(readyState(), 1_000);

    expect(state.G.deadlineAt).toBe(11_000);
    expect(isDeadlineExpired(state, 10_999)).toBe(false);
    expect(isDeadlineExpired(state, 11_000)).toBe(true);
    expect(timeoutAction(state)).toEqual({ move: 'decline', args: [], playerID: current(state) });
  });

  it('wählt nach einem akzeptierten Kleinen bei Timeout eine erlaubte Farbe', () => {
    let state = readyState();
    state = apply(state, 'decline', current(state));
    state = apply(state, 'decline', current(state));
    state = apply(state, 'announceSmallGame', current(state));
    if (!state.G.smallGameAccepted) state = apply(state, 'acceptSmallGame', current(state));

    const automatic = timeoutAction(state);
    expect(automatic?.move).toBe('chooseTrump');
    expect(automatic?.playerID).toBe(state.G.vorne);
    expect(automatic?.args[0]).not.toBe(state.G.revealedCard?.suit);
  });

  it('lehnt einen nicht beantworteten Dreher nach der längeren Würfelfrist ab', () => {
    let state = readyState();
    const offeringPlayer = current(state);
    state = apply(state, 'doubleCube', offeringPlayer);
    state = stampDeadline(state, 5_000);

    expect(state.G.deadlineAt).toBe(35_000);
    expect(timeoutAction(state)).toEqual({
      move: 'declineCube',
      args: [],
      playerID: offeringPlayer === '0' ? '1' : '0',
    });
  });

  it('wählt die Timeout-Karte vorab und spielt genau diese Karte', () => {
    let state = readyState();
    const front = current(state);
    state = apply(state, 'acceptOriginal', front);
    state = finishTrumpExchange(state);
    state = stampDeadline(state, 1_000, () => 0.999);

    const automatic = timeoutAction(state);
    expect(automatic?.move).toBe('playCard');
    expect(state.G.timeoutCard).not.toBeNull();
    expect(automatic?.args[0]).toEqual(state.G.timeoutCard);
    expect(state.G.hands[front]).toContainEqual(state.G.timeoutCard);
  });

  it('kann eine vollständige Hand ausschließlich mit gültigen Defaultzügen beenden', () => {
    let state = readyState();
    state = apply(state, 'acceptOriginal', current(state));
    state = finishTrumpExchange(state);

    for (let step = 0; state.ctx.phase === 'playing' && step < 50; step += 1) {
      state = stampDeadline(state, Date.now(), () => 0);
      const automatic = timeoutAction(state);
      if (!automatic) throw new Error('Kein Defaultzug verfügbar.');
      state = apply(state, automatic.move, automatic.playerID, automatic.args);
    }

    expect(state.ctx.phase).toBe('endOfHand');
    expect(state.G.hands['0']).toHaveLength(0);
    expect(state.G.hands['1']).toHaveLength(0);
    expect(state.G.pastTricks).toHaveLength(9);
    expect(state.G.lastHandResult).not.toBeNull();
    expect(state.G.trickDisplayUntil).not.toBeNull();
    expect(state.G.trickDisplayUntil!).toBeGreaterThan(Date.now());
    expect(state.G.handScoreDetails['0'].lastTrick + state.G.handScoreDetails['1'].lastTrick).toBe(10);
  });

  it('reserviert nach der Trumpfwahl Zeit für das gestaffelte Aufdecken', () => {
    let state = readyState();
    state = apply(state, 'acceptOriginal', current(state));

    expect(state.G.extraDealStartedAt).not.toBeNull();
    expect(state.G.extraDealUntil).not.toBeNull();
    expect(isExtraDealBeingDisplayed(state)).toBe(true);
    const stamped = stampDeadline(state, Date.now(), () => 0);
    expect(stamped.G.deadlineAt).toBe(stamped.G.extraDealUntil! + stamped.G.settings.moveTimeSeconds * 1000);
  });

  it('reserviert nach einem vollständigen Stich drei Sekunden Anzeigezeit', () => {
    let state = readyState();
    state = apply(state, 'acceptOriginal', current(state));
    state = finishTrumpExchange(state);
    state.G.extraDealStartedAt = null;
    state.G.extraDealUntil = null;
    for (let step = 0; state.G.pastTricks.length === 0 && step < 6; step += 1) {
      state = stampDeadline(state, Date.now(), () => 0);
      const automatic = timeoutAction(state);
      if (!automatic) throw new Error('Defaultzug fehlt.');
      state = apply(state, automatic.move, automatic.playerID, automatic.args);
    }

    expect(state.G.trickDisplayUntil).not.toBeNull();
    expect(state.G.trickDisplayUntil!).toBeGreaterThan(Date.now());
    const stamped = stampDeadline(state, Date.now(), () => 0);
    expect(stamped.G.deadlineAt).toBe(stamped.G.trickDisplayUntil! + stamped.G.settings.moveTimeSeconds * 1000);
  });

  it('verbietet Drehen nach der Zugübergabe, auch mit einer alten gespeicherten Berechtigung', () => {
    let state = readyState();
    const actor = current(state);
    state = apply(state, 'decline', actor);

    const legacy = { ...state, G: { ...state.G, afterMoveDoubleBy: actor } };
    expect(canDouble(legacy.G, legacy.ctx.phase, current(legacy), actor)).toBe(false);
    expect(reduceGameMove(legacy, { move: 'doubleCube', playerID: actor, args: [] }).state).toBeNull();
    expect(canDouble(state.G, state.ctx.phase, current(state), current(state))).toBe(true);
    expect(apply(state, 'doubleCube', current(state)).G.cubeOffer?.from).toBe(current(state));
  });

  it.each(['0', '1'] as const)('startet nach zwei Fortsetzungen direkt neu, wenn %s zuerst bestätigt', (first) => {
    let state = readyState();
    const offeringPlayer = current(state);
    state = apply(state, 'doubleCube', offeringPlayer);
    state = apply(state, 'declineCube', current(state));
    state = stampDeadline(state, 1_000);

    expect(timeoutAction(state)).toEqual({ move: 'pauseMatch', args: [], playerID: '0' });
    state = apply(state, 'pauseMatch', '0');
    expect(state.G.matchPaused).toBe(true);
    const gameNumber = state.G.gameNumber;
    const matchPoints = { ...state.G.matchPoints };
    state = apply(state, 'resumeMatch', first);
    expect(state.G.matchPaused).toBe(true);
    expect(state.ctx.phase).toBe('endOfGame');
    state = apply(state, 'resumeMatch', first);
    expect(state.G.resumePlayers).toEqual([first]);
    state = apply(state, 'resumeMatch', otherPlayer(first));
    expect(state.G.matchPaused).toBe(false);
    expect(state.ctx.phase).toBe('trumpSelection');
    expect(state.G.gameNumber).toBe(gameNumber + 1);
    expect(state.G.handNumber).toBe(1);
    expect(state.G.gameResult).toBeNull();
    expect(state.G.lastHandResult).toBeNull();
    expect(state.G.matchPoints).toEqual(matchPoints);
    expect(state.G.cube).toEqual({ value: 1, holder: null });
    expect(state.G.resumePlayers).toEqual([]);
    expect(state.G.nextGamePlayers).toEqual([]);
    expect(state.G.hands['0']).toHaveLength(6);
    expect(state.G.hands['1']).toHaveLength(6);
    expect(state.G.chatMessages.at(-1)?.text).toMatch(/liegt offen\.$/);
  });

  it.each(['0', '1'] as const)('lässt Spieler %s das pausierte Match endgültig verlassen', (playerID) => {
    let state = readyState();
    state = apply(state, 'doubleCube', current(state));
    state = apply(state, 'declineCube', current(state));
    state = apply(state, 'pauseMatch', '0');
    state = apply(state, 'resumeMatch', playerID);
    state = apply(state, 'endMatch', playerID);
    expect(state.G.matchResult?.endedBy).toBe(playerID);
    expect(state.ctx.gameover).toEqual(state.G.matchResult);
    expect(state.G.deadlineAt).toBeNull();
    for (const viewer of ['0', '1'] as const) {
      expect(createClientState(state, viewer).G.matchResult?.endedBy).toBe(playerID);
    }
    expect(timeoutAction(state)).toBeNull();
  });
});
