import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/db';
import { createClientState, isServerGameState } from '@/game/playerView';
import { readMatchToken, resolvePlayerID } from '@/lib/auth';
import { matchResponseHeaders } from '@/lib/matchUpdates';
import { pusherServer } from '@/lib/pusher';
import { loadGameRecord } from '@/lib/gameRecord';

const idSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/matches/[id]'>,
) {
  const startedAt = performance.now();
  try {
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Ungültige Match-ID.' }, { status: 400 });
    }

    const gameRecord = await loadGameRecord(prisma, id, readMatchToken(request, id));
    if (!gameRecord?.match) {
      return NextResponse.json({ error: 'Match nicht gefunden.' }, { status: 404 });
    }

    const playerId = resolvePlayerID(gameRecord.match, readMatchToken(request, id));
    if (!playerId) {
      return NextResponse.json(
        { error: 'Für dieses Match fehlt eine gültige Spielsitzung.' },
        { status: 403 },
      );
    }
    if (!isServerGameState(gameRecord.state)) {
      return NextResponse.json(
        { error: 'Dieses Match verwendet einen nicht mehr unterstützten Spielstand.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      serverTime: Date.now(),
      realtimeEnabled: Boolean(pusherServer),
      playerId,
      state: createClientState(gameRecord.state, playerId),
    }, { headers: matchResponseHeaders(startedAt) });
  } catch (error: unknown) {
    console.error('Match konnte nicht geladen werden:', error);
    return NextResponse.json({ error: 'Match konnte nicht geladen werden.' }, { status: 500 });
  }
}
