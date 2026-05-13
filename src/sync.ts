import { fetchBtnList } from "./btn.js";
import { CloudflareClient, type CfList } from "./cloudflare.js";
import { diffIps } from "./diff.js";
import { sendSummaryEmail } from "./email.js";

const KEY_PREV = "previous_ips";
const KEY_LIST_ID = "list_id";
const LIST_DESCRIPTION = "PBH-BTN collected bad peer IPs, auto-synced from GitHub.";

export interface SyncResult {
	added: number;
	removed: number;
	total: number;
}

export async function runSync(
	env: Env,
	dryRun = false,
	emailOnNoChange = false,
): Promise<SyncResult> {
	const startedAt = Date.now();
	const timestamp = new Date(startedAt);

	log("sync_start", { dryRun });

	const fetched = await fetchBtnList();
	log("fetch_done", { ips: fetched.ips.length, invalid: fetched.invalidCount });

	const prev = await readPrev(env);
	const diff = diffIps(prev, fetched.ips);
	log("diff", { added: diff.added.length, removed: diff.removed.length });

	const cf = new CloudflareClient(env.CF_ACCOUNT_ID, env.LIST_API_TOKEN);
	const list = await resolveList(cf, env);

	let putError: string | undefined;

	if (!dryRun) {
		const items = fetched.ips.map((ip) => ({
			ip,
			comment: `btn ${timestamp.toISOString().slice(0, 10)}`,
		}));

		for (let attempt = 1; attempt <= 3; attempt++) {
			putError = undefined;
			try {
				const op = await cf.replaceItems(list.id, items);
				const status = await cf.waitForOperation(op.operation_id);
				if (status.status !== "failed") break;
				putError = status.error ?? "bulk operation reported failed";
			} catch (e) {
				putError = e instanceof Error ? e.message : String(e);
			}
			log("put_attempt", {
				level: attempt < 3 ? "warning" : "error",
				attempt,
				error: putError,
			});
			if (attempt < 3) await sleep(30_000);
		}

		if (!putError) {
			await env.BTN_STATE.put(KEY_PREV, JSON.stringify(fetched.ips));
			await env.BTN_STATE.put(KEY_LIST_ID, list.id);
		}
	}

	if (!dryRun && (diff.added.length || diff.removed.length || putError || emailOnNoChange)) {
		await sendSummaryEmail(env.EMAIL, {
			to: env.EMAIL_TO,
			from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
			listName: list.name,
			totalIps: fetched.ips.length,
			diff,
			timestamp,
			error: putError,
		});
		log("email_sent", {
			level: "info",
			message: "email successfully sent",
			to: env.EMAIL_TO,
			error: putError,
		});
	}

	log("sync_done", {
		level: putError ? "error" : "info",
		total: fetched.ips.length,
		added: diff.added.length,
		removed: diff.removed.length,
		error: putError,
		durationMs: Date.now() - startedAt,
	});

	return {
		added: diff.added.length,
		removed: diff.removed.length,
		total: fetched.ips.length,
	};
}

async function resolveList(cf: CloudflareClient, env: Env): Promise<CfList> {
	const cachedId = await env.BTN_STATE.get(KEY_LIST_ID);
	if (cachedId) {
		const found = (await cf.listLists()).find(
			(l) => l.id === cachedId && l.name === env.CF_LIST_NAME,
		);
		if (found) return found;
	}

	const existing = await cf.findListByName(env.CF_LIST_NAME);
	if (existing) {
		await env.BTN_STATE.put(KEY_LIST_ID, existing.id);
		return existing;
	}

	const created = await cf.createList({
		name: env.CF_LIST_NAME,
		description: LIST_DESCRIPTION,
		kind: "ip",
	});
	await env.BTN_STATE.put(KEY_LIST_ID, created.id);
	return created;
}

async function readPrev(env: Env): Promise<string[]> {
	const raw = await env.BTN_STATE.get(KEY_PREV);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed;
	} catch { /* ignore */ }
	return [];
}

function log(event: string, fields: Record<string, unknown> = {}): void {
	const payload = JSON.stringify({ event, ...fields });
	switch (fields.level) {
		case "error": console.error(payload); break;
		case "warning":
		case "warn":   console.warn(payload); break;
		default:       console.log(payload);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
