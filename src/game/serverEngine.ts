import type { State, TransientState } from 'boardgame.io';
import { CreateGameReducer } from 'boardgame.io/internal';
import { appendDealerComments } from './chat';
import { EXTRA_DEAL_DISPLAY_MILLISECONDS } from './extraDeal';
import { JassGame } from './logic';
import { getGoodMeldReplyOptions, meldReplySeed } from './meldReplies';
import { expectedMeldDecision, expectedMeldResponse } from './playMoves';
import type { JassState, MeldType, PlayerID, ServerGameState } from './types';
import { isPlayerID, otherPlayer } from './types';
import { findBella, getAvailableMeldTypes, getBestSequenceMeld, isCard, isMoveLegal } from './validation';
import { TRICK_DISPLAY_MILLISECONDS } from './trickDisplay';
import { REDEAL_DISPLAY_MILLISECONDS } from './redeal';

export interface EngineAction {
  move: string;
  args: unknown[];
  playerID: PlayerID;
}

export { TRICK_DISPLAY_MILLISECONDS } from './trickDisplay';
export { EXTRA_DEAL_DISPLAY_MILLISECONDS } from './extraDeal';

const reducer = CreateGameReducer({ game: JassGame });

export function reduceGameMove(
  state: ServerGameState,
  action: EngineAction,
): { state: ServerGameState | null; errorType: string | null } {
  if (state.G.matchResult || state.ctx.gameover !== undefined) return invalidMove();
  if (state.G.matchPaused && action.move !== 'resumeMatch' && action.move !== 'endMatch') return invalidMove();
  const result = reduceMove(state, action);
  if (result.state) {
    result.state.G.consecutiveTimeouts = { ...result.state.G.consecutiveTimeouts ?? { '0': 0, '1': 0 }, [action.playerID]: 0 };
    recordMatchProgress(state, result.state);
  }
  return result;
}

function invalidMove() { return { state: null, errorType: 'action/invalid_move' }; }

function recordMatchProgress(previous: ServerGameState, next: ServerGameState) {
  if (previous.G.completedHands !== undefined && next.G.pastTricks.length > previous.G.pastTricks.length
    && next.G.hands['0'].length === 0 && next.G.hands['1'].length === 0) {
    next.G.completedHands = previous.G.completedHands + 1;
  }
  if (next.G.matchResult && !previous.G.matchResult) next.G.matchEndedAt = Date.now();
}

// Both timeout entry points stop as soon as each player has missed three consecutive decisions.
export function reduceTimedOutMove(state: ServerGameState): { state: ServerGameState | null; errorType: string | null } {
  if (!isDeadlineExpired(state) || state.G.matchPaused || state.G.matchResult) return invalidMove();
  const action = timeoutAction(state);
  if (!action) return invalidMove();
  const counts = { ...state.G.consecutiveTimeouts ?? { '0': 0, '1': 0 } };
  counts[action.playerID] += 1;
  if (counts['0'] >= 3 && counts['1'] >= 3) {
    const next = structuredClone(state);
    next._stateID += 1;
    next.G.consecutiveTimeouts = counts;
    next.G.matchPaused = true;
    next.G.pauseReason = 'inactivity';
    next.G.resumePlayers = [];
    next.G.deadlineAt = null;
    next.G.decisionTimer = null;
    appendDealerComments(state, next, { ...action, move: 'interruptMatch', args: [] });
    return { state: next, errorType: null };
  }
  const result = reduceMove(state, action);
  if (result.state) {
    result.state.G.consecutiveTimeouts = counts;
    recordMatchProgress(state, result.state);
  }
  return result;
}

