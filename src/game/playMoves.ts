import type { Move } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { NON_TRUMP_VALUES, TRUMP_VALUES, type Card, type Suit } from './constants';
import { isGoodMeldReply, type GoodMeldReply } from './meldReplies';
import { settlePlayedHand } from './scoring';
import type {
  JassState,
  Meld,
  MeldDecision,
  MeldResponse,
  MeldType,
  PlayerID,
  SequenceMeldType,
} from './types';
import { isPlayerID, MELD_TYPES } from './types';
import {
  findBella,
  getAllSequenceMelds,
  getBestSequenceMeld,
  getExpectedMeldDecision,
  getExpectedMeldResponse,
  isCard,
  isCardHigherInTrick,
  isMoveLegal,
} from './validation';

export const playCard: Move<JassState> = (
  { G, ctx, events, playerID },
  card: Card,
  meldDeclarations: MeldType[] = [],
) => {
  if (
    !isPlayerID(playerID) ||
    ctx.currentPlayer !== playerID ||
    !G.trump ||
    !G.declarer ||
    G.cubeOffer ||
    blocksCardPlay(G, playerID) ||
    !isCard(card) ||
    !areMeldDeclarationsValid(meldDeclarations)
  ) return INVALID_MOVE;

  const hand = G.hands[playerID];
  if (!hand.some((candidate) => sameCard(candidate, card))) return INVALID_MOVE;

  const leadPlayer = G.currentTrick.leadPlayer;
  const leadCard = G.currentTrick.cards[leadPlayer];
  const leadSuit = leadCard?.suit ?? null;
  const trickCards = Object.values(G.currentTrick.cards).filter(isCard);
  if (!isMoveLegal(card, hand, trickCards, leadSuit, G.trump)) return INVALID_MOVE;

  const firstTrick = G.pastTricks.length === 0;
  const firstPlayerOfTrick = trickCards.length === 0;
  const sequenceType = meldDeclarations.find((type): type is SequenceMeldType => type !== 'Bella');
  const declaresBella = meldDeclarations.includes('Bella');
  const bestSequence = getBestSequenceMeld(hand, G.trump, playerID);

  if (sequenceType && (!firstTrick || sequenceType !== bestSequence?.type)) return INVALID_MOVE;
  if (firstTrick && firstPlayerOfTrick && sequenceType && playerID !== G.vorne) return INVALID_MOVE;
  if (firstTrick && !firstPlayerOfTrick && sequenceType && G.meldContest) return INVALID_MOVE;

  const bella = declaresBella ? findBella(hand, G.trump, playerID) : null;
  if (
    declaresBella &&
    (!bella || G.announcedBella.includes(playerID) || card.suit !== G.trump || !['K', 'Q'].includes(card.rank))
  ) return INVALID_MOVE;

  G.currentTrick.cards[playerID] = card;
  G.hands[playerID] = hand.filter((candidate) => !sameCard(candidate, card));
  if (firstTrick && !G.trumpSevenDecisions.includes(playerID)) G.trumpSevenDecisions.push(playerID);

  if (bella) {
    awardMelds(G, [bella]);
    G.announcedBella.push(playerID);
  }

  if (firstTrick && firstPlayerOfTrick && sequenceType) {
    G.meldContest = {
      frontType: sequenceType,
      response: null,
      replyComment: null,
      stage: 'awaitingResponse',
      namedRank: null,
    };
  }
  if (firstTrick && !firstPlayerOfTrick && sequenceType && !G.meldContest) {
    G.pendingDealerSequence = true;
  }

  if (Object.keys(G.currentTrick.cards).length < 2) {
    events.endTurn();
    return;
  }

  const leadCardPlayed = G.currentTrick.cards[leadPlayer];
  const secondCardPlayed = G.currentTrick.cards[playerID];
  if (!leadCardPlayed || !secondCardPlayed) return INVALID_MOVE;

  const winner = isCardHigherInTrick(secondCardPlayed, leadCardPlayed, G.trump)
    ? playerID
    : leadPlayer;
  G.trickWinner = winner;
  G.currentTrick.winner = winner;

  const points = calculateCardPoints(leadCardPlayed, G.trump) + calculateCardPoints(secondCardPlayed, G.trump);
  G.handScores[winner] += points;
  G.handScoreDetails[winner].tricks += points;
  recordSpecialCardValue(G.handScoreDetails[winner], leadCardPlayed, G.trump);
  recordSpecialCardValue(G.handScoreDetails[winner], secondCardPlayed, G.trump);
  G.handScoreDetails[winner].trickCount += 1;

  let meldNamingRequired = false;
  if (firstTrick) {
    if (G.meldContest?.response === 'good') {
      awardAllSequences(G, G.vorne);
      G.meldContest = null;
    } else if (G.meldContest?.response === 'notGood') {
      awardAllSequences(G, G.dealer);
      G.meldContest = null;
    } else if (G.meldContest?.response === 'meToo') {
      G.meldContest.stage = 'awaitingFrontName';
      meldNamingRequired = true;
    } else if (G.pendingDealerSequence) {
      awardAllSequences(G, G.dealer);
    }
    G.pendingDealerSequence = false;
  }

  G.pastTricks.push({ ...G.currentTrick, cards: { ...G.currentTrick.cards } });
  G.currentTrick = { leadPlayer: winner, cards: {}, winner: null };

  if (G.hands['0'].length > 0 || G.hands['1'].length > 0) {
    events.endTurn({ next: meldNamingRequired ? G.vorne : winner });
    return;
  }

  G.handScores[winner] += 10;
  G.handScoreDetails[winner].lastTrick += 10;
  const settlement = settlePlayedHand({
    handScores: G.handScores,
    scoreDetails: G.handScoreDetails,
    currentScores: G.scores,
    currentMatchPoints: G.matchPoints,
    declarer: G.declarer,
    dealer: G.dealer,
    cubeValue: G.cube.value,
    settings: G.settings,
  });
  G.lastHandResult = settlement.handResult;
  G.handScores = settlement.handResult.awardedScores;
  G.scores = settlement.nextScores;
  G.matchPoints = settlement.nextMatchPoints;
  G.gameResult = settlement.gameResult;
  G.nextGamePlayers = [];

  if (G.gameResult) events.setPhase('endOfGame');
  else events.endPhase();
};

