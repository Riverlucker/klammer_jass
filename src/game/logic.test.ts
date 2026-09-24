import { describe, expect, it } from 'vitest';
import type { State } from 'boardgame.io';
import { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
import { JassGame } from './logic';
import type { JassState, PlayerID } from './types';
import { isPlayerID, otherPlayer } from './types';

function move(type: string, playerID: PlayerID, args: unknown[] = []) {
  return { type: 'MAKE_MOVE' as const, payload: { type, args, playerID } };
}

function current(state: State<JassState>): PlayerID {
  if (!isPlayerID(state.ctx.currentPlayer)) throw new Error('Kein gültiger aktueller Spieler.');
  return state.ctx.currentPlayer;
}

function readyState() {
  const reduce = CreateGameReducer({ game: JassGame });
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as State<JassState>;
  state = reduce(state, move('setReady', '0')) as State<JassState>;
  state = reduce(state, move('setReady', '1')) as State<JassState>;
  return { reduce, state };
}

describe('Spielphasen', () => {
  it('räubert Herz-König mit Herz-7 beim Kleinen mit Kreuz-Trumpf', () => {
    const initial = readyState();
    const reduce = initial.reduce;
    let state = structuredClone(initial.state);
    state.G.revealedCard = { suit: 'Hearts', rank: 'K' };
    state.G.deck = state.G.deck.filter((card) => !(card.suit === 'Hearts' && card.rank === '7'));
    for (const id of ['0', '1'] as const) {
      state.G.hands[id] = state.G.hands[id].filter((card) => !(card.suit === 'Hearts' && card.rank === '7'));
    }
    const robber = state.G.vorne;
    state.G.hands[robber].push({ suit: 'Hearts', rank: '7' });
    for (let i = 0; i < 3; i++) state = reduce(state, move('decline', current(state))) as State<JassState>;
    state = reduce(state, move('chooseTrump', current(state), ['Clubs'])) as State<JassState>;
    expect(state.ctx.phase).toBe('playing');
    state = reduce(state, move('exchangeTrumpSeven', robber)) as State<JassState>;
    expect(state.G.hands[robber]).toContainEqual({ suit: 'Hearts', rank: 'K' });
    expect(state.G.hands[robber]).not.toContainEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.revealedCard).toEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.trump).toBe('Clubs');
    expect(state.ctx.phase).toBe('playing');
  });

  it('akzeptiert das Kleine bei Kreuz-Original sofort und lässt nur andere Farben zu', () => {
    const initial = readyState();
    const reduce = initial.reduce;
    let state = structuredClone(initial.state);
    state.G.revealedCard = { suit: 'Clubs', rank: 'A' };
    state = reduce(state, move('decline', current(state))) as State<JassState>;
    state = reduce(state, move('decline', current(state))) as State<JassState>;
    const front = current(state);
    state = reduce(state, move('announceSmallGame', front)) as State<JassState>;
    expect(state.G.smallGameAccepted).toBe(true);
    expect(current(state)).toBe(front);
    const forbidden = reduce(state, move('chooseTrump', front, ['Clubs'])) as State<JassState>;
    expect(forbidden.G.trump).toBeNull();
    state = reduce(state, move('chooseTrump', front, ['Hearts'])) as State<JassState>;
    expect(state.G.trump).toBe('Hearts');
    expect(state.G.declarer).toBe(front);
  });

  it('verbietet Besser mit Kreuz auch bei einer bereits laufenden Kreuz-Original-Verhandlung', () => {
    const initial = readyState();
    let state = structuredClone(initial.state);
    state.G.revealedCard = { suit: 'Hearts', rank: 'A' };
    const reduce = initial.reduce;
    state = reduce(state, move('decline', current(state))) as State<JassState>;
    state = reduce(state, move('decline', current(state))) as State<JassState>;
    state = reduce(state, move('announceSmallGame', current(state))) as State<JassState>;
    expect(state.G.smallGameAccepted).toBe(false);
    expect(current(state)).toBe(state.G.dealer);
    state = structuredClone(state);
    state.G.revealedCard = { suit: 'Clubs', rank: 'A' };
    state = reduce(state, move('overruleSmallGame', current(state))) as State<JassState>;
    expect(state.G.trump).toBeNull();
  });

  it('lost den ersten Dealer aus und gibt sechs Karten plus offene Karte', () => {
    const { state } = readyState();

    expect(['0', '1']).toContain(state.G.dealer);
    expect(state.G.vorne).toBe(otherPlayer(state.G.dealer));
    expect(state.G.hands['0']).toHaveLength(6);
    expect(state.G.hands['1']).toHaveLength(6);
    expect(state.G.revealedCard).not.toBeNull();
  });

  it('wechselt nach vier Neins den Dealer und gibt neu', () => {
    const { reduce } = readyState();
    let { state } = readyState();
    const originalDealer = state.G.dealer;

    for (let pass = 0; pass < 4; pass += 1) {
      state = reduce(state, move('decline', current(state))) as State<JassState>;
    }

    expect(state.ctx.phase).toBe('trumpSelection');
    expect(state.G.trump).toBeNull();
    expect(state.G.hands['0']).toHaveLength(6);
    expect(state.G.redealCount).toBe(1);
    expect(state.G.dealer).toBe(otherPlayer(originalDealer));
  });

  it('erlaubt einen Dreher bereits während der Trumpfverhandlung', () => {
    const { reduce } = readyState();
    let { state } = readyState();
    const offeringPlayer = current(state);

    state = reduce(state, move('doubleCube', offeringPlayer)) as State<JassState>;
    expect(state.G.cubeOffer?.from).toBe(offeringPlayer);

    state = reduce(state, move('declineCube', current(state))) as State<JassState>;
    expect(state.ctx.phase).toBe('endOfGame');
    expect(state.G.matchPoints[offeringPlayer]).toBe(1);
    expect(state.G.gameResult?.reason).toBe('cube-declined');
  });

  it('tauscht die Trumpf-7 vor dem ersten Stich gegen die offene Originalkarte', () => {
    const { reduce } = readyState();
    let { state } = readyState();
    const player = current(state);
    state = structuredClone(state);
    for (const id of ['0', '1'] as PlayerID[]) {
      state.G.hands[id] = state.G.hands[id].map((card) =>
        card.suit === 'Hearts' && card.rank === '7' ? { suit: 'Spades', rank: '7' } : card,
      );
    }
    state.G.deck = state.G.deck.map((card) =>
      card.suit === 'Hearts' && card.rank === '7' ? { suit: 'Spades', rank: '7' } : card,
    );
    state.G.revealedCard = { suit: 'Hearts', rank: 'A' };
    state.G.hands[player][0] = { suit: 'Hearts', rank: '7' };

    state = reduce(state, move('acceptOriginal', player)) as State<JassState>;
    expect(state.ctx.phase).toBe('playing');

    state = reduce(state, move('exchangeTrumpSeven', player)) as State<JassState>;
    expect(state.ctx.phase).toBe('playing');
    expect(state.G.revealedCard).toEqual({ suit: 'Hearts', rank: '7' });
    expect(state.G.hands[player]).toContainEqual({ suit: 'Hearts', rank: 'A' });
    expect(state.G.hands[player]).not.toContainEqual({ suit: 'Hearts', rank: '7' });
  });

  it('startet ohne Tauschmöglichkeit direkt mit dem ersten Stich', () => {
    const { reduce } = readyState();
    let { state } = readyState();
    const player = current(state);
    state = structuredClone(state);
    state.G.revealedCard = { suit: 'Diamonds', rank: '7' };

    state = reduce(state, move('acceptOriginal', player)) as State<JassState>;

    expect(state.ctx.phase).toBe('playing');
    expect(state.G.trumpSevenDecisions).toEqual([]);
    expect(state.G.revealedCard).toEqual({ suit: 'Diamonds', rank: '7' });
  });
});
