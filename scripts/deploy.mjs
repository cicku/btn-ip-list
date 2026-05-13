#!/usr/bin/env node
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Load .env if present. Simple parser: KEY=value or `export KEY=value`.
try {
	for (const line of readFileSync(".env", "utf8").split("\n")) {
		const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
		if (!m) continue;
		const [, k, v] = m;
		if (k && !(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, "");
	}
} catch {}

const accountId = process.env.BTN_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) {
	console.error("BTN_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) is required");
	process.exit(1);
}

for (const k of ["EMAIL_FROM", "EMAIL_TO", "BTN_STATE_KV_ID", "ROUTE_PATTERN", "ROUTE_ZONE"]) {
	if (!process.env[k]) {
		console.error(`${k} is required (set in .env or environment)`);
		process.exit(1);
	}
}

const cfg = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
cfg.vars.CF_ACCOUNT_ID = accountId;
cfg.vars.EMAIL_FROM = process.env.EMAIL_FROM;
cfg.vars.EMAIL_TO = process.env.EMAIL_TO;
cfg.send_email[0].destination_address = process.env.EMAIL_TO;
cfg.kv_namespaces[0].id = process.env.BTN_STATE_KV_ID;
cfg.routes[0].pattern = process.env.ROUTE_PATTERN;
cfg.routes[0].zone_name = process.env.ROUTE_ZONE;

const tmp = `./.wrangler-deploy.${process.pid}.jsonc`;
process.on("exit", () => {
	try { rmSync(tmp); } catch {}
});
writeFileSync(tmp, JSON.stringify(cfg, null, 2));

const r = spawnSync(
	"npx",
	["wrangler", "deploy", "--config", tmp, ...process.argv.slice(2)],
	{
		stdio: "inherit",
		env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
	},
);
process.exit(r.status ?? 0);
