import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { appendPlayerChat } from '@/game/chat';
import { createClientState, isServerGameState } from '@/game/playerView';
import type { ServerGameState } from '@/game/types';
import { parseChatRequest } from '@/lib/apiSchemas';
import { readMatchToken, resolvePlayerID } from '@/lib/auth';
import { pusherServer } from '@/lib/pusher';

class ChatRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseChatRequest(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Die Nachricht muss zwischen 1 und 280 Zeichen lang sein.' }, { status: 400 });
    }
    const { matchId, message } = parsed.data;

    const result = await prisma.$transaction(async (transaction) => {
      const gameRecord = await transaction.game.findUnique({
        where: { id: matchId },
        include: { match: true },
      });
      if (!gameRecord?.match) throw new ChatRequestError(404, 'Match nicht gefunden.');

      const playerId = resolvePlayerID(gameRecord.match, readMatchToken(request, matchId));
      if (!playerId) throw new ChatRequestError(403, 'Ungültige Spielsitzung.');
      if (!isServerGameState(gameRecord.state)) {
        throw new ChatRequestError(409, 'Nicht unterstützter Spielstand.');
      }

      const nextState = appendPlayerChat(gameRecord.state, playerId, message);
      await persistChat(transaction, matchId, gameRecord.updatedAt, nextState);
      return { playerId, state: createClientState(nextState, playerId) };
    });

    if (pusherServer) {
      try {
        await pusherServer.trigger(`match-${matchId}`, 'state-update', {
          stateID: result.state._stateID,
        });
      } catch (error: unknown) {
        console.error('Chat-Benachrichtigung fehlgeschlagen:', error);
      }
    }

    return NextResponse.json({ success: true, ...result, serverTime: Date.now() });
  } catch (error: unknown) {
    if (error instanceof ChatRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Chatnachricht konnte nicht gesendet werden:', error);
    return NextResponse.json({ error: 'Chatnachricht konnte nicht gesendet werden.' }, { status: 500 });
  }
}

async function persistChat(
  transaction: Prisma.TransactionClient,
  matchId: string,
  updatedAt: Date,
  state: ServerGameState,
) {
  const updated = await transaction.game.updateMany({
    where: { id: matchId, updatedAt },
    data: { state: toPrismaJson(state) },
  });
  if (updated.count !== 1) {
    throw new ChatRequestError(409, 'Der Tisch wurde gerade aktualisiert. Bitte sende die Nachricht erneut.');
  }
}
