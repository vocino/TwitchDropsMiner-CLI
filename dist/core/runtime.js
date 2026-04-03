import pino from "pino";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export const logger = pino({
    level: process.env.TDM_LOG_LEVEL || "info"
});
let lockFd = null;
export function minerLockPath() {
    const dir = path.join(os.homedir(), ".local", "state", "tdm");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, "lock.file");
}
/** True if lock file exists and the recorded PID is still running (best-effort). */
export function isMinerLockHeldByLiveProcess() {
    const p = minerLockPath();
    if (!fs.existsSync(p)) {
        return false;
    }
    try {
        const raw = fs.readFileSync(p, "utf8").trim();
        const pid = Number(raw);
        if (!Number.isFinite(pid) || pid <= 0) {
            return true;
        }
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    catch {
        return false;
    }
}
export function ensureSingleInstanceLock() {
    const p = minerLockPath();
    try {
        lockFd = fs.openSync(p, "wx", 0o600);
        fs.writeFileSync(lockFd, String(process.pid));
        process.on("exit", () => {
            try {
                if (lockFd !== null) {
                    fs.closeSync(lockFd);
                    fs.unlinkSync(p);
                }
            }
            catch {
                // ignore
            }
        });
    }
    catch {
        throw new Error("Another tdm instance appears to be running.");
    }
}
