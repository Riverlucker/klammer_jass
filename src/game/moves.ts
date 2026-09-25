import type { Move } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { Suit } from './constants';
import { initialGameScores, settleDeclinedCube } from './scoring';
import { canExchangeTrumpSeven } from './trumpSeven';
import { canDouble } from './cube';
import type { JassState, MatchResult, PlayerID } from './types';
import { isPlayerID, otherPlayer } from './types';

export const setReady: Move<JassState> = ({ G, events, playerID }) => {
  if (!isPlayerID(playerID)) return INVALID_MOVE;
  if (!G.readyPlayers.includes(playerID)) G.readyPlayers.push(playerID);
  if (G.readyPlayers.length === 2) events.endPhase();
};

export const nextHand: Move<JassState> = ({ G, events, playerID }) => {
  if (!isPlayerID(playerID) || G.gameResult || G.matchResult) return INVALID_MOVE;
  if (!G.readyPlayers.includes(playerID)) G.readyPlayers.push(playerID);
  if (G.readyPlayers.length === 2) {
    G.dealer = G.lastHandResult?.dealerForNextHand ?? G.dealer;
    G.vorne = otherPlayer(G.dealer);
    G.handNumber += 1;
    events.endPhase();
  }
};

export const acceptOriginal: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (!isPlayerID(playerID) || G.cubeOffer || G.trumpSelectionPassedCount >= 2) return INVALID_MOVE;
  if (!G.revealedCard || ctx.currentPlayer !== playerID) return INVALID_MOVE;
  selectTrump(G, playerID, 'original', G.revealedCard.suit);
  events.endPhase();
};

export const decline: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (!isPlayerID(playerID) || G.cubeOffer || ctx.currentPlayer !== playerID) return INVALID_MOVE;
  G.trumpSelectionPassedCount += 1;
  if (G.trumpSelectionPassedCount >= 4) {
    G.redealCount += 1;
    G.dealer = otherPlayer(G.dealer);
    G.vorne = otherPlayer(G.dealer);
    events.setPhase('deal');
  } else {
    events.endTurn();
  }
};

export const announceSmallGame: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    !isPlayerID(playerID) || G.cubeOffer || G.smallGameAnnounced ||
    G.trumpSelectionPassedCount !== 2 || ctx.currentPlayer !== G.vorne || playerID !== G.vorne
  ) return INVALID_MOVE;
  G.smallGameAnnounced = true;
  if (G.revealedCard?.suit === 'Clubs') {
    G.smallGameAccepted = true;
    return;
  }
  events.endTurn();
};

export const acceptSmallGame: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    !isPlayerID(playerID) || G.cubeOffer || !G.smallGameAnnounced ||
    ctx.currentPlayer !== G.dealer || playerID !== G.dealer
  ) return INVALID_MOVE;
  G.smallGameAccepted = true;
  events.endTurn();
};

export const overruleSmallGame: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    G.revealedCard?.suit === 'Clubs' || G.smallGameAccepted ||
    !isPlayerID(playerID) || G.cubeOffer || !G.smallGameAnnounced ||
    ctx.currentPlayer !== G.dealer || playerID !== G.dealer
  ) return INVALID_MOVE;
  selectTrump(G, playerID, 'small', 'Clubs');
  events.endPhase();
};

export const chooseTrump: Move<JassState> = ({ G, ctx, events, playerID }, suit: Suit) => {
  if (
    !isPlayerID(playerID) || G.cubeOffer || ctx.currentPlayer !== playerID ||
    !G.revealedCard || suit === G.revealedCard.suit
  ) return INVALID_MOVE;

  const acceptedSmallGame = G.smallGameAnnounced && G.smallGameAccepted && G.trumpSelectionPassedCount === 2 && playerID === G.vorne;
  const dealerChoosing = !G.smallGameAnnounced && G.trumpSelectionPassedCount === 3 && playerID === G.dealer;
  if (!acceptedSmallGame && !dealerChoosing) return INVALID_MOVE;
  selectTrump(G, playerID, 'small', suit);
  events.endPhase();
};

export const exchangeTrumpSeven: Move<JassState> = ({ G, ctx, playerID }) => {
  if (!isPlayerID(playerID) || ctx.phase !== 'playing' || ctx.currentPlayer !== playerID
    || !canExchangeTrumpSeven(G, playerID)) return INVALID_MOVE;
  const sevenIndex = G.hands[playerID].findIndex((card) => card.suit === G.revealedCard?.suit && card.rank === '7');
  if (sevenIndex < 0 || !G.revealedCard) return INVALID_MOVE;

  const trumpSeven = G.hands[playerID][sevenIndex];
  G.hands[playerID][sevenIndex] = G.revealedCard;
  G.revealedCard = trumpSeven;
  G.trumpSevenDecisions.push(playerID);
};

