import { NextResponse } from 'next/server';
import { prisma } from '@/db';
import { Client } from 'boardgame.io/client';
import { JassGame } from '@/game/logic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetScore, schneiderRule, cubeEnabled } = body;

    // 1. Create a dummy client just to get the initial state from setup()
    // boardgame.io creates the initial state internally when a client starts
    const client = Client({ game: JassGame, numPlayers: 2 });
    client.start();
    const initialState = client.store.getState();
    client.stop();

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

  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
