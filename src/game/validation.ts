import { Card, Suit, Rank, NON_TRUMP_ORDER, TRUMP_ORDER } from './constants';
import { Meld, MeldType } from './types';

const MELD_ORDER: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getRankIndex(rank: Rank, isTrump: boolean): number {
  const order = isTrump ? TRUMP_ORDER : NON_TRUMP_ORDER;
  return order.indexOf(rank);
}

// Check if a card is higher than another card in a trick
export function isCardHigherInTrick(
  cardToPlay: Card,
  cardToBeat: Card,
  leadSuit: Suit,
  trumpSuit: Suit
): boolean {
  if (cardToPlay.suit === cardToBeat.suit) {
    const isTrump = cardToPlay.suit === trumpSuit;
    // Lower index means higher rank because arrays are [A, 10, K...] or [J, 9, A...]
    return getRankIndex(cardToPlay.rank, isTrump) < getRankIndex(cardToBeat.rank, isTrump);
  } else {
    // If suits are different, cardToPlay only wins if it's trump
    return cardToPlay.suit === trumpSuit;
  }
}

// Check if a move is legal (Farbzwang, Stech-Pflicht)
export function isMoveLegal(
  cardToPlay: Card,
  hand: Card[],
  trickCards: Card[], // The cards already in the trick (lead card is first)
  leadSuit: Suit | null,
  trumpSuit: Suit
): boolean {
  if (leadSuit === null) return true; // First to play

  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  const hasTrump = hand.some(c => c.suit === trumpSuit);

  // 1. Farbzwang (Must follow suit)
  if (hasLeadSuit) {
    if (cardToPlay.suit !== leadSuit) return false;
    
    // If lead suit IS trump, we have Stech-Pflicht (Must overtrump if possible)
    if (leadSuit === trumpSuit) {
       const highestTrumpInTrick = getHighestCardInTrick(trickCards, leadSuit, trumpSuit);
       // canOvertrump if player has a trump card whose index is SMALLER than highestTrumpInTrick's index
       const canOvertrump = hand.some(c => c.suit === trumpSuit && getRankIndex(c.rank, true) < getRankIndex(highestTrumpInTrick.rank, true));
       if (canOvertrump) {
          if (getRankIndex(cardToPlay.rank, true) >= getRankIndex(highestTrumpInTrick.rank, true)) return false;
       }
    }
    return true;
  }

  // 2. Stechzwang (Must trump if cannot follow suit, but only if you have trump)
  if (hasTrump) {
    if (cardToPlay.suit !== trumpSuit) return false;

    // Stech-Pflicht (Must overtrump if a trump is already played)
    // sort ascending by index so index 0 (highest card) is first
    const highestTrumpInTrick = trickCards.filter(c => c.suit === trumpSuit).sort((a,b) => getRankIndex(a.rank, true) - getRankIndex(b.rank, true))[0];
    if (highestTrumpInTrick) {
       const canOvertrump = hand.some(c => c.suit === trumpSuit && getRankIndex(c.rank, true) < getRankIndex(highestTrumpInTrick.rank, true));
       if (canOvertrump) {
          if (getRankIndex(cardToPlay.rank, true) >= getRankIndex(highestTrumpInTrick.rank, true)) return false;
       }
    }
    return true;
  }

  // 3. Abwerfen (Can play anything if neither lead suit nor trump)
  return true;
}

export function getHighestCardInTrick(cards: Card[], leadSuit: Suit, trumpSuit: Suit): Card {
  let highest = cards[0];
  for (let i = 1; i < cards.length; i++) {
    if (isCardHigherInTrick(cards[i], highest, leadSuit, trumpSuit)) {
      highest = cards[i];
    }
  }
  return highest;
}

// Check which meld is better. Returns true if meldA is strictly better than meldB.
// If equal, the first announced (meldA usually) wins.
export function isMeldBetter(meldA: Meld, meldB: Meld, trumpSuit: Suit): boolean {
  // Fünfzig > Terz
  if (meldA.type === 'Fünfzig' && meldB.type === 'Terz') return true;
  if (meldA.type === 'Terz' && meldB.type === 'Fünfzig') return false;

  // Same type, compare highest card rank
  const rankA = MELD_ORDER.indexOf(meldA.highestCard!.rank);
  const rankB = MELD_ORDER.indexOf(meldB.highestCard!.rank);

  if (rankA > rankB) return true;
  if (rankA < rankB) return false;

  // Same rank, check trump
  const isATrump = meldA.highestCard!.suit === trumpSuit;
  const isBTrump = meldB.highestCard!.suit === trumpSuit;

  if (isATrump && !isBTrump) return true;
  if (!isATrump && isBTrump) return false;

  // Completely equal
  return true; 
}

// Find the highest card of the best meld of a given type in a hand.
// Returns null if the hand does not contain such a meld.
export function getBestMeldHighestCard(hand: Card[], type: 'Terz' | 'Fünfzig', trumpSuit: Suit): Card | null {
  const suits: Suit[] = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
  let bestHighestCard: Card | null = null;
  const requiredLength = type === 'Terz' ? 3 : 4;

  for (const suit of suits) {
    const suitCards = hand.filter(c => c.suit === suit);
    if (suitCards.length < requiredLength) continue;

    // Sort by rank index
    const sorted = suitCards.sort((a, b) => MELD_ORDER.indexOf(a.rank) - MELD_ORDER.indexOf(b.rank));
    
    // Find longest sequence
    let currentSeq = 1;
    let highestInSeq = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (MELD_ORDER.indexOf(sorted[i].rank) === MELD_ORDER.indexOf(sorted[i - 1].rank) + 1) {
        currentSeq++;
        highestInSeq = sorted[i];
        if (currentSeq >= requiredLength) {
           // We found a valid sequence
           if (!bestHighestCard) {
             bestHighestCard = highestInSeq;
           } else {
             // Compare with current best
             const isNewTrump = highestInSeq.suit === trumpSuit;
             const isBestTrump = bestHighestCard.suit === trumpSuit;
             const rankNew = MELD_ORDER.indexOf(highestInSeq.rank);
             const rankBest = MELD_ORDER.indexOf(bestHighestCard.rank);

             if (rankNew > rankBest || (rankNew === rankBest && isNewTrump && !isBestTrump)) {
                bestHighestCard = highestInSeq;
             }
           }
        }
      } else {
        currentSeq = 1;
        highestInSeq = sorted[i];
      }
    }
  }

  return bestHighestCard;
}

export function hasBella(hand: Card[], trumpSuit: Suit): boolean {
  return hand.some(c => c.suit === trumpSuit && c.rank === 'K') && 
         hand.some(c => c.suit === trumpSuit && c.rank === 'Q');
}
