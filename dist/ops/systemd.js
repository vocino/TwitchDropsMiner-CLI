import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
function getUserSystemdDir() {
    const home = os.homedir();
    const dir = path.join(home, ".config", "systemd", "user");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
}
export function getUnitPath(opts) {
    const name = opts.serviceName ?? "tdm.service";
    if (opts.userUnit) {
        return path.join(getUserSystemdDir(), name);
    }
    return path.join("/etc/systemd/system", name);
}
export function generateUnitContents(opts) {
    const nodePath = process.execPath;
    const cliEntry = process.argv[1];
    const isUserUnit = opts.userUnit;
    const lines = [
        "[Unit]",
        "Description=Twitch Drops Miner CLI",
        "After=network-online.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        `ExecStart=${nodePath} ${cliEntry} run`,
        "Restart=on-failure",
        "RestartSec=5",
        "Type=simple",
        "Environment=TDM_LOG_LEVEL=info",
        "NoNewPrivileges=true",
        "",
        "[Install]",
        "WantedBy=default.target"
    ];
    // For user units, systemd already runs as the invoking user; adding User= breaks them.
    if (!isUserUnit) {
        const user = os.userInfo().username;
        const serviceIndex = lines.indexOf("[Service]");
        if (serviceIndex !== -1) {
            lines.splice(serviceIndex + 2, 0, `User=${user}`);
        }
    }
    return lines.join("\n");
}
export function writeUnitFile(opts) {
    const unitPath = getUnitPath(opts);
    const contents = generateUnitContents(opts);
    fs.writeFileSync(unitPath, contents, { mode: 0o644 });
    return unitPath;
}
export function systemctl(args, user) {
    return new Promise((resolve) => {
        const fullArgs = [...(user ? ["--user"] : []), ...args];
        const child = spawn("systemctl", fullArgs, { stdio: "inherit" });
        child.on("close", (code) => resolve(code ?? 0));
    });
}