export const respondMeld: Move<JassState> = (
  { G, ctx, playerID },
  response: MeldResponse,
  replyComment?: GoodMeldReply,
) => {
  if (
    !isPlayerID(playerID) ||
    playerID !== G.dealer ||
    ctx.currentPlayer !== playerID ||
    !G.trump ||
    !G.meldContest ||
    G.meldContest.stage !== 'awaitingResponse' ||
    G.cubeOffer ||
    (response === 'good' ? !isGoodMeldReply(replyComment) : replyComment !== undefined)
  ) return INVALID_MOVE;
  const expected = getExpectedMeldResponse(
    G.meldContest.frontType,
    G.hands[G.dealer],
    G.trump,
    G.dealer,
  );
  if (response !== expected) return INVALID_MOVE;
  // Once a player answers a meld, their hand must no longer change through an exchange.
  if (!G.trumpSevenDecisions.includes(playerID)) G.trumpSevenDecisions.push(playerID);
  G.meldContest.response = response;
  G.meldContest.replyComment = response === 'good' ? replyComment! : null;
  G.meldContest.stage = 'dealerPlay';
};

export const nameMeld: Move<JassState> = ({ G, ctx, events, playerID }) => {
  if (
    !isPlayerID(playerID) ||
    playerID !== G.vorne ||
    ctx.currentPlayer !== playerID ||
    !G.trump ||
    !G.meldContest ||
    G.meldContest.stage !== 'awaitingFrontName' ||
    G.cubeOffer
  ) return INVALID_MOVE;
  const best = getBestSequenceMeld(firstTrickHand(G, G.vorne), G.trump, G.vorne);
  if (!best?.highestCard) return INVALID_MOVE;
  G.meldContest.namedRank = best.highestCard.rank;
  G.meldContest.stage = 'awaitingDealerDecision';
  events.endTurn({ next: G.dealer });
};

