export type MinerState =
  | "IDLE"
  | "INVENTORY_FETCH"
  | "GAMES_UPDATE"
  | "CHANNELS_CLEANUP"
  | "CHANNELS_FETCH"
  | "CHANNEL_SWITCH"
  | "EXIT";

export class StateMachine {
  private current: MinerState = "IDLE";

  get state(): MinerState {
    return this.current;
  }

  setState(next: MinerState): void {
    this.current = next;
  }

  /**
   * Event-driven transition request (PubSub handlers, maintenance ticks).
   * These fire at any moment — including between the watch loop's state read
   * and its next tick — so a bare slot loses requests. In particular,
   * high-frequency `CHANNELS_CLEANUP` churn must not cancel a pending
   * inventory fetch + claim cycle, or drops sit at 100% unclaimed while the
   * maintenance trigger fires forever. Internal tickState progression keeps
   * using setState; only external churn goes through here.
   */
  requestState(next: MinerState): void {
    if (
      (this.current === "INVENTORY_FETCH" || this.current === "GAMES_UPDATE") &&
      next === "CHANNELS_CLEANUP"
    ) {
      return;
    }
    this.current = next;
  }
}

