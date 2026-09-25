import type { JassState, Trick } from './types';

export const TRICK_DISPLAY_MILLISECONDS = 4_000;
export const TRICK_COLLECTION_MILLISECONDS = 700;

export function isTrickCelebrating(remainingMilliseconds: number): boolean {
  return remainingMilliseconds <= TRICK_DISPLAY_MILLISECONDS - 1000
    && remainingMilliseconds > TRICK_COLLECTION_MILLISECONDS + 1000;
}

export interface TrickPresentation {
  trick: Trick;
  inspecting: boolean;
  until: number;
}

type DisplayState = Pick<JassState, 'gameNumber' | 'handNumber' | 'pastTricks' | 'trickDisplayUntil' | 'inspectingLastTrick'>;

// Each browser grants a full viewing interval on receipt, using its monotonic animation clock.
export class TrickDisplay {
  private hand = '';
  private count = 0;
  private inspection: number | null = null;
  private presentation: TrickPresentation | null = null;

  receive(G: DisplayState, now: number): TrickPresentation | null {
    const hand = `${G.gameNumber}:${G.handNumber}`;
    if (hand !== this.hand) {
      this.hand = hand;
      this.count = 0;
      this.inspection = null;
      this.presentation = null;
    }
    const last = G.pastTricks.at(-1);
    if (!last) return this.presentation;
    const newlyCompleted = G.pastTricks.length > this.count;
    const newlyInspected = Boolean(G.inspectingLastTrick && G.trickDisplayUntil !== null
      && G.trickDisplayUntil !== this.inspection);
    this.count = G.pastTricks.length;
    if (newlyInspected) this.inspection = G.trickDisplayUntil;
    if (newlyCompleted || newlyInspected) {
      this.presentation = {
        trick: last,
        inspecting: newlyInspected,
        until: now + TRICK_DISPLAY_MILLISECONDS,
      };
    }
    // Later polls or the next lead card must neither restart nor truncate this presentation.
    return this.presentation;
  }
}
