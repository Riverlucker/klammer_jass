import { Card, Suit } from './constants';

export interface Trick {
  leadPlayer: string;
  cards: Record<string, Card>; // playerID -> Card
  winner: string | null;
}

export type MeldType = 'Terz' | 'Fünfzig' | 'Bella';

export interface Meld {
  player: string;
  type: MeldType;
  cards: Card[];
  highestCard?: Card; // Used for tie-breaking Terz/Fünfzig
}

export interface JassState {
  deck: Card[];
  hands: Record<string, Card[]>;
  trump: Suit | null;
  revealedCard: Card | null;
  dealer: string;
  vorne: string;
  readyPlayers: string[];
  scores: Record<string, number>; 
  handScores: Record<string, number>;
  handScoreDetails: Record<string, { tricks: number, melds: number, lastTrick: number }>;
  
  cube: {
    value: number;
    holder: string | null; 
  };
  cubeOffer: {
    from: string;
    pending: boolean;
  } | null;

  // Trump Selection Phase State
  smallGameAnnounced: boolean;
  trumpSelectionPassedCount: number;

  // Melding Phase State
  pendingMeld: {
    player: string;
    type: MeldType;
    heightDeclared: boolean; // Has the player declared the height (e.g., 'bis J')?
  } | null;
  shownMelds: Meld[];
  
  // Playing Phase State
  currentTrick: Trick;
  pastTricks: Trick[];
  trickWinner: string | null;
}
