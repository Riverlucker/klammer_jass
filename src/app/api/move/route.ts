import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { createClientState, isServerGameState } from '@/game/playerView';
import { armDecisionTimer } from '@/game/decisionTimer';
import {
  isDeadlineExpired,
  isExtraDealBeingDisplayed,
  isTrickBeingDisplayed,
  offerCubeAfterMove,
  reduceGameMove,
  timeoutAction,
} from '@/game/serverEngine';
import type { ServerGameState } from '@/game/types';
import { parseMoveRequest } from '@/lib/apiSchemas';
import { readMatchToken, resolvePlayerID } from '@/lib/auth';
import { pusherServer } from '@/lib/pusher';

class MoveRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseMoveRequest(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültiger Zug.' }, { status: 400 });
    }
    const { matchId, move, args, stateID } = parsed.data;

    const result = await prisma.$transaction(async (transaction) => {
      const gameRecord = await transaction.game.findUnique({
        where: { id: matchId },
        include: { match: true },
      });
      if (!gameRecord?.match) throw new MoveRequestError(404, 'Match nicht gefunden.');

      const playerId = resolvePlayerID(gameRecord.match, readMatchToken(request, matchId));
      if (!playerId) throw new MoveRequestError(403, 'Ungültige Spielsitzung.');
      if (!isServerGameState(gameRecord.state)) {
        throw new MoveRequestError(409, 'Nicht unterstützter Spielstand.');
      }

      const currentState = gameRecord.state;
      if (isDeadlineExpired(currentState)) {
        const automaticAction = timeoutAction(currentState);
        if (automaticAction) {
          const automatic = reduceGameMove(currentState, automaticAction);
          if (!automatic.state) throw new MoveRequestError(409, 'Der automatische Zug konnte nicht ausgeführt werden.');
          const nextState = armDecisionTimer(automatic.state);
          await persistState(transaction, matchId, gameRecord.updatedAt, nextState);
          return { playerId, state: createClientState(nextState, playerId), timedOut: true, trickBlocked: false, extraDealBlocked: false };
        }
      }

      const trickBlocked = isTrickBeingDisplayed(currentState);
      const extraDealBlocked = isExtraDealBeingDisplayed(currentState);
      if (trickBlocked || extraDealBlocked) {
        return {
          playerId,
          state: createClientState(currentState, playerId),
          timedOut: false,
          trickBlocked: true,
          extraDealBlocked,
        };
      }

      if (currentState._stateID !== stateID) {
        throw new MoveRequestError(409, 'Der Spielstand hat sich bereits geändert.');
      }

      const afterMoveCube = move === 'doubleCube'
        ? offerCubeAfterMove(currentState, playerId)
        : null;
      const reduced = afterMoveCube
        ? { state: afterMoveCube, errorType: null }
        : reduceGameMove(currentState, { move, args, playerID: playerId });
      if (!reduced.state) throw new MoveRequestError(422, translateMoveError(reduced.errorType));
      const nextState = move === 'inspectLastTrick' || move === 'prepareCard' ? reduced.state : armDecisionTimer(reduced.state);
      await persistState(transaction, matchId, gameRecord.updatedAt, nextState);
      return { playerId, state: createClientState(nextState, playerId), timedOut: false, trickBlocked: false, extraDealBlocked: false };
    });

    if (pusherServer && !result.trickBlocked) {
      try {
        await pusherServer.trigger(`match-${matchId}`, 'state-update', {
          stateID: result.state._stateID,
        });
      } catch (error: unknown) {
        console.error('Echtzeit-Benachrichtigung fehlgeschlagen:', error);
      }
    }

    if (result.timedOut) {
      return NextResponse.json(
        { error: 'Die Zugzeit war bereits abgelaufen.', ...result, serverTime: Date.now() },
        { status: 409 },
      );
    }
    if (result.trickBlocked) {
      return NextResponse.json(
        { error: result.extraDealBlocked ? 'Die drei Zusatzkarten werden noch aufgedeckt.' : 'Der Stich wird noch drei Sekunden lang angezeigt.', ...result, serverTime: Date.now() },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true, ...result, serverTime: Date.now() });
  } catch (error: unknown) {
    if (error instanceof MoveRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Zug konnte nicht verarbeitet werden:', error);
    return NextResponse.json({ error: 'Zug konnte nicht verarbeitet werden.' }, { status: 500 });
  }
}

async function persistState(
  transaction: Prisma.TransactionClient,
  matchId: string,
  updatedAt: Date,
  state: ServerGameState,
) {
  const updated = await transaction.game.updateMany({
    where: { id: matchId, updatedAt },
    data: { state: toPrismaJson(state) },
  });
  if (updated.count !== 1) throw new MoveRequestError(409, 'Ein anderer Zug war schneller.');
  await transaction.match.update({
    where: { id: matchId },
    data: { status: matchStatus(state) },
  });
}

function matchStatus(state: ServerGameState): string {
  if (state.ctx.gameover !== undefined) return 'finished';
  if (state.G.matchPaused) return 'paused';
  return 'active';
}

function translateMoveError(type: string | null): string {
  if (type === 'action/inactive_player') return 'Du bist gerade nicht am Zug.';
  if (type === 'action/unavailable_move') return 'Dieser Zug ist in der aktuellen Phase nicht verfügbar.';
  if (type === 'action/gameover') return 'Das Match ist bereits beendet.';
  return 'Dieser Zug ist nach den Spielregeln nicht erlaubt.';
}
