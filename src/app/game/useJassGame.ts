import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameClientState,
  MeldDecision,
  MeldResponse,
  PlayerID,
} from '@/game/types';
import { getPusherClient } from '@/lib/pusher';
import { canRetryAfterTimerStart, GameClock, TickRequest } from './gameSync';

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
  serverTime?: number;
  realtimeEnabled?: boolean;
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
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [serverRealtime, setServerRealtime] = useState(false);
  const clock = useRef(new GameClock());
  const ticks = useRef(new TickRequest());
  const latestState = useRef<GameClientState | null>(null);
  const sending = useRef(false);

  const applyResponse = useCallback((data: StateResponse) => {
    if (!clock.current.accept(data.state._stateID, data.serverTime)) return;
    if (data.realtimeEnabled !== undefined) setServerRealtime(data.realtimeEnabled);
    latestState.current = data.state;
    setState(data.state);
    setPlayerId(data.playerId);
    setNow(clock.current.now());
  }, []);

  const fetchState = useCallback(async () => {
    if (!matchId) return;
    try {
      const response = await fetch(`/api/matches/${matchId}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
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

  const tickState = useCallback((decisionID?: number) => {
    if (!matchId || sending.current) return Promise.resolve();
    return ticks.current.run(async () => {
      try {
        const response = await fetch(`/api/matches/${matchId}/tick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisionID }),
          signal: AbortSignal.timeout(10_000),
        });
        const data = await readJson(response);
        if (response.status === 409) { await fetchState(); return; }
        if (!response.ok || !hasState(data)) throw new Error(data.error ?? 'Zeitprüfung fehlgeschlagen.');
        applyResponse(data);
        setError(null);
      } catch (cause: unknown) {
        setError(errorMessage(cause));
      }
    });
  }, [applyResponse, fetchState, matchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchState(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchState]);

  useEffect(() => {
    if (!matchId) return;
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`match-${matchId}`);
    const subscribed = () => { setRealtimeConnected(true); void fetchState(); };
    const disconnected = () => { setRealtimeConnected(false); };
    const stateUpdated = (event: { stateID?: number }) => {
      if (event?.stateID !== undefined && event.stateID <= (latestState.current?._stateID ?? -1)) return;
      void fetchState();
    };
    channel.bind('pusher:subscription_succeeded', subscribed);
    channel.bind('pusher:subscription_error', disconnected);
    channel.bind('state-update', stateUpdated);
    pusher.connection.bind('disconnected', disconnected);
    pusher.connection.bind('unavailable', disconnected);
    pusher.connection.bind('failed', disconnected);
    return () => {
      channel.unbind('state-update', stateUpdated);
      channel.unbind('pusher:subscription_succeeded', subscribed);
      channel.unbind('pusher:subscription_error', disconnected);
      pusher.connection.unbind('disconnected', disconnected);
      pusher.connection.unbind('unavailable', disconnected);
      pusher.connection.unbind('failed', disconnected);
      pusher.unsubscribe(`match-${matchId}`);
    };
  }, [fetchState, matchId]);

  useEffect(() => {
    const interval = realtimeConnected && serverRealtime ? 5000 : 1000;
    let stopped = false;
    let timer = window.setTimeout(poll, interval);
    async function poll() {
      await tickState();
      if (!stopped) timer = window.setTimeout(poll, interval);
    }
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [realtimeConnected, serverRealtime, tickState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock.current.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const deadlineAt = state?.G.deadlineAt ?? null;
  const trickDisplayUntil = state?.G.trickDisplayUntil ?? null;
  const extraDealStartedAt = state?.G.extraDealStartedAt ?? null;
  const extraDealUntil = state?.G.extraDealUntil ?? null;
  useEffect(() => {
    if (deadlineAt === null || now < deadlineAt) return;
    void tickState();
  }, [deadlineAt, now, tickState]);

  const decisionTimer = state?.G.decisionTimer;
  const readyDecisionID = !loading && !isSending && playerId && decisionTimer && !decisionTimer.started
    && decisionTimer.waitingFor.includes(playerId)
    && (trickDisplayUntil ?? 0) <= now && (extraDealUntil ?? 0) <= now
    ? decisionTimer.id : null;
  useEffect(() => {
    if (readyDecisionID === null || document.visibilityState !== 'visible') return;
    // Two frames ensure the options have actually been painted before starting the server clock.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => { void tickState(readyDecisionID); });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [readyDecisionID, now, tickState]);

  const dispatchMove = useCallback(async (move: MoveName, args: unknown[] = []) => {
    if (!playerId || !state || sending.current) return false;
    sending.current = true;
    setIsSending(true);
    try {
      let current = latestState.current!;
      // Ignore a click on options that a concurrent timeout has already replaced.
      if (current.G.decisionTimer?.id !== state.G.decisionTimer?.id) return false;
      // Do not queue clicks behind background polls. Retry only a concurrent timer-start acknowledgement.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId, move, args, stateID: current._stateID }),
        });
        const data = await readJson(response);
        if (!response.ok) {
          if (hasState(data)) applyResponse(data);
          else if (response.status === 409) await fetchState();
          const refreshed = latestState.current!;
          if (response.status === 409 && attempt === 0 && canRetryAfterTimerStart(current, refreshed)) {
            current = refreshed;
            continue;
          }
          throw new Error(data.error ?? 'Zug konnte nicht gesendet werden.');
        }
        if (!hasState(data)) throw new Error('Der Server hat keinen Spielstand zurückgegeben.');
        applyResponse(data);
        setError(null);
        return true;
      }
      return false;
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      return false;
    } finally {
      sending.current = false;
      setIsSending(false);
    }
  }, [applyResponse, fetchState, matchId, playerId, state]);

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
  const decisionMilliseconds = deadlineAt === null ? null
    : decisionTimer && !decisionTimer.started
      ? (state!.G.cubeOffer ? state!.G.settings.cubeTimeSeconds : state!.G.settings.moveTimeSeconds) * 1000
      : Math.max(0, deadlineAt - decisionClockStart);

  return {
    state,
    playerId,
    loading,
    isSending,
    isChatSending,
    error,
    remainingMilliseconds: decisionMilliseconds,
    remainingSeconds: decisionMilliseconds === null ? null : Math.ceil(decisionMilliseconds / 1000),
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
