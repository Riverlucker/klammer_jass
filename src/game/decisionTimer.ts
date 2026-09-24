import { isDeadlineExpired, isExtraDealBeingDisplayed, isTrickBeingDisplayed, stampDeadline, timeoutAction } from './serverEngine';
import type { PlayerID, ServerGameState } from './types';

// A disconnected player must not hold the table indefinitely while we await display confirmation.
export const DISPLAY_ACK_GRACE_MS = 15_000;

export function armDecisionTimer(state: ServerGameState, now = Date.now()): ServerGameState {
  const next = stampDeadline(state, now);
  next.G.decisionTimer = null;
  if (next.G.deadlineAt === null) return next;
  const action = timeoutAction(next);
  if (!action) return next;
  const waitingFor = next.ctx.phase === 'endOfHand'
    ? (['0', '1'] as PlayerID[]).filter((id) => !next.G.readyPlayers.includes(id))
    : next.ctx.phase === 'endOfGame'
      ? (['0', '1'] as PlayerID[]).filter((id) => !next.G.nextGamePlayers.includes(id))
      : [action.playerID];
  next.G.decisionTimer = { id: next._stateID, waitingFor, started: false };
  next.G.deadlineAt += DISPLAY_ACK_GRACE_MS;
  return next;
}

export function acknowledgeDecision(
  state: ServerGameState,
  playerID: PlayerID,
  decisionID: number,
  now = Date.now(),
): ServerGameState {
  const timer = state.G.decisionTimer;
  if (!timer || timer.id !== decisionID || timer.started || !timer.waitingFor.includes(playerID)
    || state.G.deadlineAt === null || isDeadlineExpired(state, now)
    || isTrickBeingDisplayed(state, now) || isExtraDealBeingDisplayed(state, now)) return state;
  const seconds = state.G.cubeOffer ? state.G.settings.cubeTimeSeconds : state.G.settings.moveTimeSeconds;
  return {
    ...state,
    _stateID: state._stateID + 1,
    G: { ...state.G, deadlineAt: now + seconds * 1000, decisionTimer: { ...timer, started: true } },
  };
}
