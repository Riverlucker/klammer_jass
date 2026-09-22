import type { State, TransientState } from 'boardgame.io';
import { CreateGameReducer } from 'boardgame.io/internal';
import { appendDealerComments } from './chat';
import { EXTRA_DEAL_DISPLAY_MILLISECONDS } from './extraDeal';
import { JassGame } from './logic';
import { getGoodMeldReplyOptions, meldReplySeed } from './meldReplies';
import { expectedMeldDecision, expectedMeldResponse } from './playMoves';
import type { JassState, MeldType, PlayerID, ServerGameState } from './types';
import { isPlayerID, otherPlayer } from './types';
import { findBella, getBestSequenceMeld, isCard, isMoveLegal } from './validation';

export interface EngineAction {
  move: string;
  args: unknown[];
  playerID: PlayerID;
}

export const TRICK_DISPLAY_MILLISECONDS = 3_000;
export { EXTRA_DEAL_DISPLAY_MILLISECONDS } from './extraDeal';

const reducer = CreateGameReducer({ game: JassGame });

export function reduceGameMove(
  state: ServerGameState,
  action: EngineAction,
): { state: ServerGameState | null; errorType: string | null } {
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
    next._stateID += 1;
    return { state: next, errorType: null };
  }
  if (action.move === 'inspectLastTrick') {
    const now = Date.now();
    const last = state.G.pastTricks.at(-1);
    if (action.args.length !== 0 || !last || last.winner !== action.playerID
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
  appendDealerComments(state, nextState, action, now);
  return { state: nextState, errorType: null };
}

export function offerCubeAfterMove(
  state: ServerGameState,
  playerID: PlayerID,
): ServerGameState | null {
  const { G, ctx } = state;
  const allowed =
    (ctx.phase === 'trumpSelection' || ctx.phase === 'playing') &&
    ctx.currentPlayer !== playerID &&
    G.afterMoveDoubleBy === playerID &&
    G.settings.cubeEnabled &&
    !G.cubeOffer &&
    !G.gameResult &&
    (G.cube.holder === null || G.cube.holder === playerID) &&
    isPlayerID(ctx.currentPlayer);
  if (!allowed) return null;

  const nextState = structuredClone(state);
  nextState.G.cubeOffer = { from: playerID, resumePlayer: ctx.currentPlayer as PlayerID };
  nextState.G.afterMoveDoubleBy = null;
  nextState._stateID += 1;
  appendDealerComments(state, nextState, { move: 'doubleCube', args: [], playerID });
  return nextState;
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
  const displayUntil = Math.max(G.trickDisplayUntil ?? now, G.extraDealUntil ?? now);
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
    const playerID = (['0', '1'] as PlayerID[]).find((id) => !G.trumpSevenDecisions?.includes(id));
    return playerID ? { move: 'keepTrumpSeven', args: [], playerID } : null;
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
