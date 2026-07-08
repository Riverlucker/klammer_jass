import { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Card, Suit, createDeck, SUITS } from './constants';

export interface JassState {
  deck: Card[];
  hands: Record<string, Card[]>;
  trump: Suit | null;
  revealedCard: Card | null;
  dealer: string;
  vorne: string;
  scores: Record<string, number>; // Game scores up to 301
  handScores: Record<string, number>; // Scores for the current hand
  cube: {
    value: number;
    holder: string | null; // '0' or '1' or null (middle)
  };
  cubeOffer: {
    from: string;
    pending: boolean;
  } | null;
  // TODO: Add fields for melding and tricks
}

export const JassGame: Game<JassState> = {
  name: 'klammer-jass',

  setup: (ctx) => ({
    deck: createDeck(),
    hands: { '0': [], '1': [] },
    trump: null,
    revealedCard: null,
    dealer: '0', // Randomize in reality
    vorne: '1',
    scores: { '0': 0, '1': 0 },
    handScores: { '0': 0, '1': 0 },
    cube: { value: 1, holder: null },
    cubeOffer: null,
  }),

  phases: {
    deal: {
      start: true,
      onBegin: (G, ctx) => {
        G.deck = ctx.random!.Shuffle(G.deck);
        // Deal 6 cards each
        G.hands['0'] = G.deck.splice(0, 6);
        G.hands['1'] = G.deck.splice(0, 6);
        // Reveal card
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
        acceptOriginal: (G, ctx) => {
          G.trump = G.revealedCard!.suit;
          // Deal remaining 3 cards
          G.hands['0'].push(...G.deck.splice(0, 3));
          G.hands['1'].push(...G.deck.splice(0, 3));
          ctx.events?.endPhase();
        },
        pass: (G, ctx) => {
          // Logic for passing trump selection
        },
        doubleCube: (G, ctx) => {
           G.cubeOffer = { from: ctx.currentPlayer, pending: true };
        },
        acceptCube: (G, ctx) => {
           if (G.cubeOffer) {
               G.cube.value *= 2;
               G.cube.holder = ctx.currentPlayer;
               G.cubeOffer = null;
           }
        },
        declineCube: (G, ctx) => {
           // Current player declines, the other player wins the match immediately
           // Handle match win
        }
      },
      next: 'melding',
    },
    melding: {
       next: 'playing',
    },
    playing: {
      // Trick taking logic
    }
  }
};
