export type Suit = 'Spades' | 'Hearts' | 'Diamonds' | 'Clubs';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
export const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const NON_TRUMP_ORDER: Rank[] = ['A', '10', 'K', 'Q', 'J', '9', '8', '7'];
export const TRUMP_ORDER: Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

export const NON_TRUMP_VALUES: Record<Rank, number> = {
  'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0
};

export const TRUMP_VALUES: Record<Rank, number> = {
  'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}
