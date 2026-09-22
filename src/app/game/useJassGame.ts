import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameClientState,
  MeldDecision,
  MeldResponse,
  PlayerID,
} from '@/game/types';
import { getPusherClient } from '@/lib/pusher';

export type MoveName =
  | 'prepareCard'
  | 'inspectLastTrick'
  | 'setReady'
  | 'nextHand'
  | 'acceptOriginal'
  | 'exchangeTrumpSeven'
  | 'keepTrumpSeven'
  | 'decline'
  | 'announceSmallGame'
  | 'acceptSmallGame'
  | 'overruleSmallGame'
  | 'chooseTrump'
  | 'doubleCube'
  | 'acceptCube'
  | 'declineCube'
  | 'playCard'
  | 'respondMeld'
  | 'nameMeld'
  | 'resolveMeldContest'
  | 'nextGame'
  | 'endMatch'
  | 'resumeMatch';

interface StateResponse {
  success?: true;
  state: GameClientState;
  playerId: PlayerID;
  error?: string;
}

export const MELD_RESPONSE_LABELS: Record<MeldResponse, string> = {
  good: 'Ist gut',
  meToo: 'Ich auch',
  notGood: 'Ist nicht gut',
};

export const MELD_DECISION_LABELS: Record<MeldDecision, string> = {
  show: 'Höhere Folge zeigen',
  concede: 'Die erste Meldung gilt',
};

export function useJassGame(matchId: string) {
  const [state, setState] = useState<GameClientState | null>(null);
  const [playerId, setPlayerId] = useState<PlayerID | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isChatSending, setIsChatSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickedDeadline = useRef<number | null>(null);

  const applyResponse = useCallback((data: StateResponse) => {
    setState(data.state);
    setPlayerId(data.playerId);
  }, []);

  const fetchState = useCallback(async () => {
    if (!matchId) return;
    try {
      const response = await fetch(`/api/matches/${matchId}`, { cache: 'no-store' });
      const data = await readJson(response);
      if (!response.ok || !hasState(data)) throw new Error(data.error ?? 'Spielstand konnte nicht geladen werden.');
      applyResponse(data);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [applyResponse, matchId]);

  const tickState = useCallback(async () => {
    if (!matchId) return;
    try {
      const response = await fetch(`/api/matches/${matchId}/tick`, { method: 'POST' });
      const data = await readJson(response);
      if (!response.ok || !hasState(data)) throw new Error(data.error ?? 'Zeitprüfung fehlgeschlagen.');
      applyResponse(data);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }, [applyResponse, matchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchState(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchState]);

  useEffect(() => {
    if (!matchId) return;
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`match-${matchId}`);
    channel.bind('state-update', fetchState);
    return () => {
      channel.unbind('state-update', fetchState);
      pusher.unsubscribe(`match-${matchId}`);
    };
  }, [fetchState, matchId]);

  useEffect(() => {
    const timer = window.setInterval(() => void fetchState(), 5000);
    return () => window.clearInterval(timer);
  }, [fetchState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const deadlineAt = state?.G.deadlineAt ?? null;
  const trickDisplayUntil = state?.G.trickDisplayUntil ?? null;
  const extraDealStartedAt = state?.G.extraDealStartedAt ?? null;
  const extraDealUntil = state?.G.extraDealUntil ?? null;
  useEffect(() => {
    if (deadlineAt === null || now < deadlineAt || tickedDeadline.current === deadlineAt) return;
    tickedDeadline.current = deadlineAt;
    void tickState();
  }, [deadlineAt, now, tickState]);

  const dispatchMove = useCallback(async (move: MoveName, args: unknown[] = []) => {
    if (!playerId || !state || isSending) return false;
    setIsSending(true);
    try {
      const response = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, move, args, stateID: state._stateID }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        if (hasState(data)) applyResponse(data);
        else if (response.status === 409) await fetchState();
        throw new Error(data.error ?? 'Zug konnte nicht gesendet werden.');
      }
      if (!hasState(data)) throw new Error('Der Server hat keinen Spielstand zurückgegeben.');
      applyResponse(data);
      setError(null);
      return true;
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setIsSending(false);
    }
  }, [applyResponse, fetchState, isSending, matchId, playerId, state]);

  const sendChat = useCallback(async (message: string) => {
    if (!playerId || !state || isChatSending) return false;
    setIsChatSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, message }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        if (hasState(data)) applyResponse(data);
        else if (response.status === 409) await fetchState();
        throw new Error(data.error ?? 'Nachricht konnte nicht gesendet werden.');
      }
      if (!hasState(data)) throw new Error('Der Server hat keinen Spielstand zurückgegeben.');
      applyResponse(data);
      setError(null);
      return true;
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setIsChatSending(false);
    }
  }, [applyResponse, fetchState, isChatSending, matchId, playerId, state]);

  const trickDisplayMilliseconds = trickDisplayUntil === null
    ? 0
    : Math.max(0, trickDisplayUntil - now);
  const extraDealMilliseconds = extraDealUntil === null
    ? 0
    : Math.max(0, extraDealUntil - now);
  const extraDealElapsedMilliseconds = extraDealMilliseconds > 0 && extraDealStartedAt !== null
    ? Math.max(0, now - extraDealStartedAt)
    : null;
  const decisionClockStart = Math.max(
    now,
    trickDisplayMilliseconds > 0 ? trickDisplayUntil! : now,
    extraDealMilliseconds > 0 ? extraDealUntil! : now,
  );

  return {
    state,
    playerId,
    loading,
    isSending,
    isChatSending,
    error,
    remainingMilliseconds: deadlineAt === null ? null : Math.max(0, deadlineAt - decisionClockStart),
    remainingSeconds: deadlineAt === null ? null : Math.max(0, Math.ceil((deadlineAt - decisionClockStart) / 1000)),
    trickDisplayMilliseconds,
    extraDealMilliseconds,
    extraDealElapsedMilliseconds,
    now,
    clearError: () => setError(null),
    dispatchMove,
    sendChat,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> & { error?: string }> {
  try {
    return await response.json() as Record<string, unknown> & { error?: string };
  } catch {
    return {};
  }
}

function hasState(value: Record<string, unknown>): value is Record<string, unknown> & StateResponse {
  return Boolean(value.state && value.playerId);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
}
