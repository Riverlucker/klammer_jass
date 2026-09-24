import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { createClientState, isServerGameState } from '@/game/playerView';
import { acknowledgeDecision, armDecisionTimer } from '@/game/decisionTimer';
import {
  isDeadlineExpired,
  reduceGameMove,
  timeoutAction,
} from '@/game/serverEngine';
import type { ServerGameState } from '@/game/types';
import { readMatchToken, resolvePlayerID } from '@/lib/auth';
import { pusherServer } from '@/lib/pusher';
import { matchResponseHeaders, notifyMatchUpdate } from '@/lib/matchUpdates';

const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();
  try {
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Ungültige Match-ID.' }, { status: 400 });
    }
    const body = await request.text();
    let payload: unknown = {};
    try { payload = body ? JSON.parse(body) : {}; }
    catch { return NextResponse.json({ error: 'Ungültige Zeitprüfung.' }, { status: 400 }); }
    const parsed = z.object({ decisionID: z.number().int().nonnegative().optional() }).safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: 'Ungültige Zeitprüfung.' }, { status: 400 });

    // Most polls only read. Open a transaction only when a deadline actually changes the game.
    const gameRecord = await prisma.game.findUnique({ where: { id }, include: { match: true } });
    if (!gameRecord?.match) return NextResponse.json({ error: 'Match nicht gefunden.' }, { status: 404 });
    const playerId = resolvePlayerID(gameRecord.match, readMatchToken(request, id));
    if (!playerId) return NextResponse.json({ error: 'Ungültige Spielsitzung.' }, { status: 403 });
    if (!isServerGameState(gameRecord.state)) {
      return NextResponse.json({ error: 'Nicht unterstützter Spielstand.' }, { status: 409 });
    }

    let state: ServerGameState = parsed.data.decisionID === undefined
      ? gameRecord.state
      : acknowledgeDecision(gameRecord.state, playerId, parsed.data.decisionID);
    if (isDeadlineExpired(state)) {
      const action = timeoutAction(state);
      if (action) {
        const reduced = reduceGameMove(state, action);
        if (reduced.state) state = armDecisionTimer(reduced.state);
      }
    }
    if (state !== gameRecord.state) {
      const changed = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.game.updateMany({
          where: { id, updatedAt: gameRecord.updatedAt },
          data: { state: toPrismaJson(state) },
        });
        if (updated.count !== 1) return false;
        const status = matchStatus(state);
        if (status !== gameRecord.match!.status) {
          await transaction.match.update({ where: { id }, data: { status } });
        }
        return true;
      });
      if (!changed) {
        return NextResponse.json({ error: 'Der Spielstand hat sich bereits geändert.' }, { status: 409 });
      }
      notifyMatchUpdate(id, state._stateID);
    }
    return NextResponse.json({
      success: true, playerId, state: createClientState(state, playerId), serverTime: Date.now(),
      realtimeEnabled: Boolean(pusherServer),
    }, { headers: matchResponseHeaders(startedAt) });
  } catch (error: unknown) {
    console.error('Zeitprüfung fehlgeschlagen:', error);
    return NextResponse.json({ error: 'Zeitprüfung fehlgeschlagen.' }, { status: 500 });
  }
}

function matchStatus(state: ServerGameState): string {
  if (state.ctx.gameover !== undefined) return 'finished';
  if (state.G.matchPaused) return 'paused';
  return 'active';
}
