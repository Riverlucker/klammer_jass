export const EXTRA_CARD_COUNT = 3;
export const EXTRA_CARD_FIRST_FLIP_AT_MILLISECONDS = 600;
export const EXTRA_CARD_FLIP_STEP_MILLISECONDS = 850;
export const EXTRA_CARD_INSERT_AT_MILLISECONDS = 3_200;
export const EXTRA_DEAL_DISPLAY_MILLISECONDS = 4_000;

export type ExtraCardPhase = 'back' | 'turning' | 'inserted';

export function extraCardPhase(index: number, elapsedMilliseconds: number): ExtraCardPhase {
  if (elapsedMilliseconds >= EXTRA_CARD_INSERT_AT_MILLISECONDS) return 'inserted';
  const flipAt = EXTRA_CARD_FIRST_FLIP_AT_MILLISECONDS + index * EXTRA_CARD_FLIP_STEP_MILLISECONDS;
  return elapsedMilliseconds < flipAt ? 'back' : 'turning';
}

export function activeExtraCardIndex(elapsedMilliseconds: number): number {
  if (elapsedMilliseconds < EXTRA_CARD_FIRST_FLIP_AT_MILLISECONDS) return 0;
  return Math.min(EXTRA_CARD_COUNT - 1, Math.floor(
    (elapsedMilliseconds - EXTRA_CARD_FIRST_FLIP_AT_MILLISECONDS) / EXTRA_CARD_FLIP_STEP_MILLISECONDS,
  ));
}
