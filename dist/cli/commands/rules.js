import { Command } from "@commander-js/extra-typings";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function rulesPath() {
    return path.join(os.homedir(), ".config", "tdm", "rules.json");
}
function loadRules() {
    try {
        const p = rulesPath();
        if (!fs.existsSync(p))
            return [];
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    catch {
        return [];
    }
}
function saveRules(rules) {
    fs.mkdirSync(path.dirname(rulesPath()), { recursive: true });
    fs.writeFileSync(rulesPath(), JSON.stringify(rules, null, 2), { mode: 0o600 });
}
export const rulesCommand = new Command("rules")
    .description("Simple rules engine for channel/game prioritization (CLI superpower)")
    .option("--json", "JSON output", false)
    .option("--add <expr>", "Add rule: '<if_expr> => <action>' e.g. 'viewers < 100 => skip'")
    .option("--remove <idx>", "Remove rule by index", "")
    .option("--clear", "Clear all rules", false)
    .action(async (opts) => {
    if (opts.clear) {
        saveRules([]);
        console.log("Cleared all rules");
        return;
    }
    if (opts.remove) {
        const idx = Number(opts.remove);
        const rules = loadRules();
        if (Number.isFinite(idx) && idx >= 0 && idx < rules.length) {
            rules.splice(idx, 1);
            saveRules(rules);
            console.log(`Removed rule ${idx}`);
        }
        else {
            console.error(`Invalid index ${opts.remove}, have ${rules.length} rules`);
        }
        return;
    }
    if (opts.add) {
        const expr = String(opts.add);
        // parse "condition => action"
        const parts = expr.split("=>").map((s) => s.trim());
        if (parts.length !== 2) {
            console.error("Format: '<condition> => <action>' e.g. 'viewers < 100 => skip'");
            process.exitCode = 1;
            return;
        }
        const [cond, action] = parts;
        const allowed = ["pin_channel", "skip", "prioritize", "exclude_game"];
        if (!allowed.includes(action)) {
            console.error(`Action must be one of ${allowed.join(", ")}`);
            process.exitCode = 1;
            return;
        }
        const rules = loadRules();
        rules.push({ if: cond, action: action });
        saveRules(rules);
        console.log(`Added rule: ${cond} => ${action}`);
        return;
    }
    const rules = loadRules();
    if (opts.json) {
        console.log(JSON.stringify(rules, null, 2));
        return;
    }
    if (rules.length === 0) {
        console.log("No rules. Add with:");
        console.log("  tdm rules --add 'viewers < 100 => skip'");
        console.log("  tdm rules --add 'game == \"Overwatch\" && remaining < 30 => prioritize'");
        console.log("  tdm rules --add 'game == \"Just Chatting\" => exclude_game'");
        console.log("\nFields available in condition: game, viewers, remaining, availability, channel, tags (comma list)");
        console.log("Actions: skip (skip channel), prioritize (boost game), pin_channel, exclude_game");
        console.log(`Config file: ${rulesPath()}`);
        return;
    }
    console.log(`Rules (${rules.length}) from ${rulesPath()}:`);
    rules.forEach((r, i) => {
        console.log(`  ${i}: if ${r.if} => ${r.action}`);
    });
});
export function evaluateRules(rules, ctx) {
    for (const rule of rules) {
        try {
            // Very small eval: build function with fields
            // eslint-disable-next-line no-new-func
            const fn = new Function("game", "viewers", "remaining", "availability", "channel", "tags", `return (${rule.if});`);
            const ok = fn(ctx.game, ctx.viewers ?? 0, ctx.remaining ?? 0, ctx.availability ?? 999, ctx.channel ?? "", ctx.tags ?? []);
            if (ok)
                return { action: rule.action, matched: rule };
        }
        catch {
            // ignore parse errors in eval — log
        }
    }
    return {};
}
