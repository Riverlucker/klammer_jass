import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { createClientState, isServerGameState } from '@/game/playerView';
import {
  isDeadlineExpired,
  reduceGameMove,
  stampDeadline,
  timeoutAction,
} from '@/game/serverEngine';
import type { ServerGameState } from '@/game/types';
import { readMatchToken, resolvePlayerID } from '@/lib/auth';
import { pusherServer } from '@/lib/pusher';

const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Ungültige Match-ID.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (transaction) => {
      const gameRecord = await transaction.game.findUnique({
        where: { id },
        include: { match: true },
      });
      if (!gameRecord?.match) return { status: 404 as const, error: 'Match nicht gefunden.' };
      const playerId = resolvePlayerID(gameRecord.match, readMatchToken(request, id));
      if (!playerId) return { status: 403 as const, error: 'Ungültige Spielsitzung.' };
      if (!isServerGameState(gameRecord.state)) {
        return { status: 409 as const, error: 'Nicht unterstützter Spielstand.' };
      }

      let state: ServerGameState = gameRecord.state;
      let changed = false;
      if (isDeadlineExpired(state)) {
        const action = timeoutAction(state);
        if (action) {
          const reduced = reduceGameMove(state, action);
          if (reduced.state) {
            state = stampDeadline(reduced.state);
            const updated = await transaction.game.updateMany({
              where: { id, updatedAt: gameRecord.updatedAt },
              data: { state: toPrismaJson(state) },
            });
            changed = updated.count === 1;
            if (!changed) return { status: 409 as const, error: 'Der Spielstand hat sich bereits geändert.' };
            await transaction.match.update({
              where: { id },
              data: { status: matchStatus(state) },
            });
          }
        }
      }
      return { status: 200 as const, playerId, state: createClientState(state, playerId), changed };
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.changed && pusherServer) {
      try {
        await pusherServer.trigger(`match-${id}`, 'state-update', { stateID: result.state._stateID });
      } catch (error: unknown) {
        console.error('Timeout-Benachrichtigung fehlgeschlagen:', error);
      }
    }
    return NextResponse.json({ success: true, playerId: result.playerId, state: result.state });
  } catch (error: unknown) {
    console.error('Zeitprüfung fehlgeschlagen:', error);
    return NextResponse.json({ error: 'Zeitprüfung fehlgeschlagen.' }, { status: 500 });
  }
}

function matchStatus(state: ReturnType<typeof stampDeadline>): string {
  if (state.ctx.gameover !== undefined) return 'finished';
  if (state.G.matchPaused) return 'paused';
  return 'active';
}
