import {
  NON_TRUMP_ORDER,
  RANKS,
  SUITS,
  TRUMP_ORDER,
  type Card,
  type Rank,
  type Suit,
} from './constants';
import type {
  Meld,
  MeldDecision,
  MeldResponse,
  MeldType,
  PlayerID,
  SequenceMeldType,
} from './types';

const MELD_ORDER: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getRankIndex(rank: Rank, isTrump: boolean): number {
  return (isTrump ? TRUMP_ORDER : NON_TRUMP_ORDER).indexOf(rank);
}

export function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && SUITS.includes(value as Suit);
}

export function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && RANKS.includes(value as Rank);
}

export function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { suit?: unknown; rank?: unknown };
  return isSuit(candidate.suit) && isRank(candidate.rank);
}

export function isCardHigherInTrick(
  cardToPlay: Card,
  cardToBeat: Card,
  trumpSuit: Suit,
): boolean {
  if (cardToPlay.suit === cardToBeat.suit) {
    const isTrump = cardToPlay.suit === trumpSuit;
    return getRankIndex(cardToPlay.rank, isTrump) < getRankIndex(cardToBeat.rank, isTrump);
  }
  return cardToPlay.suit === trumpSuit;
}

export function isMoveLegal(
  cardToPlay: Card,
  hand: Card[],
  trickCards: Card[],
  leadSuit: Suit | null,
  trumpSuit: Suit,
): boolean {
  if (leadSuit === null) return true;

  const hasLeadSuit = hand.some((card) => card.suit === leadSuit);
  const hasTrump = hand.some((card) => card.suit === trumpSuit);

  if (hasLeadSuit) {
    if (cardToPlay.suit !== leadSuit) return false;
    if (leadSuit === trumpSuit) {
      const highestTrump = getHighestTrump(trickCards, trumpSuit);
      if (highestTrump && canOvertrump(hand, highestTrump)) {
        return getRankIndex(cardToPlay.rank, true) < getRankIndex(highestTrump.rank, true);
      }
    }
    return true;
  }

  if (!hasTrump) return true;
  if (cardToPlay.suit !== trumpSuit) return false;

  const highestTrump = getHighestTrump(trickCards, trumpSuit);
  if (highestTrump && canOvertrump(hand, highestTrump)) {
    return getRankIndex(cardToPlay.rank, true) < getRankIndex(highestTrump.rank, true);
  }
  return true;
}

function getHighestTrump(cards: Card[], trumpSuit: Suit): Card | null {
  const trumps = cards.filter((card) => card.suit === trumpSuit);
  return trumps.sort(
    (a, b) => getRankIndex(a.rank, true) - getRankIndex(b.rank, true),
  )[0] ?? null;
}

function canOvertrump(hand: Card[], cardToBeat: Card): boolean {
  return hand.some(
    (card) =>
      card.suit === cardToBeat.suit &&
      getRankIndex(card.rank, true) < getRankIndex(cardToBeat.rank, true),
  );
}

export function getHighestCardInTrick(cards: Card[], trumpSuit: Suit): Card {
  if (cards.length === 0) throw new Error('Ein leerer Stich hat keine höchste Karte.');
  return cards.slice(1).reduce(
    (highest, card) => isCardHigherInTrick(card, highest, trumpSuit) ? card : highest,
    cards[0],
  );
}

export function compareSequenceMelds(meldA: Meld, meldB: Meld, trumpSuit: Suit): number {
  if (meldA.type === 'Bella' || meldB.type === 'Bella') {
    throw new Error('Bella wird nicht mit Folgen verglichen.');
  }
  if (meldA.points !== meldB.points) return meldA.points - meldB.points;

  const rankA = MELD_ORDER.indexOf(meldA.highestCard!.rank);
  const rankB = MELD_ORDER.indexOf(meldB.highestCard!.rank);
  if (rankA !== rankB) return rankA - rankB;

  const trumpA = meldA.highestCard!.suit === trumpSuit;
  const trumpB = meldB.highestCard!.suit === trumpSuit;
  if (trumpA !== trumpB) return trumpA ? 1 : -1;
  return 0;
}

