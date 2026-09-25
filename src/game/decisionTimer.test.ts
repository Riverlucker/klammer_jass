import { InitializeGame } from 'boardgame.io/internal';
import { describe, expect, it } from 'vitest';
import { acknowledgeDecision, armDecisionTimer, DISPLAY_ACK_GRACE_MS } from './decisionTimer';
import { JassGame } from './logic';
import { isDeadlineExpired, reduceGameMove, timeoutAction } from './serverEngine';
import { otherPlayer, type PlayerID, type ServerGameState } from './types';

function readyState() {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  for (const playerID of ['0', '1'] as PlayerID[]) {
    state = reduceGameMove(state, { move: 'setReady', args: [], playerID }).state!;
  }
  return armDecisionTimer(state, 1_000);
}

describe('Anzeigeabhängige Online-Zugfrist', () => {
  it('gibt nach fünf Sekunden Übertragung die vollen zehn Sekunden', () => {
    const pending = readyState();
    const timer = pending.G.decisionTimer!;
    const started = acknowledgeDecision(pending, timer.waitingFor[0], timer.id, 6_000);
    expect(started.G.deadlineAt).toBe(16_000);
    expect(started.G.decisionTimer?.started).toBe(true);
    expect(started._stateID).toBe(pending._stateID + 1);
    expect(isDeadlineExpired(started, 15_999)).toBe(false);
    expect(isDeadlineExpired(started, 16_000)).toBe(true);
  });

  it('ignoriert Gegner, alte Bestätigungen und doppelte Bestätigungen nach Reload', () => {
    const pending = readyState();
    const { id, waitingFor: [player] } = pending.G.decisionTimer!;
    expect(acknowledgeDecision(pending, otherPlayer(player), id, 6_000)).toBe(pending);
    expect(acknowledgeDecision(pending, player, id - 1, 6_000)).toBe(pending);
    const started = acknowledgeDecision(pending, player, id, 6_000);
    expect(acknowledgeDecision(started, player, id, 9_000)).toBe(started);
    expect(started.G.deadlineAt).toBe(16_000);
  });

  it.each(['trickDisplayUntil', 'extraDealUntil', 'redealUntil'] as const)('startet erst nach %s', (field) => {
    const pending = readyState();
    pending.G[field] = 7_000;
    const { id, waitingFor: [player] } = pending.G.decisionTimer!;
    expect(acknowledgeDecision(pending, player, id, 6_999)).toBe(pending);
    expect(acknowledgeDecision(pending, player, id, 7_000).G.deadlineAt).toBe(17_000);
  });

  it('führt auch ohne Anzeigebestätigung nach begrenzter Wartezeit den Standardzug aus', () => {
    const pending = readyState();
    expect(pending.G.deadlineAt).toBe(11_000 + DISPLAY_ACK_GRACE_MS);
    expect(isDeadlineExpired(pending, pending.G.deadlineAt!)).toBe(true);
    const { id, waitingFor: [player] } = pending.G.decisionTimer!;
    expect(acknowledgeDecision(pending, player, id, pending.G.deadlineAt!)).toBe(pending);
    const action = timeoutAction(pending)!;
    expect(action.move).toBe('decline');
    const next = armDecisionTimer(reduceGameMove(pending, action).state!, 30_000);
    expect(next.G.decisionTimer?.id).not.toBe(id);
    expect(next.G.decisionTimer?.waitingFor).toEqual([otherPlayer(player)]);
  });

  it('verwendet für Dreher die konfigurierte Würfelzeit und den Empfänger', () => {
    const pending = readyState();
    const player = pending.ctx.currentPlayer as PlayerID;
    const offered = reduceGameMove(pending, { move: 'doubleCube', args: [], playerID: player }).state!;
    const armed = armDecisionTimer(offered, 1_000);
    expect(armed.G.decisionTimer?.waitingFor).toEqual([otherPlayer(player)]);
    expect(acknowledgeDecision(armed, otherPlayer(player), armed.G.decisionTimer!.id, 6_000).G.deadlineAt).toBe(36_000);
  });

  it('lässt am Handende nur noch nicht bereite Spieler die Uhr starten', () => {
    const state = readyState();
    state.ctx.phase = 'endOfHand';
    state.G.readyPlayers = ['0'];
    const armed = armDecisionTimer(state, 1_000);
    expect(armed.G.decisionTimer?.waitingFor).toEqual(['1']);
  });

  it('setzt bei pausiertem Match keine neue Uhr', () => {
    const state = readyState();
    state.G.matchPaused = true;
    const paused = armDecisionTimer(state);
    expect(paused.G.deadlineAt).toBeNull();
    expect(paused.G.decisionTimer).toBeNull();
  });
});