function reduceMove(state: ServerGameState, action: EngineAction): { state: ServerGameState | null; errorType: string | null } {
  if (state.G.matchPaused && state.G.pauseReason === 'inactivity') {
    if (action.move !== 'resumeMatch' && action.move !== 'endMatch') return invalidMove();
    const next = structuredClone(state);
    next._stateID += 1;
    if (action.move === 'endMatch') {
      const winner = next.G.matchPoints['0'] === next.G.matchPoints['1'] ? null
        : next.G.matchPoints['0'] > next.G.matchPoints['1'] ? '0' : '1';
      next.G.matchResult = { winner, finalMatchPoints: { ...next.G.matchPoints }, endedBy: action.playerID, reason: 'player-ended' };
      next.ctx.gameover = next.G.matchResult;
      next.G.resumePlayers = [];
      next.G.nextGamePlayers = [];
    } else {
      if (!next.G.resumePlayers.includes(action.playerID)) next.G.resumePlayers.push(action.playerID);
      if (next.G.resumePlayers.length === 2) {
        next.G.matchPaused = false;
        next.G.pauseReason = null;
        next.G.resumePlayers = [];
        next.G.consecutiveTimeouts = { '0': 0, '1': 0 };
      }
    }
    appendDealerComments(state, next, action);
    return { state: next, errorType: null };
  }
  if (action.move === 'prepareCard') {
    if (state.ctx.phase !== 'playing' || state.ctx.currentPlayer !== action.playerID
      || isDeadlineExpired(state) || isTrickBeingDisplayed(state) || isExtraDealBeingDisplayed(state)
      || state.G.matchPaused || state.G.cubeOffer) return { state: null, errorType: 'action/invalid_move' };
    if (action.args.length > 0 && !reduceGameMove(state, { ...action, move: 'playCard' }).state) {
      return { state: null, errorType: 'action/invalid_move' };
    }
    const next = structuredClone(state);
    next.G.timeoutSelection = action.args.length === 0 ? null : {
      playerID: action.playerID,
      card: action.args[0] as NonNullable<JassState['timeoutCard']>,
      melds: (action.args[1] ?? []) as MeldType[],
    };
    const card = next.G.timeoutSelection?.card;
    const canSelectMeld = card && next.G.trump && getAvailableMeldTypes(next.G.hands[action.playerID], next.G.trump, action.playerID)
      .some((type) => type === 'Bella'
        ? !next.G.announcedBella.includes(action.playerID) && card.suit === next.G.trump && (card.rank === 'K' || card.rank === 'Q')
        : next.G.pastTricks.length === 0 && !next.G.meldContest);
    // Choosing a meld is a separate decision. Reserve time once per turn, even if
    // the player cancels, changes cards or toggles the default declarations.
    if (canSelectMeld && next.G.meldSelectionTurn !== next.ctx.turn) {
      next.G.meldSelectionTurn = next.ctx.turn;
      if (next.G.deadlineAt !== null) {
        next.G.deadlineAt = Math.max(next.G.deadlineAt, Date.now() + next.G.settings.moveTimeSeconds * 1000);
      }
    }
    next._stateID += 1;
    return { state: next, errorType: null };
  }
  if (action.move === 'inspectLastTrick') {
    const now = Date.now();
    const last = state.G.pastTricks.at(-1);
    if (action.args.length !== 0 || !last || !isPlayerID(action.playerID)
      || state.ctx.phase !== 'playing' || state.ctx.gameover !== undefined
      || state.G.matchPaused || state.G.cubeOffer || isDeadlineExpired(state, now)
      || isTrickBeingDisplayed(state, now) || isExtraDealBeingDisplayed(state, now)) {
      return { state: null, errorType: 'action/invalid_move' };
    }
    const next = structuredClone(state);
    next.G.trickDisplayUntil = now + TRICK_DISPLAY_MILLISECONDS;
    next.G.inspectingLastTrick = true;
    if (next.G.deadlineAt !== null) next.G.deadlineAt += TRICK_DISPLAY_MILLISECONDS;
    next._stateID += 1;
    appendDealerComments(state, next, action, now);
    return { state: next, errorType: null };
  }
  const reduced = reducer(state, {
    type: 'MAKE_MOVE',
    payload: { type: action.move, args: action.args, playerID: action.playerID },
  }) as TransientState<JassState>;
  if (reduced.transients?.error) {
    return { state: null, errorType: reduced.transients.error.type };
  }
  const nextState = structuredClone(stripTransients(reduced));
  const now = Date.now();
  if (nextState.G.pastTricks.length > state.G.pastTricks.length) {
    nextState.G.inspectingLastTrick = false;
    nextState.G.trickDisplayUntil = now + TRICK_DISPLAY_MILLISECONDS;
  } else if ((nextState.G.trickDisplayUntil ?? 0) <= now) {
    nextState.G.inspectingLastTrick = false;
    nextState.G.trickDisplayUntil = null;
  }
  if (state.G.trump === null && nextState.G.trump !== null) {
    nextState.G.extraDealStartedAt = now;
    nextState.G.extraDealUntil = now + EXTRA_DEAL_DISPLAY_MILLISECONDS;
  } else if ((nextState.G.extraDealUntil ?? 0) <= now) {
    nextState.G.extraDealStartedAt = null;
    nextState.G.extraDealUntil = null;
  }
  if (nextState.G.gameNumber === state.G.gameNumber && nextState.G.handNumber === state.G.handNumber
    && nextState.G.redealCount > state.G.redealCount) {
    nextState.G.redealStartedAt = now;
    nextState.G.redealUntil = now + REDEAL_DISPLAY_MILLISECONDS;
  } else if ((nextState.G.redealUntil ?? 0) <= now) {
    nextState.G.redealStartedAt = null;
    nextState.G.redealUntil = null;
  }
  appendDealerComments(state, nextState, action, now);
  return { state: nextState, errorType: null };
}

