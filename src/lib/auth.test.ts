import { describe, expect, it } from 'vitest';
import {
  createPasswordHash,
  createPlayerToken,
  normalizePlayerName,
  resolvePlayerID,
  verifyPassword,
} from './auth';

describe('Match-Zugänge', () => {
  it('ordnet nur das passende Token einem Sitz zu', () => {
    const player0 = createPlayerToken();
    const player1 = createPlayerToken();
    const access = {
      player1TokenHash: player0.tokenHash,
      player2TokenHash: player1.tokenHash,
    };
    expect(resolvePlayerID(access, player0.token)).toBe('0');
    expect(resolvePlayerID(access, player1.token)).toBe('1');
    expect(resolvePlayerID(access, 'falsches-token')).toBeNull();
    expect(resolvePlayerID(access, undefined)).toBeNull();
  });

  it('normalisiert Namen für einen eindeutigen Vergleich', () => {
    expect(normalizePlayerName('  Anna   Müller ')).toEqual({
      name: 'Anna Müller',
      normalizedName: 'anna müller',
    });
  });

  it('speichert Passwörter nur als gesalzenen Hash', () => {
    const first = createPasswordHash('geheim');
    const second = createPasswordHash('geheim');

    expect(first).not.toBe(second);
    expect(first).not.toContain('geheim');
    expect(verifyPassword('geheim', first)).toBe(true);
    expect(verifyPassword('falsch', first)).toBe(false);
  });
});
