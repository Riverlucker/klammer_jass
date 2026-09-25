import { describe, expect, it } from 'vitest';
import { InitializeGame } from 'boardgame.io/internal';
import { appendDealerComments, appendPlayerChat, formatSuitNames } from './chat';
import { JassGame } from './logic';
import { createClientState } from './playerView';
import { revealedMeldCards } from './meldReveal';
import { reduceGameMove } from './serverEngine';
import type { ServerGameState } from './types';

function initialState(): ServerGameState {
  return InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
}

describe('Tisch-Chat', () => {
  it('nennt die offene Karte nach dem Geben und unterscheidet beide Verhandlungsrunden', () => {
    let state = initialState();
    state = reduceGameMove(state, { move: 'setReady', playerID: '0', args: [] }).state!;
    expect(state.G.chatMessages.some((message) => message.text.endsWith('liegt offen.'))).toBe(false);
    state = reduceGameMove(state, { move: 'setReady', playerID: '1', args: [] }).state!;
    const announcement = state.G.chatMessages.at(-1)!;
    expect(announcement).toMatchObject({ kind: 'dealer', playerId: null });
    expect(announcement.text).toMatch(/^(7|8|9|10|J|Q|K|A) [♠♥♦♣] liegt offen\.$/);
    expect(announcement.text.startsWith(`${state.G.revealedCard!.rank} `)).toBe(true);
    expect(announcement.speech).toBeUndefined();

    for (const expected of ['Nein!', 'Nein!', 'Immer noch nicht!', 'Neu geben!']) {
      const before = state.G.chatMessages.length;
      state = reduceGameMove(state, { move: 'decline', playerID: state.G.vorne === state.ctx.currentPlayer ? state.G.vorne : state.G.dealer, args: [] }).state!;
      expect(state.G.chatMessages[before].speechText).toBe(expected);
      expect(state.G.chatMessages[before].speech).toBe('trump');
      if (expected === 'Immer noch nicht!') expect(state.G.chatMessages[before].text).toContain('sagt „Immer noch nicht“.');
    }
    expect(state.G.chatMessages.filter((message) => message.text.endsWith('liegt offen.'))).toHaveLength(2);
    expect(state.G.chatMessages.at(-2)?.text).toBe('Alle haben gepasst – der Dealer gibt neu.');
    expect(state.G.chatMessages.at(-1)?.text).toContain(`${state.G.revealedCard!.rank} `);
  });

  it.each(['nextHand', 'nextGame'] as const)('nennt auch bei %s dieselbe erneut aufgedeckte Karte', (move) => {
    const previous = structuredClone(initialState());
    previous.ctx.phase = move === 'nextHand' ? 'endOfHand' : 'endOfGame';
    previous.G.revealedCard = { suit: 'Diamonds', rank: 'K' };
    const next = structuredClone(previous);
    next.ctx.phase = 'trumpSelection';
    if (move === 'nextHand') next.G.handNumber += 1;
    else next.G.gameNumber += 1;
    appendDealerComments(previous, next, { move, playerID: '0', args: [] });
    expect(next.G.chatMessages.at(-1)).toMatchObject({ text: 'K ♦ liegt offen.', playerId: null, gameNumber: next.G.gameNumber, handNumber: next.G.handNumber });
  });

  it('verrät beim Verzicht aufs Räubern weder im Chat noch in der Sprechblase die 7', () => {
    const previous = initialState();
    const next = structuredClone(previous);
    appendDealerComments(previous, next, { move: 'keepTrumpSeven', args: [], playerID: '1' });
    for (const viewer of ['0', '1'] as const) {
      expect(createClientState(next, viewer).G.chatMessages).toEqual([]);
    }
  });

  it('kommentiert einen tatsächlich ausgeführten Tausch weiterhin öffentlich', () => {
    const previous = structuredClone(initialState());
    previous.G.revealedCard = { suit: 'Spades', rank: 'A' };
    const next = structuredClone(previous);
    next.G.revealedCard = { suit: 'Spades', rank: '7' };
    appendDealerComments(previous, next, { move: 'exchangeTrumpSeven', args: [], playerID: '1' });
    expect(createClientState(next, '0').G.chatMessages[0]).toMatchObject({
      text: 'Gast nimmt sich das ♠ Ass mit der 7.',
      speechText: 'Ich nehme mir das ♠ Ass mit der 7!',
    });
  });

  it('zeigt auch alte Chattexte mit Farbsymbolen', () => {
    expect(formatSuitNames('Pik Ass, Herz König, Karo 7 und Kreuz Bube')).toBe('♠ Ass, ♥ König, ♦ 7 und ♣ Bube');
  });

  it('blendet alte automatische 7-Hinweise aus gespeicherten Matches aus', () => {
    const state = structuredClone(initialState());
    state.G.chatMessages = [
      { id: 1, kind: 'dealer', playerId: '1', text: 'Gast behält die passende 7 auf der Hand.', speechText: 'Ich behalte die passende 7!', createdAt: 1000 },
      { id: 2, kind: 'player', playerId: '1', text: 'Ich behalte die passende 7!', createdAt: 2000 },
    ];
    expect(createClientState(state, '0').G.chatMessages.map((message) => message.id)).toEqual([2]);
    expect(state.G.chatMessages).toHaveLength(2);
  });

  it('nennt eine automatisch gültige Terz und zeigt nur ihre ungespielten Karten drei Sekunden lang', () => {
    const previous = initialState();
    const next = structuredClone(previous);
    const cards = [
      { suit: 'Hearts', rank: '7' },
      { suit: 'Hearts', rank: '8' },
      { suit: 'Hearts', rank: '9' },
    ] as const;
    next.G.shownMelds.push({ player: '1', type: 'Terz', points: 20, cards: [...cards] });
    next.G.pastTricks.push({ leadPlayer: '1', cards: { '1': cards[0] }, winner: '1' });
    appendDealerComments(previous, next, {
      move: 'playCard', args: [cards[0], ['Terz']], playerID: '1',
    }, 15_000);
    expect(next.G.chatMessages.at(-1)).toMatchObject({
      playerId: '1', speech: 'meld', text: 'Terz geht ♥ 9, ♥ 8, ♥ 7',
      meldCards: [cards[2], cards[1], cards[0]], createdAt: 15_000,
    });
    const view = createClientState(next, '0');
    expect(view.G.hands['1']).toEqual([]);
    expect(revealedMeldCards(view.G, '1', 15_000)).toEqual([cards[2], cards[1]]);
    expect(revealedMeldCards(view.G, '1', 17_999)).toHaveLength(2);
    expect(revealedMeldCards(view.G, '1', 18_000)).toEqual([]);
    expect(revealedMeldCards(view.G, '0', 15_000)).toEqual([]);
    view.G.handNumber += 1;
    expect(revealedMeldCards(view.G, '1', 15_000)).toEqual([]);
    const after = structuredClone(next);
    appendDealerComments(next, after, { move: 'playCard', args: [cards[1]], playerID: '1' }, 16_000);
    expect(after.G.chatMessages.filter((message) => message.meldCards)).toHaveLength(1);
  });

  it('speichert Spielernachrichten ohne Zugnummer oder Deadline zu verändern', () => {
    const state = structuredClone(initialState());
    state.G.deadlineAt = 42_000;

    const next = appendPlayerChat(state, '0', '  Viel Glück!  ', 12_000);

    expect(next._stateID).toBe(state._stateID);
    expect(next.G.deadlineAt).toBe(42_000);
    expect(next.G.chatMessages).toEqual([{
      id: 1,
      kind: 'player',
      playerId: '0',
      speech: 'chat',
      text: 'Viel Glück!',
      createdAt: 12_000,
      gameNumber: 1,
      handNumber: 1,
    }]);
  });

  it('kommentiert ausgespielte Karten und Meldungen getrennt als Dealer', () => {
    const previous = initialState();
    const next = structuredClone(previous);

    appendDealerComments(previous, next, {
      move: 'playCard',
      args: [{ suit: 'Hearts', rank: 'A' }, ['Terz', 'Bella']],
      playerID: '1',
    }, 15_000);

    expect(next.G.chatMessages.map((message) => message.text)).toEqual([
      'Gast spielt ♥ Ass.',
      'Gast meldet Terz.',
      'Gast meldet Bella.',
    ]);
    expect(next.G.chatMessages.every((message) => message.kind === 'dealer')).toBe(true);
    expect(next.G.chatMessages.map((message) => [message.playerId, message.speech])).toEqual([
      [null, undefined],
      ['1', 'meld'],
      ['1', 'meld'],
    ]);
    expect(next.G.meldAnnouncement).toEqual({
      playerId: '1',
      melds: ['Terz', 'Bella'],
      createdAt: 15_000,
    });
  });

  it('erzeugt bei einem normalen Kartenzug keine Sprechblase', () => {
    const previous = initialState();
    const next = structuredClone(previous);

    appendDealerComments(previous, next, {
      move: 'playCard',
      args: [{ suit: 'Clubs', rank: '8' }],
      playerID: '0',
    }, 21_000);

    expect(next.G.meldAnnouncement).toBeNull();
    expect(next.G.chatMessages[0]).not.toHaveProperty('speech');
    expect(next.G.chatMessages[0]?.playerId).toBeNull();
  });

  it('markiert Aussagen aus der Trumpfverhandlung für die Avatar-Sprechblase', () => {
    const previous = initialState();
    const next = structuredClone(previous);

    appendDealerComments(previous, next, {
      move: 'chooseTrump',
      args: ['Hearts'],
      playerID: '1',
    }, 24_000);

    expect(next.G.chatMessages[0]).toMatchObject({
      playerId: '1',
      speech: 'trump',
      text: 'Gast wählt ♥ als Trumpf.',
      speechText: '♥!',
    });
  });
});
