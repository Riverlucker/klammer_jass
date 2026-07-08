import { NextResponse } from 'next/server';
import { prisma } from '@/db';
import { InitializeGame } from 'boardgame.io/internal';
import { JassGame } from '@/game/logic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetScore, schneiderRule, cubeEnabled } = body;

    // 1. Create initial state
    const initialState = InitializeGame({ game: JassGame, numPlayers: 2 });

    // 2. Save match metadata
    const match = await prisma.match.create({
      data: {
        targetScore: parseInt(targetScore) || 301,
        schneiderRule: schneiderRule || 'yes',
        cubeEnabled: cubeEnabled === 'enabled',
        status: 'waiting',
      },
    });

    // 3. Save initial game state
    await prisma.game.create({
      data: {
        id: match.id, // We use the same ID for simplicity
        matchId: match.id,
        state: initialState as any,
      }
    });

    return NextResponse.json({ success: true, matchId: match.id });

  } catch (error: any) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: error.message || 'Internal server error', stack: error.stack }, { status: 500 });
  }
}
