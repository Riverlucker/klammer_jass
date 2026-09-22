import { describe, expect, it } from 'vitest';
import type { Card } from './constants';
import { TRUMP_VALUES } from './constants';
import {
  compareSequenceMelds,
  findBella,
  findSequenceMeld,
  getAllSequenceMelds,
  isCardHigherInTrick,
  isMoveLegal,
} from './validation';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('Stichregeln', () => {
  it('zählt den Trumpf-Buben als 20 Jass- plus 2 Bubenpunkte', () => {
    expect(TRUMP_VALUES.J).toBe(22);
  });

  it('verwendet die besondere Trumpfreihenfolge', () => {
    expect(isCardHigherInTrick(card('Hearts', 'J'), card('Hearts', 'A'), 'Hearts')).toBe(true);
    expect(isCardHigherInTrick(card('Hearts', '9'), card('Hearts', 'A'), 'Hearts')).toBe(true);
  });

  it('erzwingt Farbe und Übertrumpfen', () => {
    const hand = [card('Spades', '7'), card('Hearts', 'J'), card('Hearts', '8')];
    expect(isMoveLegal(card('Spades', '7'), hand, [card('Spades', 'A')], 'Spades', 'Hearts')).toBe(true);
    expect(isMoveLegal(card('Hearts', '8'), hand, [card('Spades', 'A')], 'Spades', 'Hearts')).toBe(false);

    const trumpOnly = [card('Hearts', 'J'), card('Hearts', '8')];
    expect(isMoveLegal(card('Hearts', '8'), trumpOnly, [card('Clubs', 'A'), card('Hearts', '9')], 'Clubs', 'Hearts')).toBe(false);
    expect(isMoveLegal(card('Hearts', 'J'), trumpOnly, [card('Clubs', 'A'), card('Hearts', '9')], 'Clubs', 'Hearts')).toBe(true);
  });
});

describe('Meldungen', () => {
  it('erkennt Terz, Fünfzig und Bella nur aus vorhandenen Karten', () => {
    const hand = [
      card('Spades', '9'), card('Spades', '10'), card('Spades', 'J'),
      card('Clubs', '9'), card('Clubs', '10'), card('Clubs', 'J'), card('Clubs', 'Q'),
      card('Hearts', 'K'), card('Hearts', 'Q'),
    ];
    expect(findSequenceMeld(hand, 'Terz', 'Hearts', '0')?.highestCard).toEqual(card('Spades', 'J'));
    expect(findSequenceMeld(hand, 'Fünfzig', 'Hearts', '0')?.points).toBe(50);
    expect(findBella(hand, 'Hearts', '0')?.cards).toHaveLength(2);
    expect(findBella(hand, 'Clubs', '0')).toBeNull();
  });

  it('wertet Fünfzig vor Terz und bei Gleichstand Trumpf höher', () => {
    const terz = findSequenceMeld(
      [card('Spades', '9'), card('Spades', '10'), card('Spades', 'J')],
      'Terz', 'Hearts', '0',
    )!;
    const fifty = findSequenceMeld(
      [card('Clubs', '9'), card('Clubs', '10'), card('Clubs', 'J'), card('Clubs', 'Q')],
      'Fünfzig', 'Hearts', '1',
    )!;
    expect(compareSequenceMelds(fifty, terz, 'Hearts')).toBeGreaterThan(0);

    const trumpTerz = findSequenceMeld(
      [card('Hearts', '9'), card('Hearts', '10'), card('Hearts', 'J')],
      'Terz', 'Hearts', '1',
    )!;
    expect(compareSequenceMelds(trumpTerz, terz, 'Hearts')).toBeGreaterThan(0);
  });

  it('findet und summiert mehrere getrennte Folgen eines Spielers', () => {
    const hand = [
      card('Spades', '7'), card('Spades', '8'), card('Spades', '9'),
      card('Hearts', '9'), card('Hearts', '10'), card('Hearts', 'J'),
      card('Clubs', '7'), card('Diamonds', '7'), card('Diamonds', 'A'),
    ];

    const melds = getAllSequenceMelds(hand, 'Clubs', '0');
    expect(melds).toHaveLength(2);
    expect(melds.reduce((sum, meld) => sum + meld.points, 0)).toBe(40);
  });
});
