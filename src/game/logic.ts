import { Game } from 'boardgame.io';
import { createDeck } from './constants';
import { JassState } from './types';
import * as JassMoves from './moves';
import * as PlayMoves from './playMoves';

export const JassGame: Game<JassState> = {
  name: 'klammer-jass',

  setup: (ctx) => ({
    deck: createDeck(),
    hands: { '0': [], '1': [] },
    trump: null,
    revealedCard: null,
    dealer: '0', // In a real game, this alternates or follows the winner of the hand
    vorne: '1',
    scores: { '0': 0, '1': 0 },
    handScores: { '0': 0, '1': 0 },
    cube: { value: 1, holder: null },
    cubeOffer: null,
    smallGameAnnounced: false,
    trumpSelectionPassedCount: 0,
    pendingMeld: null,
    shownMelds: [],
    currentTrick: { leadPlayer: '1', cards: {}, winner: null },
    pastTricks: [],
    trickWinner: null,
  }),

  phases: {
    deal: {
      start: true,
      onBegin: (G, ctx) => {
        G.deck = ctx.random!.Shuffle(G.deck);
        G.hands['0'] = G.deck.splice(0, 6);
        G.hands['1'] = G.deck.splice(0, 6);
        G.revealedCard = G.deck.splice(0, 1)[0];
        ctx.events?.endPhase();
      },
      next: 'trumpSelection',
    },
    trumpSelection: {
      turn: {
        order: {
          first: (G, ctx) => Number(G.vorne),
          next: (G, ctx) => (ctx.playOrderPos + 1) % ctx.numPlayers,
        }
      },
      moves: {
        acceptOriginal: JassMoves.acceptOriginal,
        decline: JassMoves.decline,
        announceSmallGame: JassMoves.announceSmallGame,
        acceptSmallGame: JassMoves.acceptSmallGame,
        overruleSmallGame: JassMoves.overruleSmallGame,
        chooseTrump: JassMoves.chooseTrump,
        doubleCube: JassMoves.doubleCube,
        acceptCube: JassMoves.acceptCube,
        declineCube: JassMoves.declineCube,
      },
      next: 'melding',
    },
    melding: {
      moves: {
        playCardAndMeld: PlayMoves.playCardAndMeld,
        replyToMeld: PlayMoves.replyToMeld,
        declareMeldHeight: PlayMoves.declareMeldHeight,
      },
      next: 'playing',
    },
    playing: {
      moves: {
        playCard: PlayMoves.playCard,
      },
    }
  }
};
