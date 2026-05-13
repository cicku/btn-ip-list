import { runSync } from "./sync.js";

export default {
	async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(runSync(env));
	},

	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/btn/, "") || "/";

		if (path === "/healthz") {
			return new Response("ok");
		}

		if (path === "/sync" && request.method === "POST") {
			if (!authorized(request, env)) {
				return new Response("unauthorized", { status: 401 });
			}
			const dryRun = url.searchParams.get("dry_run") === "1";
			try {
				const result = await runSync(env, dryRun, true);
				return Response.json({ ok: true, ...result });
			} catch (err) {
				return Response.json(
					{ ok: false, error: err instanceof Error ? err.message : String(err) },
					{ status: 500 },
				);
			}
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

function authorized(request: Request, env: Env): boolean {
	const expected = env.ADMIN_TOKEN;
	if (!expected) return false;
	const provided = request.headers.get("X-Admin-Token");
	if (!provided) return false;

	const enc = new TextEncoder();
	const a = enc.encode(provided);
	const b = enc.encode(expected);
	if (a.byteLength !== b.byteLength) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}
