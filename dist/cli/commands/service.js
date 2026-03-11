import { Command } from "@commander-js/extra-typings";
import { writeUnitFile, systemctl } from "../../ops/systemd.js";
import { EXIT_OK, EXIT_SERVICE_ERROR } from "../contracts/exitCodes.js";
export const serviceCommand = new Command("service")
    .description("Manage TwitchDropsMiner CLI as a systemd service")
    .option("--user", "Use user-level systemd unit (recommended)", true)
    .option("--system", "Use system-level systemd unit (requires root)", false);
serviceCommand
    .command("install")
    .description("Install the systemd unit")
    .option("--name <name>", "Service unit name", "tdm.service")
    .option("--autostart", "Enable service at boot", true)
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    const unitPath = writeUnitFile({
        userUnit,
        autostart: opts.autostart,
        serviceName: opts.name
    });
    // eslint-disable-next-line no-console
    console.log(`Installed unit at: ${unitPath}`);
    if (opts.autostart) {
        const code = await systemctl(["enable", opts.name], userUnit);
        if (code !== 0) {
            process.exitCode = EXIT_SERVICE_ERROR;
            return;
        }
    }
    process.exitCode = EXIT_OK;
});
serviceCommand
    .command("start")
    .description("Start the service")
    .option("--name <name>", "Service unit name", "tdm.service")
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    const code = await systemctl(["start", opts.name], userUnit);
    process.exitCode = code === 0 ? EXIT_OK : EXIT_SERVICE_ERROR;
});
serviceCommand
    .command("stop")
    .description("Stop the service")
    .option("--name <name>", "Service unit name", "tdm.service")
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    const code = await systemctl(["stop", opts.name], userUnit);
    process.exitCode = code === 0 ? EXIT_OK : EXIT_SERVICE_ERROR;
});
serviceCommand
    .command("restart")
    .description("Restart the service")
    .option("--name <name>", "Service unit name", "tdm.service")
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    const code = await systemctl(["restart", opts.name], userUnit);
    process.exitCode = code === 0 ? EXIT_OK : EXIT_SERVICE_ERROR;
});
serviceCommand
    .command("status")
    .description("Show service status")
    .option("--name <name>", "Service unit name", "tdm.service")
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    const code = await systemctl(["status", opts.name], userUnit);
    process.exitCode = code === 0 ? EXIT_OK : EXIT_SERVICE_ERROR;
});
serviceCommand
    .command("uninstall")
    .description("Disable and remove the systemd unit")
    .option("--name <name>", "Service unit name", "tdm.service")
    .action(async (opts, cmd) => {
    const parent = cmd.parent;
    const userUnit = parent.getOptionValue("user") && !parent.getOptionValue("system");
    // Best-effort disable; ignore errors.
    await systemctl(["disable", opts.name], userUnit);
    // Unit file removal is left to the user to avoid accidental deletions outside home.
    // eslint-disable-next-line no-console
    console.log("Service disabled. To fully remove the unit file, delete it from your systemd directory.");
    process.exitCode = EXIT_OK;
});
