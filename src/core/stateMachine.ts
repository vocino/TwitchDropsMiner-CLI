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
}

