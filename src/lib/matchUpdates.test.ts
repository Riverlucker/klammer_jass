import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyMatchUpdate } from './matchUpdates';

const mocks = vi.hoisted(() => ({ after: vi.fn(), trigger: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./pusher', () => ({ pusherServer: { trigger: mocks.trigger } }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('Nicht blockierende Echtzeit-Benachrichtigungen', () => {
  it('startet die Benachrichtigung sofort und wartet erst nach der HTTP-Antwort', async () => {
    let finish!: () => void;
    mocks.trigger.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    expect(notifyMatchUpdate('match-id', 42)).toBeUndefined();
    expect(mocks.trigger).toHaveBeenCalledWith('match-match-id', 'state-update', { stateID: 42 });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    const completion = mocks.after.mock.calls[0][0]();
    finish();
    await expect(completion).resolves.toBeUndefined();
  });

  it('behandelt Pusher-Ausfälle ohne einen gespeicherten Zug als fehlgeschlagen zu melden', async () => {
    const error = new Error('Pusher unavailable');
    mocks.trigger.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMatchUpdate('match-id', 42);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('Echtzeit-Benachrichtigung fehlgeschlagen:', error);
  });
});
