export class MaintenanceScheduler {
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs: number, callback: () => Promise<void> | void): void {
    this.stop();
    this.timer = setInterval(() => {
      void callback();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

