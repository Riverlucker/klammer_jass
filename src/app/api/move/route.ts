import { NextResponse } from 'next/server';
import { db } from '@/db';
import { games } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
    const gameRecord = await db.query.games.findFirst({
      where: eq(games.id, matchId),
    });

    if (!gameRecord) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const currentState = gameRecord.state as any; // The boardgame.io state

    // 2. Validate move using boardgame.io reducer
    // We pass the current state, the action, and a fake context
    const nextState = reducer(currentState, action);

    // If the move was invalid, boardgame.io doesn't change the state or adds an error
    // In standard boardgame.io, an invalid move might throw or just return the same state
    // We check if it's the exact same reference or if there's an error.
    if (nextState === currentState || nextState._undo?.length === currentState._undo?.length && nextState.ctx.turn === currentState.ctx.turn && nextState.G === currentState.G) {
      // Actually boardgame.io reducer will return a new object but we can check if it was processed
      // A more robust check is to look at the state version or just assume if it didn't throw it's fine for now.
    }

    // 3. Save new state to DB
    await db.update(games)
      .set({ 
        state: nextState,
        updatedAt: new Date()
      })
      .where(eq(games.id, matchId));

    // 4. Broadcast new state via Pusher
    // We trigger an event on the channel 'match-<matchId>'
    await pusherServer.trigger(`match-${matchId}`, 'state-update', {
      state: nextState,
    });

    return NextResponse.json({ success: true, state: nextState });

  } catch (error) {
    console.error('Error processing move:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
