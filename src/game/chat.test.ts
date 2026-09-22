import { describe, expect, it } from 'vitest';
import { InitializeGame } from 'boardgame.io/internal';
import { appendDealerComments, appendPlayerChat } from './chat';
import { JassGame } from './logic';
import { createClientState } from './playerView';
import { revealedMeldCards } from './meldReveal';
import type { ServerGameState } from './types';

function initialState(): ServerGameState {
  return InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
}

describe('Tisch-Chat', () => {
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
      'Gast spielt Herz Ass.',
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
      text: 'Gast wählt Herz als Trumpf.',
      speechText: 'Herz!',
    });
  });
});
