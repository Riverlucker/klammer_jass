import { NextResponse } from 'next/server';
import { prisma } from '@/db';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const gameRecord = await prisma.game.findUnique({
      where: { id },
    });

    if (!gameRecord) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, state: gameRecord.state });

  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
