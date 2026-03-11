export class MaintenanceScheduler {
    timer = null;
    start(intervalMs, callback) {
        this.stop();
        this.timer = setInterval(() => {
            void callback();
        }, intervalMs);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
