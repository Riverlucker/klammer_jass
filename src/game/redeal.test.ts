import { InitializeGame } from 'boardgame.io/internal';
import { describe, expect, it } from 'vitest';
import { acknowledgeDecision, armDecisionTimer, DISPLAY_ACK_GRACE_MS } from './decisionTimer';
import { JassGame } from './logic';
import { RedealDisplay, REDEAL_DISPLAY_MILLISECONDS } from './redeal';
import { isRedealBeingDisplayed, reduceGameMove } from './serverEngine';
import type { PlayerID, ServerGameState } from './types';

function redealtState() {
  let state = InitializeGame({ game: JassGame, numPlayers: 2 }) as ServerGameState;
  for (const playerID of ['0', '1'] as const) {
    state = reduceGameMove(state, { move: 'setReady', playerID, args: [] }).state!;
  }
  for (let pass = 0; pass < 4; pass++) {
    state = reduceGameMove(state, { move: 'decline', playerID: state.ctx.currentPlayer as PlayerID, args: [] }).state!;
  }
  return armDecisionTimer(state, state.G.redealStartedAt!);
}

describe('Sichtbares Neugeben', () => {
  it('reserviert 3,5 Sekunden fürs Austeilen und startet danach die volle Zugfrist', () => {
    const state = redealtState();
    const start = state.G.redealStartedAt!;
    expect(state.ctx.phase).toBe('trumpSelection');
    expect(state.G.redealCount).toBe(1);
    expect(state.G.hands['0']).toHaveLength(6);
    expect(state.G.hands['1']).toHaveLength(6);
    expect(state.G.redealUntil).toBe(start + REDEAL_DISPLAY_MILLISECONDS);
    expect(state.G.deadlineAt).toBe(start + REDEAL_DISPLAY_MILLISECONDS + 10_000 + DISPLAY_ACK_GRACE_MS);
    const { id, waitingFor: [player] } = state.G.decisionTimer!;
    expect(isRedealBeingDisplayed(state, start + 3_499)).toBe(true);
    expect(acknowledgeDecision(state, player, id, start + 3_499)).toBe(state);
    expect(isRedealBeingDisplayed(state, start + 3_500)).toBe(false);
    const acknowledged = acknowledgeDecision(state, player, id, start + 8_000);
    expect(acknowledged.G.deadlineAt).toBe(start + 18_000);
  });

  it('zeigt auch verspätete Updates vollständig, ohne durch Polling neu zu starten', () => {
    const state = redealtState();
    const display = new RedealDisplay();
    const serverNow = state.G.redealUntil! + 2_000;
    const first = display.receive(state.G, state.ctx.phase, 500, serverNow);
    expect(first).toEqual({ startedAt: 500, until: 4_000 });
    expect(display.receive(state.G, state.ctx.phase, 2_000, serverNow + 1_500)).toBe(first);
    state.G.redealCount += 1;
    expect(display.receive(state.G, state.ctx.phase, 5_000, serverNow + 4_500)).toEqual({ startedAt: 5_000, until: 8_500 });
  });

  it('wiederholt beim Reload keine bereits abgeschlossene Austeilung', () => {
    const state = redealtState();
    state.G.decisionTimer!.started = true;
    expect(new RedealDisplay().receive(state.G, state.ctx.phase, 100, state.G.redealUntil! + 1)).toBeNull();
    expect(new RedealDisplay().receive(state.G, 'playing', 100, state.G.redealStartedAt!)).toBeNull();
    delete state.G.redealStartedAt;
    delete state.G.redealUntil;
    expect(new RedealDisplay().receive(state.G, state.ctx.phase, 100, 0)).toBeNull();
  });
});
