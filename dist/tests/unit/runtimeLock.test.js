import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureSingleInstanceLock, isMinerLockHeldByLiveProcess, minerLockPath, releaseMinerLock } from "../../core/runtime.js";
function withTempHome() {
    const prevHome = process.env.HOME;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdm-lock-test-"));
    process.env.HOME = tmp;
    assert.ok(minerLockPath().startsWith(tmp), `lock path should follow $HOME override (got ${minerLockPath()})`);
    return {
        tmp,
        restore: () => {
            try {
                releaseMinerLock();
            }
            catch {
                // ignore
            }
            if (prevHome === undefined) {
                delete process.env.HOME;
            }
            else {
                process.env.HOME = prevHome;
            }
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };
}
function findDeadPid() {
    for (let pid = 500000; pid < 500100; pid++) {
        try {
            process.kill(pid, 0);
        }
        catch {
            return pid;
        }
    }
    throw new Error("could not find an unused PID for stale-lock test");
}
test("stale lock from a dead process is cleared on acquire", () => {
    const ctx = withTempHome();
    try {
        const p = minerLockPath();
        fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
        fs.writeFileSync(p, String(findDeadPid()), { mode: 0o600 });
        assert.equal(isMinerLockHeldByLiveProcess(), false);
        ensureSingleInstanceLock();
        assert.equal(fs.readFileSync(p, "utf8").trim(), String(process.pid));
    }
    finally {
        ctx.restore();
    }
});
test("lock held by a live process still refuses a second instance", () => {
    const ctx = withTempHome();
    try {
        const p = minerLockPath();
        fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
        fs.writeFileSync(p, String(process.pid), { mode: 0o600 });
        assert.equal(isMinerLockHeldByLiveProcess(), true);
        assert.throws(() => ensureSingleInstanceLock(), /Another tdm instance/);
    }
    finally {
        ctx.restore();
    }
});
