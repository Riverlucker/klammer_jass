import type { Game } from 'boardgame.io';
import { createDeck, type Card } from './constants';
import * as JassMoves from './moves';
import * as PlayMoves from './playMoves';
import { initialGameScores } from './scoring';
import {
  RULES_VERSION,
  otherPlayer,
  type JassState,
  type MatchSettings,
  type PlayerID,
} from './types';

export const DEFAULT_SETTINGS: MatchSettings = {
  targetScore: 301,
  stake: 1,
  handicap: 0,
  schneiderRule: 'yes',
  cubeEnabled: true,
  moveTimeSeconds: 10,
  cubeTimeSeconds: 30,
};

type MatchSetupData = MatchSettings & {
  playerNames?: Partial<Record<PlayerID, string | null>>;
};

export const JassGame: Game<JassState, Record<string, unknown>, MatchSetupData> = {
  name: 'klammer-jass',
  minPlayers: 2,
  maxPlayers: 2,
  disableUndo: true,

  setup: ({ random }, setupData) => {
    const settings = setupData ?? DEFAULT_SETTINGS;
    const dealer = String(random.Die(2) - 1) as PlayerID;
    const vorne = otherPlayer(dealer);
    return {
      rulesVersion: RULES_VERSION,
      playerNames: {
        '0': setupData?.playerNames?.['0'] ?? null,
        '1': setupData?.playerNames?.['1'] ?? null,
      },
      deck: createDeck(),
      hands: emptyHands(),
      trump: null,
      revealedCard: null,
      dealer,
      vorne,
      declarer: null,
      contract: null,
      readyPlayers: [],
      scores: initialGameScores(settings.handicap),
      matchPoints: { '0': 0, '1': 0 },
      handScores: { '0': 0, '1': 0 },
      handScoreDetails: emptyScoreDetails(),
      settings,
      gameNumber: 1,
      handNumber: 1,
      redealCount: 0,
      lastHandResult: null,
      gameResult: null,
      matchResult: null,
      cube: { value: 1, holder: null },
      cubeOffer: null,
      afterMoveDoubleBy: null,
      smallGameAnnounced: false,
      smallGameAccepted: false,
      trumpSevenDecisions: [],
      trumpSelectionPassedCount: 0,
      meldContest: null,
      pendingDealerSequence: false,
      announcedBella: [],
      shownMelds: [],
      currentTrick: { leadPlayer: vorne, cards: {}, winner: null },
      pastTricks: [],
      trickWinner: null,
      timeoutCard: null,
      trickDisplayUntil: null,
      extraDealStartedAt: null,
      extraDealUntil: null,
      deadlineAt: null,
      nextGamePlayers: [],
      matchPaused: false,
      resumePlayers: [],
      meldAnnouncement: null,
      chatMessages: [],
      chatSequence: 0,
    };
  },

  phases: {
    waitingRoom: {
      start: true,
      moves: { setReady: JassMoves.setReady },
      turn: { activePlayers: { all: 'waiting' } },
      next: 'deal',
    },
    deal: {
      onBegin: ({ G, random, events }) => {
        resetHandState(G);
        G.deck = random.Shuffle(createDeck());
        G.hands['0'] = G.deck.splice(0, 6);
        G.hands['1'] = G.deck.splice(0, 6);
        G.revealedCard = G.deck.splice(0, 1)[0];
        events.endPhase();
      },
      next: 'trumpSelection',
    },
    trumpSelection: {
      turn: { order: alternatingOrder() },
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
      next: 'playing',
    },
    trumpExchange: {
      // Compatibility only: persisted games in the old shared exchange phase are migrated on load.
      turn: { activePlayers: { all: 'waiting' } },
      moves: {
        startPlaying: ({ events }) => { events.endPhase(); },
      },
      next: 'playing',
    },
    playing: {
      turn: { order: alternatingOrder() },
      moves: {
        playCard: PlayMoves.playCard,
        exchangeTrumpSeven: JassMoves.exchangeTrumpSeven,
        keepTrumpSeven: JassMoves.keepTrumpSeven,
        respondMeld: PlayMoves.respondMeld,
        nameMeld: PlayMoves.nameMeld,
        resolveMeldContest: PlayMoves.resolveMeldContest,
        doubleCube: JassMoves.doubleCube,
        acceptCube: JassMoves.acceptCube,
        declineCube: JassMoves.declineCube,
      },
      next: 'endOfHand',
    },
    endOfHand: {
      turn: { activePlayers: { all: 'waiting' } },
      moves: { nextHand: JassMoves.nextHand },
      next: 'deal',
    },
    endOfGame: {
      turn: { activePlayers: { all: 'waiting' } },
      moves: {
        nextGame: JassMoves.nextGame,
        endMatch: JassMoves.endMatch,
        pauseMatch: JassMoves.pauseMatch,
        resumeMatch: JassMoves.resumeMatch,
      },
      next: 'deal',
    },
  },
};

export function resetHandState(G: JassState) {
  G.deck = createDeck();
  G.hands = emptyHands();
  G.trump = null;
  G.revealedCard = null;
  G.declarer = null;
  G.contract = null;
  G.readyPlayers = [];
  G.handScores = { '0': 0, '1': 0 };
  G.handScoreDetails = emptyScoreDetails();
  G.lastHandResult = null;
  G.cubeOffer = null;
  G.afterMoveDoubleBy = null;
  G.smallGameAnnounced = false;
  G.smallGameAccepted = false;
  G.trumpSevenDecisions = [];
  G.trumpSelectionPassedCount = 0;
  G.meldContest = null;
  G.pendingDealerSequence = false;
  G.announcedBella = [];
  G.shownMelds = [];
  G.currentTrick = { leadPlayer: G.vorne, cards: {}, winner: null };
  G.pastTricks = [];
  G.trickWinner = null;
  G.timeoutCard = null;
  G.trickDisplayUntil = null;
  G.extraDealStartedAt = null;
  G.extraDealUntil = null;
  G.deadlineAt = null;
  G.meldAnnouncement = null;
}

export function emptyScoreDetails() {
  return {
    '0': { tricks: 0, trickCount: 0, melds: 0, terz: 0, fifty: 0, bella: 0, jass: 0, mi: 0, lastTrick: 0 },
    '1': { tricks: 0, trickCount: 0, melds: 0, terz: 0, fifty: 0, bella: 0, jass: 0, mi: 0, lastTrick: 0 },
  };
}

function emptyHands(): Record<PlayerID, Card[]> {
  return { '0': [], '1': [] };
}

function alternatingOrder() {
  return {
    first: ({ G }: { G: JassState }) => Number(G.vorne),
    next: ({ ctx }: { ctx: { playOrderPos: number; numPlayers: number } }) =>
      (ctx.playOrderPos + 1) % ctx.numPlayers,
  };
}
