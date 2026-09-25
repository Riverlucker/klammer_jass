import type { Ctx, State } from 'boardgame.io';
import type { Card, Rank, Suit } from './constants';
import type { GoodMeldReply } from './meldReplies';

export const RULES_VERSION = 2 as const;
export const PLAYER_IDS = ['0', '1'] as const;
export type PlayerID = (typeof PLAYER_IDS)[number];

export const MELD_TYPES = ['Terz', 'Fünfzig', 'Bella'] as const;
export type MeldType = (typeof MELD_TYPES)[number];
export type SequenceMeldType = Exclude<MeldType, 'Bella'>;
export type MeldResponse = 'good' | 'meToo' | 'notGood';
export type MeldDecision = 'show' | 'concede';

export interface ChatMessage {
  id: number;
  kind: 'dealer' | 'player';
  playerId: PlayerID | null;
  speech?: 'chat' | 'meld' | 'trump';
  speechText?: string;
  meldCards?: Card[];
  text: string;
  createdAt: number;
  gameNumber?: number;
  handNumber?: number;
}

export interface MeldAnnouncement {
  playerId: PlayerID;
  melds: MeldType[];
  createdAt: number;
}

export type SchneiderRule = 'yes' | 'no' | 'only_if_doubled';
export type ContractKind = 'original' | 'small';

export interface MatchSettings {
  targetScore: number;
  stake: number;
  handicap: number;
  schneiderRule: SchneiderRule;
  cubeEnabled: boolean;
  moveTimeSeconds: number;
  cubeTimeSeconds: number;
}

export interface Trick {
  leadPlayer: PlayerID;
  cards: Partial<Record<PlayerID, Card>>;
  winner: PlayerID | null;
}

export interface Meld {
  player: PlayerID;
  type: MeldType;
  cards: Card[];
  highestCard?: Card;
  points: number;
}

export interface MeldContest {
  frontType: SequenceMeldType;
  response: MeldResponse | null;
  replyComment: GoodMeldReply | null;
  stage: 'awaitingResponse' | 'dealerPlay' | 'awaitingFrontName' | 'awaitingDealerDecision';
  namedRank: Rank | null;
}

export interface ScoreDetails {
  tricks: number;
  trickCount: number;
  melds: number;
  terz: number;
  fifty: number;
  bella: number;
  jass: number;
  mi: number;
  lastTrick: number;
}

export interface HandResult {
  baseScores: Record<PlayerID, number>;
  awardedScores: Record<PlayerID, number>;
  winner: PlayerID;
  declarerFailed: boolean;
  dealerForNextHand: PlayerID;
}

export interface GameResult {
  winner: PlayerID | null;
  loser: PlayerID | null;
  finalScores: Record<PlayerID, number>;
  awardedMatchPoints: Record<PlayerID, number>;
  cubeValue: number;
  schneider: boolean;
  reason: 'target-reached' | 'cube-declined';
}

export interface MatchResult {
  winner: PlayerID | null;
  finalMatchPoints: Record<PlayerID, number>;
  endedBy: PlayerID;
  reason: 'player-ended';
}

export interface JassState {
  rulesVersion: typeof RULES_VERSION;
  playerNames: Record<PlayerID, string | null>;
  deck: Card[];
  hands: Record<PlayerID, Card[]>;
  trump: Suit | null;
  revealedCard: Card | null;
  dealer: PlayerID;
  vorne: PlayerID;
  declarer: PlayerID | null;
  contract: ContractKind | null;
  readyPlayers: PlayerID[];
  scores: Record<PlayerID, number>;
  matchPoints: Record<PlayerID, number>;
  handScores: Record<PlayerID, number>;
  handScoreDetails: Record<PlayerID, ScoreDetails>;
  settings: MatchSettings;
  gameNumber: number;
  handNumber: number;
  redealCount: number;
  lastHandResult: HandResult | null;
  gameResult: GameResult | null;
  matchResult: MatchResult | null;
  cube: {
    value: number;
    holder: PlayerID | null;
  };
  cubeOffer: {
    from: PlayerID;
    resumePlayer: PlayerID;
  } | null;
  smallGameAnnounced: boolean;
  smallGameAccepted: boolean;
  trumpSevenDecisions: PlayerID[];
  trumpSelectionPassedCount: number;
  meldContest: MeldContest | null;
  pendingDealerSequence: boolean;
  announcedBella: PlayerID[];
  shownMelds: Meld[];
  currentTrick: Trick;
  pastTricks: Trick[];
  trickWinner: PlayerID | null;
  timeoutCard: Card | null;
  timeoutSelection?: { playerID: PlayerID; card: Card; melds: MeldType[] } | null;
  meldSelectionTurn?: number | null;
  trickDisplayUntil: number | null;
  inspectingLastTrick?: boolean;
  extraDealStartedAt: number | null;
  extraDealUntil: number | null;
  redealStartedAt?: number | null;
  redealUntil?: number | null;
  deadlineAt: number | null;
  decisionTimer?: { id: number; waitingFor: PlayerID[]; started: boolean } | null;
  nextGamePlayers: PlayerID[];
  matchPaused: boolean;
  resumePlayers: PlayerID[];
  meldAnnouncement: MeldAnnouncement | null;
  chatMessages: ChatMessage[];
  chatSequence: number;
}

export type ServerGameState = State<JassState>;

export interface PlayerJassState extends Omit<JassState, 'deck' | 'hands'> {
  deck: [];
  hands: Record<PlayerID, Card[]>;
  handCounts: Record<PlayerID, number>;
  talonCount: number;
}

export interface GameClientState {
  G: PlayerJassState;
  ctx: Ctx;
  _stateID: number;
}

export function isPlayerID(value: string): value is PlayerID {
  return PLAYER_IDS.includes(value as PlayerID);
}

export function otherPlayer(player: PlayerID): PlayerID {
  return player === '0' ? '1' : '0';
}
