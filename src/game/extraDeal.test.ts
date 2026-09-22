import { describe, expect, it } from 'vitest';
import {
  EXTRA_DEAL_DISPLAY_MILLISECONDS,
  activeExtraCardIndex,
  extraCardPhase,
} from './extraDeal';

describe('gestaffelte Zusatzkarten', () => {
  it('legt alle Karten verdeckt ab und deckt sie anschließend einzeln auf', () => {
    expect(extraCardPhase(0, 0)).toBe('back');
    expect(extraCardPhase(1, 0)).toBe('back');
    expect(extraCardPhase(2, 0)).toBe('back');
    expect(extraCardPhase(0, 600)).toBe('turning');
    expect(extraCardPhase(1, 1_449)).toBe('back');
    expect(extraCardPhase(1, 1_450)).toBe('turning');
    expect(extraCardPhase(2, 2_300)).toBe('turning');
    expect(activeExtraCardIndex(599)).toBe(0);
    expect(activeExtraCardIndex(1_450)).toBe(1);
    expect(activeExtraCardIndex(2_300)).toBe(2);
  });

  it('sortiert alle drei Karten gleichzeitig ein', () => {
    expect(extraCardPhase(0, 3_199)).toBe('turning');
    expect(extraCardPhase(1, 3_199)).toBe('turning');
    expect(extraCardPhase(2, 3_199)).toBe('turning');
    expect(extraCardPhase(0, 3_200)).toBe('inserted');
    expect(extraCardPhase(1, 3_200)).toBe('inserted');
    expect(extraCardPhase(2, 3_200)).toBe('inserted');
    expect(EXTRA_DEAL_DISPLAY_MILLISECONDS).toBe(4_000);
  });
});
