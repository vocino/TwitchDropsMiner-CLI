import pino from "pino";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export const logger = pino({
    level: process.env.TDM_LOG_LEVEL || "info"
});
let lockFd = null;
function lockPath() {
    const dir = path.join(os.homedir(), ".local", "state", "tdm");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, "lock.file");
}
export function ensureSingleInstanceLock() {
    const p = lockPath();
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
