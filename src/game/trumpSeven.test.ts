import { InitializeGame } from 'boardgame.io/internal';
import { describe, expect, it } from 'vitest';
import { createDeck, type Card } from './constants';
import { JassGame } from './logic';
import { armDecisionTimer } from './decisionTimer';
import { createClientState } from './playerView';
import { reduceGameMove, timeoutAction } from './serverEngine';
import { canExchangeTrumpSeven } from './trumpSeven';
import type { PlayerID, ServerGameState } from './types';

function apply(state: ServerGameState, move: string, playerID: PlayerID, args: unknown[] = []) {
  const result = reduceGameMove(state, { move, playerID, args });
  if (!result.state) throw new Error(`${move}: ${result.errorType}`);
  return result.state;
}

function setup(holder: 'front' | 'dealer' = 'dealer', contract: 'original' | 'small' | 'better' = 'original', drawSeven = false) {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  state = apply(state, 'setReady', '0');
  state = structuredClone(apply(state, 'setReady', '1'));
  const { vorne: front, dealer } = state.G;
  const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
  state.G.revealedCard = c('Hearts', 'A');
  state.G.hands[front] = [c('Clubs', '8'), c('Clubs', '9'), c('Clubs', '10'), c('Spades', '8'), c('Spades', 'Q'), c('Diamonds', '8')];
  state.G.hands[dealer] = [c('Hearts', '7'), c('Clubs', '7'), c('Clubs', 'J'), c('Spades', '9'), c('Diamonds', 'K'), c('Diamonds', 'A')];
  if (holder === 'front') [state.G.hands[front][4], state.G.hands[dealer][0]] = [state.G.hands[dealer][0], state.G.hands[front][4]];
  const used = [...state.G.hands[front], ...state.G.hands[dealer], state.G.revealedCard];
  state.G.deck = createDeck().filter((card) => !used.some((other) => card.suit === other.suit && card.rank === other.rank));
  if (drawSeven) {
    const hand = state.G.hands[holder === 'front' ? front : dealer];
    const index = hand.findIndex((card) => card.suit === 'Hearts' && card.rank === '7');
    const deckIndex = (holder === 'front' ? front : dealer) === '0' ? 0 : 3;
    [hand[index], state.G.deck[deckIndex]] = [state.G.deck[deckIndex], hand[index]];
  }
  if (contract === 'original') {
    state = apply(state, 'acceptOriginal', front);
  } else {
    state = apply(state, 'decline', front);
    state = apply(state, 'decline', dealer);
    state = apply(state, 'announceSmallGame', front);
    if (contract === 'better') {
      state = apply(state, 'overruleSmallGame', dealer);
    } else {
      state = apply(state, 'acceptSmallGame', dealer);
      state = apply(state, 'chooseTrump', front, ['Clubs']);
    }
  }
  state = armDecisionTimer(state);
  return { state, front, dealer };
}