export function stampDeadline(
  state: ServerGameState,
  now = Date.now(),
  random = Math.random,
): ServerGameState {
  const nextState: ServerGameState = { ...state, G: { ...state.G } };
  const { G, ctx } = nextState;
  G.timeoutSelection = null;
  if (ctx.gameover !== undefined || G.matchPaused || ctx.phase === 'waitingRoom' || ctx.phase === 'deal') {
    G.deadlineAt = null;
    G.timeoutCard = null;
    return nextState;
  }
  G.timeoutCard = selectTimeoutCard(nextState, random);
  const seconds = G.cubeOffer ? G.settings.cubeTimeSeconds : G.settings.moveTimeSeconds;
  const displayUntil = Math.max(G.trickDisplayUntil ?? now, G.extraDealUntil ?? now, G.redealUntil ?? now);
  const displayDelay = Math.max(0, displayUntil - now);
  G.deadlineAt = now + displayDelay + seconds * 1000;
  return nextState;
}

export function isDeadlineExpired(state: ServerGameState, now = Date.now()): boolean {
  return state.G.deadlineAt !== null && state.G.deadlineAt <= now;
}

export function isTrickBeingDisplayed(state: ServerGameState, now = Date.now()): boolean {
  return state.G.trickDisplayUntil !== null && state.G.trickDisplayUntil > now;
}

export function isExtraDealBeingDisplayed(state: ServerGameState, now = Date.now()): boolean {
  return state.G.extraDealUntil !== null && state.G.extraDealUntil > now;
}

export function isRedealBeingDisplayed(state: ServerGameState, now = Date.now()): boolean {
  return (state.G.redealUntil ?? 0) > now;
}

