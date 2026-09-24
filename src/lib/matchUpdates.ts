import { after } from 'next/server';
import { pusherServer } from './pusher';

export function notifyMatchUpdate(matchId: string, stateID: number): void {
  if (!pusherServer) return;
  // Start publishing immediately, but let the player's HTTP response return independently.
  // after keeps the in-flight notification alive on serverless hosts after the response ends.
  const notification = pusherServer.trigger(`match-${matchId}`, 'state-update', { stateID })
    .catch((error: unknown) => { console.error('Echtzeit-Benachrichtigung fehlgeschlagen:', error); });
  after(() => notification);
}

export function matchResponseHeaders(startedAt: number) {
  return {
    'Server-Timing': `app;dur=${(performance.now() - startedAt).toFixed(1)}`,
    'X-Jass-Region': process.env.VERCEL_REGION ?? 'local',
    'Cache-Control': 'private, no-store',
  };
}
