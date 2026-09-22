import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { isServerGameState } from '@/game/playerView';
import type { PlayerID } from '@/game/types';
import { createPlayerToken, setMatchCookie } from '@/lib/auth';
import { joinMatchSchema } from '@/lib/apiSchemas';
import { databaseErrorResponse } from '@/lib/databaseErrors';
import { authenticatePlayer, PlayerLoginError } from '@/lib/playerAccounts';

const idSchema = z.string().uuid();

class SeatClaimError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/matches/[id]/join'>,
) {
  try {
    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Ungültige Match-ID.' }, { status: 400 });
    }
    const parsed = joinMatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Bitte gib einen Spielernamen und ein gültiges optionales Passwort ein.' },
        { status: 400 },
      );
    }

    const { token, tokenHash } = createPlayerToken();
    const playerId = await prisma.$transaction(async (transaction) => {
      const gameRecord = await transaction.game.findUnique({
        where: { id },
        include: { match: true },
      });
      if (!gameRecord?.match) throw new SeatClaimError(404, 'Match nicht gefunden.');
      if (!isServerGameState(gameRecord.state)) {
        throw new SeatClaimError(409, 'Dieses Match verwendet einen nicht mehr unterstützten Spielstand.');
      }

      const player = await authenticatePlayer(
        transaction,
        parsed.data.playerName,
        parsed.data.password,
      );

      let seat: PlayerID;
      if (gameRecord.match.player1Id === player.id) {
        seat = '0';
        await transaction.match.update({
          where: { id },
          data: { player1TokenHash: tokenHash },
        });
      } else if (gameRecord.match.player2Id === player.id) {
        seat = '1';
        await transaction.match.update({
          where: { id },
          data: { player2TokenHash: tokenHash },
        });
      } else {
        if (gameRecord.match.player2Id) {
          throw new SeatClaimError(409, 'Dieses Match ist bereits vollständig.');
        }
        const claimed = await transaction.match.updateMany({
          where: { id, player2Id: null },
          data: { player2Id: player.id, player2TokenHash: tokenHash },
        });
        if (claimed.count !== 1) {
          throw new SeatClaimError(409, 'Der zweite Platz wurde gerade vergeben.');
        }
        seat = '1';
      }

      const nextState = structuredClone(gameRecord.state);
      nextState.G.playerNames[seat] = player.name;
      await transaction.game.update({
        where: { id },
        data: { state: toPrismaJson(nextState) },
      });
      return seat;
    });

    const response = NextResponse.json({ success: true, matchId: id, playerId });
    setMatchCookie(response, id, token);
    return response;
  } catch (error: unknown) {
    if (error instanceof PlayerLoginError || error instanceof SeatClaimError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Beitritt fehlgeschlagen:', error);
    const response = databaseErrorResponse(error, 'Beitritt fehlgeschlagen.');
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
