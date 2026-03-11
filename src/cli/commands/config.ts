import { Command } from "@commander-js/extra-typings";
import { loadConfig, saveConfig, configPath } from "../../config/store.js";
import { ConfigSchema } from "../../config/schema.js";

export const configCommand = new Command("config").description(
  "Manage TwitchDropsMiner CLI configuration"
);

const getCommand = new Command("get")
  .argument("[key]", "Configuration key")
  .action(async (key) => {
    const cfg = loadConfig();
    if (!key) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(cfg, null, 2));
    } else {
      const value = (cfg as Record<string, unknown>)[key];
      // eslint-disable-next-line no-console
      console.log(typeof value === "undefined" ? "" : JSON.stringify(value));
    }
  });

const setCommand = new Command("set")
  .argument("<key>", "Configuration key")
  .argument("<value>", "Configuration value")
  .action(async (key, value) => {
    const cfg = loadConfig() as Record<string, unknown>;
    let parsedValue: unknown = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
    cfg[key] = parsedValue;
    const validated = ConfigSchema.parse(cfg);
    saveConfig(validated);
    // eslint-disable-next-line no-console
    console.log(`Saved ${key}.`);
  });

const validateCommand = new Command("validate").action(async () => {
  ConfigSchema.parse(loadConfig());
  // eslint-disable-next-line no-console
  console.log("Config is valid.");
});

const pathCommand = new Command("path")
  .description("Print config file path (create dir if missing)")
  .action(() => {
    // eslint-disable-next-line no-console
    console.log(configPath());
  });

configCommand.addCommand(getCommand);
configCommand.addCommand(setCommand);
configCommand.addCommand(validateCommand);
configCommand.addCommand(pathCommand);

