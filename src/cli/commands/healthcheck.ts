import { Command } from "@commander-js/extra-typings";
import { loadAuthState } from "../../state/authStore.js";
import { EXIT_AUTH_MISSING, EXIT_OK } from "../contracts/exitCodes.js";

export const healthcheckCommand = new Command("healthcheck")
  .description("Return a simple machine-readable health status for monitoring")
  .option("--json", "Output health as JSON", false)
  .action(async (opts) => {
    const auth = loadAuthState();
    const healthy = !!auth && (!!auth.accessToken || !!auth.cookiesHeader);

    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            status: healthy ? "ok" : "degraded",
            auth: {
              hasToken: !!auth?.accessToken,
              hasCookies: !!auth?.cookiesHeader
            }
          },
          null,
          2
        )
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(healthy ? "OK" : "DEGRADED");
    }

    process.exitCode = healthy ? EXIT_OK : EXIT_AUTH_MISSING;
  });

