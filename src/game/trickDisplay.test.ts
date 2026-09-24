import { describe, expect, it } from 'vitest';
import { TrickDisplay } from './trickDisplay';
import type { Trick } from './types';

const trick: Trick = {
  leadPlayer: '0', winner: '1',
  cards: { '0': { suit: 'Hearts', rank: '9' }, '1': { suit: 'Hearts', rank: 'A' } },
};
const completed = {
  gameNumber: 1, handNumber: 1, pastTricks: [trick],
  trickDisplayUntil: 4000, inspectingLastTrick: false,
};

describe('Stichanzeige bei verzögerten Online-Updates', () => {
  it('zeigt beiden Browsern beide Karten drei Sekunden ab ihrem jeweiligen Empfang', () => {
    const firstPlayer = new TrickDisplay();
    const secondPlayer = new TrickDisplay();
    const fast = secondPlayer.receive(completed, 1100)!;
    const delayed = firstPlayer.receive(completed, 6500)!;
    expect(fast.until).toBe(4100);
    expect(delayed.until).toBe(9500);
    expect(delayed.trick.cards).toEqual(trick.cards);
    expect(delayed.inspecting).toBe(false);
  });

  it('verlängert die Anzeige nicht durch Polling oder Timer-Bestätigungen', () => {
    const display = new TrickDisplay();
    const initial = display.receive(completed, 6500)!;
    expect(display.receive(structuredClone(completed), 8500)).toBe(initial);
    expect(display.receive(completed, 10000)?.until).toBe(9500);
  });

  it('bewahrt den Stich, auch wenn der Server inzwischen schon die nächste Karte verarbeitet hat', () => {
    const display = new TrickDisplay();
    const initial = display.receive(completed, 6500)!;
    const advanced = { ...completed, trickDisplayUntil: null, inspectingLastTrick: false };
    expect(display.receive(advanced, 7000)).toBe(initial);
    expect(display.receive(advanced, 7000)?.trick.cards['1']).toEqual({ suit: 'Hearts', rank: 'A' });
    // Even when the first received update already contains a subsequent move, the last trick is still shown.
    expect(new TrickDisplay().receive(advanced, 7000)?.until).toBe(10000);
  });

  it('zeigt erneutes Anschauen vollständig, ohne es bei jedem Update neu zu starten', () => {
    const display = new TrickDisplay();
    display.receive(completed, 1000);
    const inspection = { ...completed, inspectingLastTrick: true, trickDisplayUntil: 13000 };
    const shown = display.receive(inspection, 14500)!;
    expect(shown.inspecting).toBe(true);
    expect(shown.until).toBe(17500);
    expect(display.receive(inspection, 16000)).toBe(shown);
    expect(display.receive({ ...inspection, trickDisplayUntil: 21000 }, 20000)?.until).toBe(23000);
  });

  it('zeigt bei einer neuen Hand keinen alten Stich mehr', () => {
    const display = new TrickDisplay();
    display.receive(completed, 1000);
    expect(display.receive({ ...completed, handNumber: 2, pastTricks: [], trickDisplayUntil: null }, 5000)).toBeNull();
    expect(display.receive({ ...completed, handNumber: 2 }, 6000)?.until).toBe(9000);
  });
});
