import { NextResponse } from 'next/server';
import { prisma } from '@/db';
import { pusherServer } from '@/lib/pusher';
import { CreateGameReducer } from 'boardgame.io/core';
import { JassGame } from '@/game/logic';

// Create the boardgame.io reducer for our game
const reducer = CreateGameReducer({ game: JassGame });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { matchId, action, state, playerID, credentials } = body;

    if (!matchId || !action || !state) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch current game state from DB to ensure validity
    const gameRecord = await prisma.game.findUnique({
      where: { id: matchId },
    });

    if (!gameRecord) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const currentState = gameRecord.state as any; // The boardgame.io state

    // 2. Validate move using boardgame.io reducer
    const nextState = reducer(currentState, action);

    // 3. Save new state to DB
    await prisma.game.update({
      where: { id: matchId },
      data: {
        state: nextState as any,
      },
    });

    // 4. Broadcast new state via Pusher
    await pusherServer.trigger(`match-${matchId}`, 'state-update', {
      state: nextState,
    });

    return NextResponse.json({ success: true, state: nextState });

  } catch (error) {
    console.error('Error processing move:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
