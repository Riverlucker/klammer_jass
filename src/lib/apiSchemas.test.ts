import { describe, expect, it } from 'vitest';
import { createMatchSchema, joinMatchSchema, parseChatRequest, parseMoveRequest } from './apiSchemas';

const matchId = '230e9890-c224-4e3d-89ca-3dddae284c31';

describe('parseMoveRequest', () => {
  it('rejects reducer actions that are not public game moves', () => {
    const result = parseMoveRequest({ matchId, move: 'RESET', args: [], stateID: 0 });

    expect(result.success).toBe(false);
  });

  it('checks card and meld arguments for playCard', () => {
    const valid = parseMoveRequest({
      matchId,
      move: 'playCard',
      args: [{ suit: 'Hearts', rank: 'A' }, ['Bella']],
      stateID: 4,
    });
    const invalid = parseMoveRequest({
      matchId,
      move: 'playCard',
      args: [{ suit: 'stars', rank: 'A' }],
      stateID: 4,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('accepts only approved humorous replies for an accepted meld', () => {
    expect(parseMoveRequest({
      matchId,
      move: 'respondMeld',
      args: ['good', 'Du Glückspilz'],
      stateID: 4,
    }).success).toBe(true);
    expect(parseMoveRequest({
      matchId,
      move: 'respondMeld',
      args: ['good', 'Eigener Text'],
      stateID: 4,
    }).success).toBe(false);
    expect(parseMoveRequest({
      matchId,
      move: 'respondMeld',
      args: ['notGood'],
      stateID: 4,
    }).success).toBe(true);
  });
});

describe('createMatchSchema', () => {
  it('erlaubt genau die 16 Avatare oder den Standard beim Erstellen und Beitreten', () => {
    const identity = { playerName: 'Anna', password: '' };
    const settings = { targetScore: 301, stake: 1, handicap: 0, schneiderRule: 'yes', cubeEnabled: true, moveTimeSeconds: 10, cubeTimeSeconds: 30 };
    for (const avatar of [undefined, null, ...Array.from({ length: 16 }, (_, index) => index)]) {
      expect(createMatchSchema.safeParse({ ...settings, ...identity, avatar }).success).toBe(true);
      expect(joinMatchSchema.safeParse({ ...identity, avatar }).success).toBe(true);
    }
    for (const avatar of [-1, 16, 1.5, '1']) {
      expect(createMatchSchema.safeParse({ ...settings, ...identity, avatar }).success).toBe(false);
      expect(joinMatchSchema.safeParse({ ...identity, avatar }).success).toBe(false);
    }
  });
  it('accepts all PDF match settings in their configured intervals', () => {
    const parsed = createMatchSchema.safeParse({
      targetScore: '701',
      playerName: 'Chris',
      password: 'jass',
      stake: '3',
      handicap: '-20',
      schneiderRule: 'only_if_doubled',
      cubeEnabled: 'enabled',
      moveTimeSeconds: '25',
      cubeTimeSeconds: '75',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ targetScore: 701, stake: 3, handicap: -20 });
    }
  });

  it('rejects times outside the PDF intervals', () => {
    const parsed = createMatchSchema.safeParse({
      targetScore: 301,
      playerName: 'Gast',
      password: '',
      stake: 1,
      handicap: 0,
      schneiderRule: 'yes',
      cubeEnabled: true,
      moveTimeSeconds: 12,
      cubeTimeSeconds: 31,
    });

    expect(parsed.success).toBe(false);
  });

  it('verlangt einen Spielernamen und erlaubt ein leeres Passwort', () => {
    const base = {
      targetScore: 301,
      stake: 1,
      handicap: 0,
      schneiderRule: 'yes',
      cubeEnabled: true,
      moveTimeSeconds: 10,
      cubeTimeSeconds: 30,
    };

    expect(createMatchSchema.safeParse({ ...base, playerName: '  Anna  ', password: '' }).success).toBe(true);
    expect(createMatchSchema.safeParse({ ...base, playerName: ' ', password: '' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, playerName: 'Anna', password: 'abc' }).success).toBe(false);
  });
});

describe('parseChatRequest', () => {
  it('trimmt gültige Nachrichten und begrenzt sie auf 280 Zeichen', () => {
    const valid = parseChatRequest({ matchId, message: '  Servus!  ' });
    const empty = parseChatRequest({ matchId, message: '   ' });
    const tooLong = parseChatRequest({ matchId, message: 'x'.repeat(281) });

    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.message).toBe('Servus!');
    expect(empty.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });
});
