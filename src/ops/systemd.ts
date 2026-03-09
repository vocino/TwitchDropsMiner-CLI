import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export interface InstallOptions {
  userUnit: boolean;
  autostart: boolean;
  serviceName?: string;
}

function getUserSystemdDir(): string {
  const home = os.homedir();
  const dir = path.join(home, ".config", "systemd", "user");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function getUnitPath(opts: InstallOptions): string {
  const name = opts.serviceName ?? "tdm.service";
  if (opts.userUnit) {
    return path.join(getUserSystemdDir(), name);
  }
  return path.join("/etc/systemd/system", name);
}

export function generateUnitContents(opts: InstallOptions): string {
  const user = os.userInfo().username;
  const nodePath = process.execPath;
  const cliBin = "tdm";

  return [
    "[Unit]",
    "Description=Twitch Drops Miner CLI",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    `ExecStart=${nodePath} ${cliBin} run`,
    "Restart=on-failure",
    "RestartSec=5",
    "Type=simple",
    `User=${user}`,
    "Environment=TDM_LOG_LEVEL=info",
    "NoNewPrivileges=true",
    "",
    "[Install]",
    "WantedBy=default.target"
  ].join("\n");
}

export function writeUnitFile(opts: InstallOptions): string {
  const unitPath = getUnitPath(opts);
  const contents = generateUnitContents(opts);
  fs.writeFileSync(unitPath, contents, { mode: 0o644 });
  return unitPath;
}

export function systemctl(args: string[], user: boolean): Promise<number> {
  return new Promise((resolve) => {
    const fullArgs = [...(user ? ["--user"] : []), ...args];
    const child = spawn("systemctl", fullArgs, { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
  });
}

