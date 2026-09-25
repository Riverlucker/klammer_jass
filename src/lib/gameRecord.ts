import type { Prisma } from '@prisma/client';
import { toPrismaJson } from '@/db/json';
import { armDecisionTimer } from '@/game/decisionTimer';
import { isServerGameState } from '@/game/playerView';
import { reduceGameMove } from '@/game/serverEngine';
import { isPlayerID } from '@/game/types';
import { resolvePlayerID } from './auth';

// Older deployments may have left a table waiting for the other player's seven.
// Migrate that phase once, preserving cards, scores and optimistic write protection.
export async function loadGameRecord(database: Pick<Prisma.TransactionClient, 'game'>, id: string, token: string | undefined) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = await database.game.findUnique({ where: { id }, include: { match: true } });
    if (record && isServerGameState(record.state) && record.state.G.matchStartedAt === undefined && record.match?.createdAt) {
      record.state.G.matchStartedAt = record.match.createdAt.getTime();
    }
    if (!record || !isServerGameState(record.state) || record.state.ctx.phase !== 'trumpExchange') return record;
    if (!record.match || !resolvePlayerID(record.match, token)) return record;
    const playerID = record.state.ctx.currentPlayer;
    if (!isPlayerID(playerID)) throw new Error('Ungültiger Spieler in alter Räuber-Phase.');
    const migrated = reduceGameMove(record.state, { move: 'startPlaying', args: [], playerID });
    if (!migrated.state) throw new Error('Alte Räuber-Phase konnte nicht fortgesetzt werden.');
    await database.game.updateMany({
      where: { id, updatedAt: record.updatedAt },
      data: { state: toPrismaJson(armDecisionTimer(migrated.state)) },
    });
    // Re-read after either our write or a concurrent move to obtain the current updatedAt value.
  }
  throw new Error('Der Spielstand wurde gleichzeitig geändert. Bitte erneut laden.');
}
