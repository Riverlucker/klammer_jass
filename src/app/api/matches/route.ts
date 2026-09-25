import { InitializeGame } from 'boardgame.io/internal';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/db';
import { toPrismaJson } from '@/db/json';
import { JassGame } from '@/game/logic';
import { createPlayerToken, normalizePlayerName, setMatchCookie } from '@/lib/auth';
import { createMatchSchema } from '@/lib/apiSchemas';
import { databaseErrorResponse } from '@/lib/databaseErrors';
import { authenticatePlayer, PlayerLoginError } from '@/lib/playerAccounts';

export async function POST(request: NextRequest) {
  try {
    const parsed = createMatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Match-Einstellungen.' }, { status: 400 });
    }

    const { playerName, password, avatar, ...settings } = parsed.data;
    const displayName = normalizePlayerName(playerName).name;
    const { token, tokenHash } = createPlayerToken();
    const initialState = structuredClone(InitializeGame({
      game: JassGame,
      numPlayers: 2,
      setupData: { ...settings, playerNames: { '0': displayName, '1': null }, playerAvatars: { '0': avatar ?? null } },
    }));
    initialState.G.matchStartedAt = Date.now();

    const match = await prisma.$transaction(async (transaction) => {
      const player = await authenticatePlayer(transaction, playerName, password);
      const createdMatch = await transaction.match.create({
        data: {
          targetScore: settings.targetScore,
          schneiderRule: settings.schneiderRule,
          cubeEnabled: settings.cubeEnabled,
          bet: settings.stake,
          player1Id: player.id,
          player1TokenHash: tokenHash,
          status: 'waiting',
        },
      });
      await transaction.game.create({
        data: {
          id: createdMatch.id,
          matchId: createdMatch.id,
          state: toPrismaJson(initialState),
        },
      });
      return createdMatch;
    });

    const response = NextResponse.json({ success: true, matchId: match.id, playerId: '0' });
    setMatchCookie(response, match.id, token);
    return response;
  } catch (error: unknown) {
    if (error instanceof PlayerLoginError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Match konnte nicht erstellt werden:', error);
    const response = databaseErrorResponse(error, 'Match konnte nicht erstellt werden.');
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
