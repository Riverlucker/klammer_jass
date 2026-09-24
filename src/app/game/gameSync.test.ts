import { describe, expect, it, vi } from 'vitest';
import { canRetryAfterTimerStart, GameClock, TickRequest } from './gameSync';
import type { GameClientState } from '@/game/types';

describe('Online-Synchronisierung', () => {
  it('wiederholt einen Klick nur nach konkurrierender Timer-Bestätigung, nie nach einem Zug', () => {
    const state = (id: number, started: boolean) => ({
      G: { decisionTimer: { id, started, waitingFor: ['0'] } },
    }) as GameClientState;
    expect(canRetryAfterTimerStart(state(10, false), state(10, true))).toBe(true);
    expect(canRetryAfterTimerStart(state(10, false), state(11, true))).toBe(false);
    expect(canRetryAfterTimerStart(state(10, true), state(10, true))).toBe(false);
    expect(canRetryAfterTimerStart(state(10, false), state(10, false))).toBe(false);
  });
  it('verwendet Serverzeit und monotone Laufzeit trotz falscher Browseruhr', () => {
    const clock = new GameClock();
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(999_999_999);
    try {
      clock.accept(1, 10_000, 100);
      expect(clock.now(1100)).toBe(11_000);
      wallClock.mockReturnValue(0);
      expect(clock.now(2100)).toBe(12_000);
    } finally { wallClock.mockRestore(); }
  });

  it('ignoriert verspätete Spielstände und lässt die Uhr nicht rückwärts laufen', () => {
    const clock = new GameClock();
    expect(clock.accept(2, 10_000, 100)).toBe(true);
    expect(clock.accept(1, 9_000, 200)).toBe(false);
    expect(clock.accept(2, 9_000, 300)).toBe(true);
    expect(clock.now(400)).toBe(10_300);
  });

  it('wiederholt dieselbe Frist nach zu früher Prüfung und nach Netzwerkfehler', async () => {
    const ticks = new TickRequest();
    const request = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    await ticks.run(request, 0);
    await ticks.run(request, 500);
    expect(request).toHaveBeenCalledTimes(1);
    await expect(ticks.run(request, 1000)).rejects.toThrow('offline');
    await ticks.run(request, 2000);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('führt langsame Prüfungen nicht parallel aus und erlaubt danach einen neuen Versuch', async () => {
    const ticks = new TickRequest();
    let finish!: () => void;
    const request = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = ticks.run(request, 0);
    expect(ticks.run(request, 2000)).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(ticks.pending).toBeNull();
    const second = ticks.run(request, 3000);
    expect(request).toHaveBeenCalledTimes(2);
    finish();
    await second;
  });
});
