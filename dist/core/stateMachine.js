export class StateMachine {
    current = "IDLE";
    get state() {
        return this.current;
    }
    setState(next) {
        this.current = next;
    }
}
