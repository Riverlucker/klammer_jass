import { describe, expect, it } from 'vitest';
import { initialGameScores, settlePlayedHand } from './scoring';
import type { MatchSettings } from './types';

const details = (tricks0: number, tricks1: number) => ({
  '0': { tricks: tricks0, trickCount: tricks0 > 0 ? 1 : 0, melds: 0, terz: 0, fifty: 0, bella: 0, jass: 0, mi: 0, lastTrick: 0 },
  '1': { tricks: tricks1, trickCount: tricks1 > 0 ? 1 : 0, melds: 0, terz: 0, fifty: 0, bella: 0, jass: 0, mi: 0, lastTrick: 0 },
});

const settings = (overrides: Partial<MatchSettings> = {}): MatchSettings => ({
  targetScore: 301,
  stake: 1,
  handicap: 0,
  schneiderRule: 'yes',
  cubeEnabled: true,
  moveTimeSeconds: 10,
  cubeTimeSeconds: 30,
  ...overrides,
});

function settle(overrides: Partial<Parameters<typeof settlePlayedHand>[0]> = {}) {
  return settlePlayedHand({
    handScores: { '0': 90, '1': 70 },
    scoreDetails: details(90, 70),
    currentScores: { '0': 0, '1': 0 },
    currentMatchPoints: { '0': 0, '1': 0 },
    declarer: '0',
    dealer: '1',
    cubeValue: 1,
    settings: settings(),
    ...overrides,
  });
}

describe('Hand-, Spiel- und Matchwertung', () => {
  it('wertet Falte, wenn der Trumpfmacher nicht mehr Augen hat', () => {
    const result = settle({ handScores: { '0': 80, '1': 80 } });

    expect(result.handResult.declarerFailed).toBe(true);
    expect(result.handResult.winner).toBe('1');
    expect(result.handResult.awardedScores).toEqual({ '0': 0, '1': 160 });
  });

  it('vergibt Würfel- und Einsatzpunkte erst am Ende eines Zielpunktspiels', () => {
    const result = settle({
      handScores: { '0': 70, '1': 20 },
      currentScores: { '0': 240, '1': 200 },
      currentMatchPoints: { '0': 3, '1': 4 },
      cubeValue: 2,
      settings: settings({ stake: 3, schneiderRule: 'no' }),
    });

    expect(result.nextScores).toEqual({ '0': 310, '1': 220 });
    expect(result.gameResult?.winner).toBe('0');
    expect(result.gameResult?.awardedMatchPoints).toEqual({ '0': 6, '1': 0 });
    expect(result.nextMatchPoints).toEqual({ '0': 9, '1': 4 });
  });

  it('wendet Schneider Ja auch beim Würfelwert 1 an', () => {
    const result = settle({
      handScores: { '0': 20, '1': 10 },
      currentScores: { '0': 290, '1': 100 },
      settings: settings({ stake: 2, schneiderRule: 'yes' }),
    });

    expect(result.gameResult?.schneider).toBe(true);
    expect(result.gameResult?.awardedMatchPoints['0']).toBe(4);
  });

  it('wendet Schneider bedingt erst nach dem Drehen an', () => {
    const common = {
      handScores: { '0': 20, '1': 10 },
      currentScores: { '0': 290, '1': 100 },
      settings: settings({ schneiderRule: 'only_if_doubled' }),
    };

    expect(settle({ ...common, cubeValue: 1 }).gameResult?.schneider).toBe(false);
    const doubled = settle({ ...common, cubeValue: 2 });
    expect(doubled.gameResult?.schneider).toBe(true);
    expect(doubled.gameResult?.awardedMatchPoints['0']).toBe(4);
  });

  it('bildet einen Gleichstand am Ziel als Unentschieden ohne Matchpunkte ab', () => {
    const result = settle({
      handScores: { '0': 20, '1': 10 },
      currentScores: { '0': 290, '1': 300 },
      declarer: '0',
    });

    expect(result.gameResult?.winner).toBeNull();
    expect(result.gameResult?.awardedMatchPoints).toEqual({ '0': 0, '1': 0 });
  });

  it('gibt positiven Vorsprung dem Gast und negativen dem Host', () => {
    expect(initialGameScores(10)).toEqual({ '0': 0, '1': 10 });
    expect(initialGameScores(-20)).toEqual({ '0': 20, '1': 0 });
  });
});
