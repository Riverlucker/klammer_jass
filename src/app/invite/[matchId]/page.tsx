import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/db';
import { isServerGameState } from '@/game/playerView';
import InviteForm from './invite-form';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  let invitation: { host: string; settings: import('@/game/types').MatchSettings; full: boolean } | null = null;
  let error = 'Diese Einladung ist ungültig oder das Match ist bereits beendet.';
  if (z.string().uuid().safeParse(matchId).success) {
    try {
      const game = await prisma.game.findUnique({ where: { id: matchId }, include: { match: true } });
      if (game?.match && isServerGameState(game.state) && !game.state.G.matchResult && game.state.ctx.gameover === undefined) {
        invitation = {
          host: game.state.G.playerNames['0'] ?? 'Gastgeber',
          settings: game.state.G.settings,
          full: Boolean(game.match.player2Id),
        };
      }
    } catch {
      error = 'Die Einladung konnte gerade nicht geladen werden. Bitte lade die Seite erneut.';
    }
  }
  return <main style={{ maxWidth: 620, margin: '60px auto', padding: '0 20px' }}>
    {invitation ? <InviteForm matchId={matchId} {...invitation} /> : <section className="panel">
      <h1>Einladung nicht verfügbar</h1><p role="alert">{error}</p>
      <Link className="button" href="/">Zurück zur Lobby</Link>
    </section>}
  </main>;
}
