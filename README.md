# btn-ip-list

Cloudflare Worker that mirrors the [PBH-BTN bad-peer IP feed](https://github.com/PBH-BTN/BTN-Collected-Rules)
into a WAF custom IP list named `btn`. Runs at minute 5, 25, and 45 of every
hour and emails a diff summary when anything changes.

Use the list in a WAF custom rule:

```
ip.src in $btn
```

## Prerequisites

- A Cloudflare account (Free plan works for custom IP lists).
- A domain on Cloudflare DNS with Email Sending onboarded; the `EMAIL_FROM`
  address must live on that domain.
- Node 18+ and `jq` on the build host.

## Setup

```bash
npm install
npx wrangler kv namespace create BTN_STATE         # note the returned id
npx wrangler email sending enable yourdomain.com   # if not already
npx wrangler secret put LIST_API_TOKEN             # Account Filter Lists: Edit

cp .env.example .env
$EDITOR .env                                       # account id, emails, kv id
```

Optional: `npx wrangler secret put ADMIN_TOKEN` if you want the `POST /sync`
admin endpoint to work.

## Deploy

```bash
npm run deploy        # or `npm run deploy:dry` to validate without uploading
```

`scripts/deploy.sh` sources `.env`, substitutes the values into a temp copy of
`wrangler.jsonc`, and hands it to `wrangler deploy`. Real values never enter
the tracked config.

`workers_dev` and `preview_urls` are off, so the Worker has no public URL. The
cron is the only thing that fires unless you add a custom route.

## How it works

Per run (`src/sync.ts`):

1. Fetch the upstream feed (`src/btn.ts`, URL hardcoded).
2. Parse to a sorted, deduped IP/CIDR set.
3. Diff against the previous set cached in KV (`BTN_STATE`, key `previous_ips`).
4. Find the `btn` list on the account, or create it.
5. PUT the new items. Up to 3 attempts, 30 s between, then give up for this tick.
6. On a successful PUT, persist the new set and the cached list id to KV.
7. Email a plain-text summary if anything changed or the PUT failed.

KV state is only updated after a successful PUT, so a transient failure
re-attempts the same diff against the same baseline on the next tick.

## Operations

Tail logs:

```bash
npx wrangler tail btn-ip-list
```

Per-run events: `sync_start`, `fetch_done`, `diff`, `put_attempt` (failures
only), `email_sent`, `sync_done`. Workers Logs also adds its own invocation
record with timing.

Force a full re-baseline (every IP shows as "added" on the next run):

```bash
source .env
npx wrangler kv key delete --namespace-id $BTN_STATE_KV_ID previous_ips
```

Manual trigger (needs `ADMIN_TOKEN` and a route):

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" https://<route>/sync
# add ?dry_run=1 to skip the PUT and the email
```

## Notes

- Cloudflare allows one pending bulk list operation per account; concurrent
  writes from other tools will cause PUTs to fail. The Worker retries 3 times
  in-tick, then surfaces the failure in the next email.
- Accepted IP formats: IPv4 (with `/8`–`/32` prefix) and IPv6 (with `/12`–`/128`).
  Anything else is dropped during parse.
- Cron runs only email on a non-empty diff or a PUT failure. `POST /sync`
  always emails so you can confirm deliverability.
- The `from` address must be on an onboarded Email Sending domain or the
  binding rejects the send.