export function timeoutAction(state: ServerGameState): EngineAction | null {
  const { G, ctx } = state;
  if (ctx.gameover !== undefined || G.matchPaused) return null;

  if (G.cubeOffer) {
    return { move: 'declineCube', args: [], playerID: otherPlayer(G.cubeOffer.from) };
  }

  if (ctx.phase === 'trumpSelection') {
    const playerID = currentPlayer(ctx.currentPlayer);
    if (!playerID) return null;
    if (G.smallGameAnnounced && !G.smallGameAccepted && playerID === G.dealer) {
      return { move: 'acceptSmallGame', args: [], playerID };
    }
    if (G.smallGameAccepted && playerID === G.vorne && G.revealedCard) {
      const suit = ['Spades', 'Hearts', 'Diamonds', 'Clubs'].find((candidate) => candidate !== G.revealedCard?.suit);
      return suit ? { move: 'chooseTrump', args: [suit], playerID } : null;
    }
    return { move: 'decline', args: [], playerID };
  }

  if (ctx.phase === 'trumpExchange') {
    const playerID = currentPlayer(ctx.currentPlayer);
    return playerID ? { move: 'startPlaying', args: [], playerID } : null;
  }

  if (ctx.phase === 'playing') {
    if (G.meldContest?.stage === 'awaitingResponse') {
      const response = expectedMeldResponse(G);
      if (!response) return null;
      const args = response === 'good'
        ? [response, getGoodMeldReplyOptions(meldReplySeed(G.gameNumber, G.handNumber, G.dealer))[0]]
        : [response];
      return { move: 'respondMeld', args, playerID: G.dealer };
    }
    if (G.meldContest?.stage === 'awaitingFrontName') {
      return { move: 'nameMeld', args: [], playerID: G.vorne };
    }
    if (G.meldContest?.stage === 'awaitingDealerDecision') {
      const decision = expectedMeldDecision(G);
      return decision ? { move: 'resolveMeldContest', args: [decision], playerID: G.dealer } : null;
    }
    const playerID = currentPlayer(ctx.currentPlayer);
    if (!playerID || !G.trump) return null;
    const selection = G.timeoutSelection;
    if (selection?.playerID === playerID) {
      const prepared = { move: 'playCard', args: [selection.card, selection.melds], playerID };
      if (reduceGameMove(state, prepared).state) return prepared;
    }
    const leadCard = G.currentTrick.cards[G.currentTrick.leadPlayer];
    const trickCards = Object.values(G.currentTrick.cards).filter(isCard);
    const legalCards = G.hands[playerID].filter((card) =>
      isMoveLegal(card, G.hands[playerID], trickCards, leadCard?.suit ?? null, G.trump!),
    );
    const card = G.timeoutCard && legalCards.some((candidate) => sameCard(candidate, G.timeoutCard!))
      ? G.timeoutCard
      : legalCards[0];
    if (!card) return null;
    const melds: MeldType[] = [];
    if (G.pastTricks.length === 0 && !G.meldContest) {
      const sequence = getBestSequenceMeld(G.hands[playerID], G.trump, playerID);
      if (sequence) melds.push(sequence.type);
    }
    if (
      !G.announcedBella.includes(playerID) &&
      card.suit === G.trump &&
      (card.rank === 'K' || card.rank === 'Q') &&
      findBella(G.hands[playerID], G.trump, playerID)
    ) melds.push('Bella');
    return { move: 'playCard', args: [card, melds], playerID };
  }

  if (ctx.phase === 'endOfHand') {
    const playerID = (['0', '1'] as PlayerID[]).find((id) => !G.readyPlayers.includes(id));
    return playerID ? { move: 'nextHand', args: [], playerID } : null;
  }

  if (ctx.phase === 'endOfGame') {
    return { move: 'pauseMatch', args: [], playerID: '0' };
  }

  return null;
}

function selectTimeoutCard(state: ServerGameState, random: () => number): JassState['timeoutCard'] {
  const { G, ctx } = state;
  if (ctx.phase !== 'playing' || G.cubeOffer || !G.trump) return null;
  if (G.meldContest && G.meldContest.stage !== 'dealerPlay') return null;
  const playerID = currentPlayer(ctx.currentPlayer);
  if (!playerID) return null;
  const leadCard = G.currentTrick.cards[G.currentTrick.leadPlayer];
  const trickCards = Object.values(G.currentTrick.cards).filter(isCard);
  const legalCards = G.hands[playerID].filter((card) =>
    isMoveLegal(card, G.hands[playerID], trickCards, leadCard?.suit ?? null, G.trump!),
  );
  if (legalCards.length === 0) return null;
  const index = Math.min(legalCards.length - 1, Math.floor(random() * legalCards.length));
  return legalCards[index];
}

function stripTransients(state: TransientState<JassState>): ServerGameState {
  const copy = { ...state } as TransientState<JassState> & { transients?: unknown };
  delete copy.transients;
  return copy as State<JassState>;
}

function currentPlayer(value: string): PlayerID | null {
  return isPlayerID(value) ? value : null;
}

function sameCard(a: { suit: string; rank: string }, b: { suit: string; rank: string }): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