describe('Räubern erst beim eigenen ersten Zug', () => {
  it.each(['front', 'dealer'] as const)('bietet %s beim Kleinen auch eine erst nachgegebene passende 7 an', (holder) => {
    let { state } = setup(holder, 'small', true);
    const player = holder === 'front' ? state.G.vorne : state.G.dealer;
    expect(state.G.hands[player].slice(-3)).toContainEqual({ suit: 'Hearts', rank: '7' });
    if (holder === 'dealer') state = apply(state, 'playCard', state.G.vorne, [{ suit: 'Clubs', rank: '8' }]);
    expect(canExchangeTrumpSeven(createClientState(state, player).G, player)).toBe(true);
    expect(apply(state, 'exchangeTrumpSeven', player).G.hands[player]).toContainEqual({ suit: 'Hearts', rank: 'A' });
  });

  it.each([
    ['front', 'small'], ['dealer', 'small'], ['front', 'better'], ['dealer', 'better'],
  ] as const)('räubert als %s beim %s die offene Herz-Karte trotz Kreuz-Trumpf', (holder, contract) => {
    let { state } = setup(holder, contract);
    const player = holder === 'front' ? state.G.vorne : state.G.dealer;
    if (holder === 'dealer') state = apply(state, 'playCard', state.G.vorne, [{ suit: 'Clubs', rank: '8' }]);
    expect(state.G.contract).toBe('small');
    expect(state.G.trump).toBe('Clubs');
    expect(canExchangeTrumpSeven(createClientState(state, player).G, player)).toBe(true);
    state = apply(state, 'exchangeTrumpSeven', player);
    expect(state.G.hands[player]).toContainEqual({ suit: 'Hearts', rank: 'A' });
    expect(state.G.hands[player]).not.toContainEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.revealedCard).toEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.trump).toBe('Clubs');
    expect(state.ctx.currentPlayer).toBe(player);
  });

  it('lässt A sofort ausspielen, obwohl B die 7 hält, und B erst danach räubern', () => {
    let { state } = setup();
    const { vorne: front, dealer } = state.G;
    expect(state.ctx.phase).toBe('playing');
    expect(state.ctx.currentPlayer).toBe(front);
    expect(state.G.decisionTimer?.waitingFor).toEqual([front]);
    expect(reduceGameMove(state, { move: 'exchangeTrumpSeven', playerID: dealer, args: [] }).state).toBeNull();
    state = apply(state, 'playCard', front, [{ suit: 'Clubs', rank: '8' }]);
    expect(state.ctx.currentPlayer).toBe(dealer);
    expect(canExchangeTrumpSeven(state.G, dealer)).toBe(true);
    const lead = state.G.currentTrick.cards[front];
    state = apply(state, 'exchangeTrumpSeven', dealer);
    expect(state.G.hands[dealer]).toContainEqual({ suit: 'Hearts', rank: 'A' });
    expect(state.G.revealedCard).toEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.currentTrick.cards[front]).toEqual(lead);
    expect(state.ctx.currentPlayer).toBe(dealer);
    state = apply(state, 'playCard', dealer, [{ suit: 'Clubs', rank: 'J' }]);
    expect(state.G.pastTricks).toHaveLength(1);
  });

  it('lässt A vor seinem Ausspiel räubern und danach selbst die erste Karte legen', () => {
    const { state, front } = setup('front');
    const next = apply(state, 'exchangeTrumpSeven', front);
    expect(next.ctx.currentPlayer).toBe(front);
    expect(next.ctx.turn).toBe(state.ctx.turn);
    expect(next.G.currentTrick.cards).toEqual({});
    expect(canExchangeTrumpSeven(next.G, front)).toBe(false);
    expect(apply(next, 'playCard', front, [{ suit: 'Clubs', rank: '8' }]).ctx.currentPlayer).toBe(state.G.dealer);
  });

  it('verzichtet durch normales Ausspielen stillschweigend auf das Räubern', () => {
    const { state, front } = setup('front');
    const next = apply(state, 'playCard', front, [{ suit: 'Clubs', rank: '8' }]);
    expect(canExchangeTrumpSeven(next.G, front)).toBe(false);
    expect(next.G.revealedCard).toEqual({ suit: 'Hearts', rank: 'A' });
    expect(next.G.hands[front]).toContainEqual({ suit: 'Hearts', rank: '7' });
    expect(createClientState(next, next.G.dealer).G.trumpSevenDecisions).not.toContain(front);
    expect(next.G.chatMessages.some((message) => /behält.*7/.test(message.text))).toBe(false);
  });

  it('behält beim ausdrücklichen Verzicht Zugrecht und laufende Frist', () => {
    const { state, front } = setup('front');
    const next = apply(state, 'keepTrumpSeven', front);
    expect(next.ctx.currentPlayer).toBe(front);
    expect(next.G.deadlineAt).toBe(state.G.deadlineAt);
    expect(next.G.decisionTimer).toEqual(state.G.decisionTimer);
    expect(next.G.chatMessages).toEqual(state.G.chatMessages);
  });

  it('spielt beim Timeout direkt eine Karte, auch wenn Räubern möglich wäre', () => {
    const { state, front } = setup('front');
    const action = timeoutAction(state)!;
    expect(action.move).toBe('playCard');
    expect(action.playerID).toBe(front);
    expect(reduceGameMove(state, action).state?.ctx.currentPlayer).toBe(state.G.dealer);
  });

  it('erlaubt B Räubern vor der Meldungsantwort, aber nicht nach einer verbindlichen Antwort', () => {
    const initial = setup();
    let state = apply(initial.state, 'playCard', initial.front, [{ suit: 'Clubs', rank: '8' }, ['Terz']]);
    expect(canExchangeTrumpSeven(state.G, initial.dealer)).toBe(true);
    const response = timeoutAction(state)!;
    expect(response.move).toBe('respondMeld');
    state = apply(state, response.move, response.playerID, response.args);
    expect(canExchangeTrumpSeven(state.G, initial.dealer)).toBe(false);
    expect(reduceGameMove(state, { move: 'exchangeTrumpSeven', playerID: initial.dealer, args: [] }).state).toBeNull();
  });
});
