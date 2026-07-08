import { Move } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { JassState } from './types';
import { Suit } from './constants';

export const setReady: Move<JassState> = ({ G, ctx, events }, playerId: string) => {
  if (!G.readyPlayers.includes(playerId)) {
    G.readyPlayers.push(playerId);
  }
  if (G.readyPlayers.length === 2) {
    events.endPhase(); // Proceed to deal
  }
};

export const acceptOriginal: Move<JassState> = ({ G, ctx, events }) => {
  if (G.trumpSelectionPassedCount >= 2) return INVALID_MOVE;
  
  G.trump = G.revealedCard!.suit;
  dealRemainingCards(G);
  events.endPhase();
};

export const decline: Move<JassState> = ({ G, ctx, events }) => {
  G.trumpSelectionPassedCount++;
  
  // If both declined original, and both declined to pick a new suit
  if (G.trumpSelectionPassedCount >= 4) {
    // End hand with no score, re-deal
    // In a real implementation, we might trigger a re-setup or special phase
    events.endPhase(); // For now, just skip to next phase or end
  } else {
    events.endTurn();
  }
};

export const announceSmallGame: Move<JassState> = ({ G, ctx, events }) => {
  if (G.trumpSelectionPassedCount !== 2) return INVALID_MOVE;
  if (ctx.currentPlayer !== G.vorne) return INVALID_MOVE;

  G.smallGameAnnounced = true;
  events.endTurn(); // Goes to dealer
};

export const acceptSmallGame: Move<JassState> = ({ G, ctx, events }) => {
  if (!G.smallGameAnnounced || ctx.currentPlayer !== G.dealer) return INVALID_MOVE;
  // Small game accepted, turn goes back to vorne to choose trump
  events.endTurn();
};

export const overruleSmallGame: Move<JassState> = ({ G, ctx, events }) => {
  if (!G.smallGameAnnounced || ctx.currentPlayer !== G.dealer) return INVALID_MOVE;
  
  G.trump = 'Clubs';
  dealRemainingCards(G);
  events.endPhase();
};

export const chooseTrump: Move<JassState> = ({ G, ctx, events }, suit: Suit) => {
  if (G.trumpSelectionPassedCount < 2) return INVALID_MOVE;
  if (suit === G.revealedCard!.suit) return INVALID_MOVE; // Cannot pick original suit

  G.trump = suit;
  dealRemainingCards(G);
  events.endPhase();
};

export const doubleCube: Move<JassState> = ({ G, ctx }) => {
  if (G.cubeOffer !== null) return INVALID_MOVE;
  // If the cube is in the middle (null) or held by the current player
  if (G.cube.holder === null || G.cube.holder === ctx.currentPlayer) {
    G.cubeOffer = { from: ctx.currentPlayer, pending: true };
  } else {
    return INVALID_MOVE;
  }
};

export const acceptCube: Move<JassState> = ({ G, ctx }) => {
  if (!G.cubeOffer || G.cubeOffer.from === ctx.currentPlayer) return INVALID_MOVE;
  
  G.cube.value *= 2;
  G.cube.holder = ctx.currentPlayer;
  G.cubeOffer = null;
};

export const declineCube: Move<JassState> = ({ G, ctx, events }) => {
  if (!G.cubeOffer || G.cubeOffer.from === ctx.currentPlayer) return INVALID_MOVE;
  
  const winner = G.cubeOffer.from;
  G.cubeOffer = null;
  // TODO: Add logic to immediately award the game to the doubler and end match
  events.endGame({ winner });
};

// Helper function
function dealRemainingCards(G: JassState) {
  // Give 3 more cards to each
  G.hands['0'].push(...G.deck.splice(0, 3));
  G.hands['1'].push(...G.deck.splice(0, 3));
}
