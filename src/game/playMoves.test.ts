import { describe, expect, it } from 'vitest';
import type { State } from 'boardgame.io';
import { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
import type { Card } from './constants';
import { JassGame } from './logic';
import { appendDealerComments } from './chat';
import type { JassState, PlayerID } from './types';
import { isPlayerID, otherPlayer } from './types';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const action = (type: string, playerID: PlayerID, args: unknown[] = []) => ({
  type: 'MAKE_MOVE' as const,
  payload: { type, args, playerID },
});

function finishTrumpExchange(state: State<JassState>, reduce: ReturnType<typeof CreateGameReducer>): State<JassState> {
  if (state.ctx.phase !== 'trumpExchange') return state;
  const player = (['0', '1'] as PlayerID[]).find((id) => !state.G.trumpSevenDecisions.includes(id));
  return player ? reduce(state, action('keepTrumpSeven', player)) as State<JassState> : state;
}

describe('Meldungsverhandlung', () => {
  it('wertet nach „Ist gut“ alle getrennten Folgen des vorderen Spielers', () => {
    const reduce = CreateGameReducer({ game: JassGame });
    let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as State<JassState>;
    state = reduce(state, action('setReady', '0')) as State<JassState>;
    state = reduce(state, action('setReady', '1')) as State<JassState>;
    if (!isPlayerID(state.ctx.currentPlayer)) throw new Error('Aktueller Spieler fehlt.');
    const front = state.ctx.currentPlayer;
    const dealer = otherPlayer(front);
    state = reduce(state, action('acceptOriginal', front)) as State<JassState>;
    state = finishTrumpExchange(state, reduce);

    state = structuredClone(state);
    state.G.trump = 'Clubs';
    state.G.declarer = front;
    state.G.hands[front] = [
      card('Spades', '7'), card('Spades', '8'), card('Spades', '9'),
      card('Hearts', '9'), card('Hearts', '10'), card('Hearts', 'J'),
      card('Clubs', 'A'), card('Diamonds', '7'), card('Diamonds', 'K'),
    ];
    state.G.hands[dealer] = [
      card('Spades', 'A'), card('Spades', 'K'), card('Hearts', 'A'),
      card('Hearts', 'K'), card('Clubs', '7'), card('Clubs', '9'),
      card('Diamonds', 'A'), card('Diamonds', 'Q'), card('Diamonds', '10'),
    ];

    state = reduce(state, action('playCard', front, [card('Spades', '7'), ['Terz']])) as State<JassState>;
    expect(state.G.meldContest?.stage).toBe('awaitingResponse');

    state = reduce(state, action('respondMeld', dealer, ['good', 'Bravo'])) as State<JassState>;
    expect(state.G.meldContest?.stage).toBe('dealerPlay');
    expect(state.G.meldContest?.replyComment).toBe('Bravo');

    const beforeAward = state;
    state = structuredClone(reduce(state, action('playCard', dealer, [card('Spades', 'A')])) as State<JassState>);
    appendDealerComments(beforeAward, state, { move: 'playCard', playerID: dealer, args: [card('Spades', 'A')] });
    expect(state.G.chatMessages.filter((message) => message.meldCards).map((message) => message.text)).toEqual([
      'Terz geht ♠ 9, ♠ 8, ♠ 7',
      'Terz geht ♥ J, ♥ 10, ♥ 9',
    ]);
    expect(state.G.meldContest).toBeNull();
    expect(state.G.shownMelds).toHaveLength(2);
    expect(state.G.handScoreDetails[front].melds).toBe(40);
  });

  it('weist Jass und Mi in der Sonderwertung getrennt aus', () => {
    const reduce = CreateGameReducer({ game: JassGame });
    let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as State<JassState>;
    state = reduce(state, action('setReady', '0')) as State<JassState>;
    state = reduce(state, action('setReady', '1')) as State<JassState>;
    if (!isPlayerID(state.ctx.currentPlayer)) throw new Error('Aktueller Spieler fehlt.');
    const front = state.ctx.currentPlayer;
    const dealer = otherPlayer(front);
    state = reduce(state, action('acceptOriginal', front)) as State<JassState>;
    state = finishTrumpExchange(state, reduce);

    state = structuredClone(state);
    state.G.trump = 'Clubs';
    state.G.declarer = front;
    state.G.hands[front] = [card('Clubs', 'J')];
    state.G.hands[dealer] = [card('Clubs', '9')];
    state = reduce(state, action('playCard', front, [card('Clubs', 'J')])) as State<JassState>;
    state = reduce(state, action('playCard', dealer, [card('Clubs', '9')])) as State<JassState>;

    expect(state.G.handScoreDetails[front].jass).toBe(20);
    expect(state.G.handScoreDetails[front].mi).toBe(14);
    expect(state.G.handScoreDetails[front].tricks).toBe(36);
    expect(state.G.handScoreDetails[front].lastTrick).toBe(10);
  });
});
