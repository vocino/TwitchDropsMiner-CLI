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
export function releaseMinerLock() {
    const p = minerLockPath();
    try {
        if (lockFd !== null) {
            fs.closeSync(lockFd);
            lockFd = null;
        }
    }
    catch {
        // ignore
    }
    try {
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf8").trim();
            if (raw === String(process.pid)) {
                fs.unlinkSync(p);
            }
        }
    }
    catch {
        // ignore
    }
}
function acquireMinerLock() {
    const p = minerLockPath();
    lockFd = fs.openSync(p, "wx", 0o600);
    fs.writeFileSync(lockFd, String(process.pid));
    process.on("exit", () => {
        releaseMinerLock();
    });
}
export function ensureSingleInstanceLock() {
    const p = minerLockPath();
    try {
        acquireMinerLock();
        return;
    }
    catch {
        // Fall through to stale-lock check below.
    }
    // A lock file left behind by a dead process (unclean shutdown, reboot,
    // SIGKILL) must not wedge every future start into a restart loop. Only
    // treat the lock as held when its recorded PID is still alive.
    if (!isMinerLockHeldByLiveProcess()) {
        try {
            fs.unlinkSync(p);
        }
        catch {
            // ignore
        }
        try {
            acquireMinerLock();
            logger.info("Removed stale tdm lock file from a previous run.");
            return;
        }
        catch {
            // ignore — reported below
        }
    }
    throw new Error("Another tdm instance appears to be running.");
}