export const resolveMeldContest: Move<JassState> = (
  { G, ctx, events, playerID },
  decision: MeldDecision,
) => {
  if (
    !isPlayerID(playerID) ||
    playerID !== G.dealer ||
    ctx.currentPlayer !== playerID ||
    !G.trump ||
    !G.meldContest ||
    G.meldContest.stage !== 'awaitingDealerDecision' ||
    G.cubeOffer
  ) return INVALID_MOVE;
  const frontHand = firstTrickHand(G, G.vorne);
  const dealerHand = firstTrickHand(G, G.dealer);
  const expected = getExpectedMeldDecision(
    frontHand,
    dealerHand,
    G.trump,
    G.vorne,
    G.dealer,
  );
  if (decision !== expected) return INVALID_MOVE;
  awardAllSequences(G, decision === 'show' ? G.dealer : G.vorne);
  G.meldContest = null;
  events.endTurn({ next: G.currentTrick.leadPlayer });
};

export function expectedMeldResponse(G: JassState): MeldResponse | null {
  if (!G.trump || !G.meldContest || G.meldContest.stage !== 'awaitingResponse') return null;
  return getExpectedMeldResponse(
    G.meldContest.frontType,
    G.hands[G.dealer],
    G.trump,
    G.dealer,
  );
}

export function expectedMeldDecision(G: JassState): MeldDecision | null {
  if (!G.trump || !G.meldContest || G.meldContest.stage !== 'awaitingDealerDecision') return null;
  return getExpectedMeldDecision(
    firstTrickHand(G, G.vorne),
    firstTrickHand(G, G.dealer),
    G.trump,
    G.vorne,
    G.dealer,
  );
}

function blocksCardPlay(G: JassState, playerID: PlayerID): boolean {
  if (!G.meldContest) return false;
  if (G.meldContest.stage === 'dealerPlay') return playerID !== G.dealer;
  return true;
}

function awardAllSequences(G: JassState, player: PlayerID) {
  if (!G.trump) return;
  awardMelds(G, getAllSequenceMelds(firstTrickHand(G, player), G.trump, player));
}

function firstTrickHand(G: JassState, player: PlayerID): Card[] {
  const playedCard = G.pastTricks[0]?.cards[player] ?? G.currentTrick.cards[player];
  return playedCard ? [...G.hands[player], playedCard] : [...G.hands[player]];
}

function awardMelds(G: JassState, melds: Meld[]) {
  for (const meld of melds) {
    G.handScores[meld.player] += meld.points;
    G.handScoreDetails[meld.player].melds += meld.points;
    if (meld.type === 'Terz') G.handScoreDetails[meld.player].terz = (G.handScoreDetails[meld.player].terz ?? 0) + meld.points;
    if (meld.type === 'Fünfzig') G.handScoreDetails[meld.player].fifty = (G.handScoreDetails[meld.player].fifty ?? 0) + meld.points;
    if (meld.type === 'Bella') G.handScoreDetails[meld.player].bella = (G.handScoreDetails[meld.player].bella ?? 0) + meld.points;
    G.shownMelds.push(meld);
  }
}

function recordSpecialCardValue(details: JassState['handScoreDetails'][PlayerID], card: Card, trump: Suit) {
  if (card.suit !== trump) return;
  if (card.rank === 'J') details.jass = (details.jass ?? 0) + 20;
  if (card.rank === '9') details.mi = (details.mi ?? 0) + 14;
}

function areMeldDeclarationsValid(value: unknown): value is MeldType[] {
  if (!Array.isArray(value) || value.length > 2) return false;
  if (!value.every((item) => typeof item === 'string' && MELD_TYPES.includes(item as MeldType))) return false;
  if (new Set(value).size !== value.length) return false;
  return value.filter((type) => type !== 'Bella').length <= 1;
}

export function calculateCardPoints(card: Card, trumpSuit: Suit): number {
  return card.suit === trumpSuit ? TRUMP_VALUES[card.rank] : NON_TRUMP_VALUES[card.rank];
}

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