export const keepTrumpSeven: Move<JassState> = ({ G, ctx, playerID }) => {
  if (!isPlayerID(playerID) || ctx.phase !== 'playing' || ctx.currentPlayer !== playerID
    || !canExchangeTrumpSeven(G, playerID)) return INVALID_MOVE;
  G.trumpSevenDecisions.push(playerID);
};

export const doubleCube: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (!isPlayerID(playerID) || !canDouble(G, ctx.phase, ctx.currentPlayer, playerID)) {
    return INVALID_MOVE;
  }

  G.cubeOffer = { from: playerID, resumePlayer: playerID };
  events.endTurn({ next: otherPlayer(playerID) });
};

export const acceptCube: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    !isPlayerID(playerID) || !G.cubeOffer || G.cubeOffer.from === playerID ||
    ctx.currentPlayer !== playerID
  ) return INVALID_MOVE;
  const resumePlayer = G.cubeOffer.resumePlayer;
  G.cube.value *= 2;
  G.cube.holder = playerID;
  G.cubeOffer = null;
  if (resumePlayer !== playerID) events.endTurn({ next: resumePlayer });
};

export const declineCube: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    !isPlayerID(playerID) || !G.cubeOffer || G.cubeOffer.from === playerID ||
    ctx.currentPlayer !== playerID
  ) return INVALID_MOVE;
  const winner = G.cubeOffer.from;
  const settled = settleDeclinedCube(
    winner,
    G.scores,
    G.matchPoints,
    G.cube.value,
    G.settings.stake,
  );
  G.gameResult = settled.gameResult;
  G.matchPoints = settled.nextMatchPoints;
  G.cubeOffer = null;
  G.nextGamePlayers = [];
  events.setPhase('endOfGame');
};

export const nextGame: Move<JassState> = ({ G, events, playerID }) => {
  if (!isPlayerID(playerID) || !G.gameResult || G.matchPaused || G.matchResult) {
    return INVALID_MOVE;
  }
  if (!G.nextGamePlayers.includes(playerID)) G.nextGamePlayers.push(playerID);
  if (G.nextGamePlayers.length === 2) {
    startNextGame(G);
    events.endPhase();
  }
};

export const endMatch: Move<JassState> = ({ G, events, playerID }) => {
  if (!isPlayerID(playerID) || !G.gameResult || G.matchResult) return INVALID_MOVE;
  const winner = G.matchPoints['0'] === G.matchPoints['1']
    ? null
    : G.matchPoints['0'] > G.matchPoints['1'] ? '0' : '1';
  const result: MatchResult = {
    winner,
    finalMatchPoints: { ...G.matchPoints },
    endedBy: playerID,
    reason: 'player-ended',
  };
  G.matchResult = result;
  G.nextGamePlayers = [];
  G.resumePlayers = [];
  G.deadlineAt = null;
  events.endGame(result);
};

export const pauseMatch: Move<JassState> = ({ G }) => {
  if (!G.gameResult || G.matchResult || G.matchPaused) return INVALID_MOVE;
  G.matchPaused = true;
  G.pauseReason = 'game-end';
  G.resumePlayers = [];
  G.nextGamePlayers = [];
  G.deadlineAt = null;
};

export const resumeMatch: Move<JassState> = ({ G, events, playerID }) => {
  if (!isPlayerID(playerID) || !G.matchPaused || !G.gameResult || G.matchResult) return INVALID_MOVE;
  if (!G.resumePlayers.includes(playerID)) G.resumePlayers.push(playerID);
  if (G.resumePlayers.length === 2) {
    startNextGame(G);
    events.endPhase();
  }
};

function startNextGame(G: JassState) {
  G.dealer = G.lastHandResult?.dealerForNextHand ?? G.gameResult?.winner ?? G.dealer;
  G.scores = initialGameScores(G.settings.handicap);
  G.gameNumber += 1;
  G.handNumber = 1;
  G.redealCount = 0;
  G.gameResult = null;
  G.lastHandResult = null;
  G.cube = { value: 1, holder: null };
  G.cubeOffer = null;
  G.nextGamePlayers = [];
  G.readyPlayers = [];
  G.matchPaused = false;
  G.pauseReason = null;
  G.consecutiveTimeouts = { '0': 0, '1': 0 };
  G.resumePlayers = [];
  G.vorne = otherPlayer(G.dealer);
}

function selectTrump(G: JassState, declarer: PlayerID, contract: 'original' | 'small', suit: Suit) {
  G.trump = suit;
  G.declarer = declarer;
  G.contract = contract;
  G.hands['0'].push(...G.deck.splice(0, 3));
  G.hands['1'].push(...G.deck.splice(0, 3));
}
