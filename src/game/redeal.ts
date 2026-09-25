import type { JassState } from './types';

export const REDEAL_DISPLAY_MILLISECONDS = 3_500;
export const REDEAL_REVEAL_AT_MILLISECONDS = 2_700;

export interface RedealPresentation {
  startedAt: number;
  until: number;
}

type RedealState = Pick<JassState, 'gameNumber' | 'handNumber' | 'redealCount' | 'redealStartedAt' | 'redealUntil' | 'decisionTimer'>;

// Local elapsed time gives a delayed update the full animation; polling must not restart it.
export class RedealDisplay {
  private key = '';
  private presentation: RedealPresentation | null = null;

  receive(G: RedealState, phase: string | null, receivedAt: number, serverNow: number): RedealPresentation | null {
    const key = `${G.gameNumber}:${G.handNumber}:${G.redealCount}`;
    if (key !== this.key) {
      this.key = key;
      const pending = G.redealStartedAt != null && (
        (G.redealUntil ?? 0) > serverNow || G.decisionTimer?.started === false
      );
      this.presentation = phase === 'trumpSelection' && pending
        ? { startedAt: receivedAt, until: receivedAt + REDEAL_DISPLAY_MILLISECONDS }
        : null;
    }
    if (phase !== 'trumpSelection') this.presentation = null;
    return this.presentation;
  }
}