export function findSequenceMeld(
  hand: Card[],
  type: SequenceMeldType,
  trumpSuit: Suit,
  player: PlayerID,
): Meld | null {
  return getAllSequenceMelds(hand, trumpSuit, player)
    .filter((meld) => meld.type === type)
    .sort((a, b) => compareSequenceMelds(b, a, trumpSuit))[0] ?? null;
}

export function getAllSequenceMelds(
  hand: Card[],
  trumpSuit: Suit,
  player: PlayerID,
): Meld[] {
  const melds: Meld[] = [];

  for (const suit of SUITS) {
    const sorted = hand
      .filter((card) => card.suit === suit)
      .sort((a, b) => MELD_ORDER.indexOf(a.rank) - MELD_ORDER.indexOf(b.rank));
    const runs: Card[][] = [];
    let run: Card[] = [];

    for (const card of sorted) {
      const previous = run.at(-1);
      if (previous && MELD_ORDER.indexOf(card.rank) !== MELD_ORDER.indexOf(previous.rank) + 1) {
        if (run.length >= 3) runs.push(run);
        run = [];
      }
      run.push(card);
    }
    if (run.length >= 3) runs.push(run);

    for (const sequence of runs) {
      const type: SequenceMeldType = sequence.length >= 4 ? 'Fünfzig' : 'Terz';
      const cards = sequence.slice(type === 'Fünfzig' ? -4 : -3);
      melds.push({
        player,
        type,
        cards,
        highestCard: cards.at(-1),
        points: type === 'Fünfzig' ? 50 : 20,
      });
    }
  }

  return melds;
}

export function getBestSequenceMeld(
  hand: Card[],
  trumpSuit: Suit,
  player: PlayerID,
): Meld | null {
  return getAllSequenceMelds(hand, trumpSuit, player)
    .sort((a, b) => compareSequenceMelds(b, a, trumpSuit))[0] ?? null;
}

export function getExpectedMeldResponse(
  frontType: SequenceMeldType,
  dealerHand: Card[],
  trumpSuit: Suit,
  dealer: PlayerID,
): MeldResponse {
  const dealerMeld = getBestSequenceMeld(dealerHand, trumpSuit, dealer);
  if (!dealerMeld || dealerMeld.points < (frontType === 'Fünfzig' ? 50 : 20)) return 'good';
  if (dealerMeld.points > (frontType === 'Fünfzig' ? 50 : 20)) return 'notGood';
  return 'meToo';
}

export function getExpectedMeldDecision(
  frontHand: Card[],
  dealerHand: Card[],
  trumpSuit: Suit,
  front: PlayerID,
  dealer: PlayerID,
): MeldDecision {
  const frontMeld = getBestSequenceMeld(frontHand, trumpSuit, front);
  const dealerMeld = getBestSequenceMeld(dealerHand, trumpSuit, dealer);
  if (!frontMeld || !dealerMeld) return 'concede';
  return compareSequenceMelds(dealerMeld, frontMeld, trumpSuit) > 0 ? 'show' : 'concede';
}

export function findBella(hand: Card[], trumpSuit: Suit, player: PlayerID): Meld | null {
  const cards = hand.filter(
    (card) => card.suit === trumpSuit && (card.rank === 'K' || card.rank === 'Q'),
  );
  if (cards.length !== 2) return null;
  return { player, type: 'Bella', cards, points: 20 };
}

export function getAvailableMeldTypes(
  hand: Card[],
  trumpSuit: Suit,
  player: PlayerID,
): MeldType[] {
  const result: MeldType[] = [];
  const bestSequence = getBestSequenceMeld(hand, trumpSuit, player);
  if (bestSequence) result.push(bestSequence.type);
  if (findBella(hand, trumpSuit, player)) result.push('Bella');
  return result;
}
