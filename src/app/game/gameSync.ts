// Keep elapsed time independent of the user's wall clock (including clock changes).
export class GameClock {
  private sample: { serverTime: number; receivedAt: number } | null = null;
  private stateID = -1;

  accept(stateID: number, serverTime: number | undefined, receivedAt = performance.now()): boolean {
    if (stateID < this.stateID) return false;
    this.stateID = stateID;
    if (serverTime !== undefined) {
      const current = this.sample ? this.now(receivedAt) : serverTime;
      this.sample = { serverTime: Math.max(current, serverTime), receivedAt };
    }
    return true;
  }

  now(at = performance.now()): number {
    return this.sample ? this.sample.serverTime + at - this.sample.receivedAt : Date.now();
  }
}

// A too-early check, conflict or network error must never consume the deadline forever.
export class TickRequest {
  pending: Promise<void> | null = null;
  private retryAt = 0;

  run(action: () => Promise<void>, now = performance.now()): Promise<void> {
    if (this.pending) return this.pending;
    if (now < this.retryAt) return Promise.resolve();
    this.retryAt = now + 1000;
    this.pending = action().finally(() => { this.pending = null; });
    return this.pending;
  }
}
