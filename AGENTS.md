# Codex project instructions — LINE AI Reminder

## Source of truth
- Read `PRD.md` before making plans or modifying implementation.
- Read `CODEX_START_HERE.md` and `MILESTONES.md` for priorities and acceptance tests.
- This is the C edition: Astro PWA and LINE bot share one Cloudflare Workers + D1 backend. **Do not replace D1 with Supabase, Turso, Firebase, or in-memory production storage.**
- Default locale: Traditional Chinese (zh-TW). Default time zone: Asia/Taipei, but store all precise trigger instants in UTC and honor a per-user IANA time zone.

## Stack
- Package manager: pnpm workspace.
- Frontend: Astro + TypeScript, mobile-first PWA.
- Backend: Cloudflare Workers + Hono + TypeScript + Zod.
- Database: Cloudflare D1 SQLite with checked-in SQL migrations.
- Async events: Cloudflare Queues with replay/idempotency safeguards.
- Scheduled dispatch: Workers Cron Trigger (every minute).
- AI: Gemini API with structured JSON schema validation, model configurable via env.
- Messaging: LINE Messaging API; auth: LINE Login OIDC. LINE Login and Messaging API channels must be in the same LINE Provider.

## Engineering guardrails
1. Implement **one milestone at a time**. After finishing, report changed files, commands run, test results, outstanding setup steps, and any blockers. Stop before the next milestone until the user requests it.
2. Make the current milestone run locally without production secrets using mocks/stubs wherever reasonable. Never claim live LINE delivery or deployed infrastructure without actually testing it.
3. Never ask for secrets to be pasted into chat, committed to Git, checked into example env files, or logged. Document Cloudflare Wrangler secret injection and local untracked secret files.
4. No automatic cloud provisioning, external API billable actions, deployment, purchasing, or GitHub pushes unless the user explicitly approves those actions. You may create local files, execute local tests, and show command sequences for the user to run.
5. All `/api/*` except authentication and `/health` require session authorization. Use secure HttpOnly cookies, validate OIDC state and nonce, and protect cookie-based mutations against CSRF.
6. Verify raw LINE webhook body HMAC before parsing. Deduplicate webhook IDs, one-time confirmation actions, and occurrence dispatch. For sending, use a stable LINE retry key for all retries of the same occurrence.
7. Gemini output is untrusted input: validate with Zod, never let AI execute database writes directly, and ask a clarifying question for ambiguous or past reminders.
8. A delivery accepted by LINE is not a device-delivery guarantee. Never promise exact-second scheduling.
9. Always use D1 parameterized statements and enforce `user_id` isolation on reads/writes.
10. Prefer documented stable APIs; verify dependencies and version-specific conventions when there is access to current docs. Explain reasonable alternatives if free-tier limits make a proposed implementation inappropriate.
11. Include tests for recurrence calculations, daylight-saving transitions, D1 migrations, webhook signatures/idempotency, and one-time vs recurring occurrence behavior.
12. Format, typecheck, unit-test, and build before reporting a milestone finished. Clearly report tests that could not run.

## Product boundaries
- MVP only supports LINE 1-to-1 bot conversations, not group messaging.
- MVP supports one-time/daily/weekly/monthly reminders; no Google Calendar, payment, family/team sharing, or multimedia greeting cards.
- The same user identity must map PWA and LINE events; do not infer user identity from names or phone numbers.

## Useful commands (after scaffold)
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Keep `README.md` updated with setup steps and use Traditional Chinese for user-facing documentation and UI.
