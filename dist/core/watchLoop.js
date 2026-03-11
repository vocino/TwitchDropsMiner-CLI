import { WATCH_INTERVAL_MS } from "./constants.js";
export class WatchLoop {
    timer = null;
    running = false;
    start(onTick) {
        if (this.running) {
            return;
        }
        this.running = true;
        const tick = async () => {
            if (!this.running) {
                return;
            }
            await onTick();
            this.timer = setTimeout(tick, WATCH_INTERVAL_MS);
        };
        void tick();
    }
    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
