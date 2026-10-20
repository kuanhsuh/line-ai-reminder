import { Hono } from "hono";
import {
  createReminderSchema,
  ruleSchema,
  updateReminderSchema,
  type Rule,
} from "@reminder/shared";
import { ZodError } from "zod";
import { nextFireAt } from "./recurrence";

type Bindings = { DB: D1Database; ASSETS: Fetcher; LOCAL_MOCK_AUTH?: string };
type Variables = { userId: string };
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type ReminderRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  timezone: string;
  rule_json: string;
  next_fire_at_utc: number | null;
  status: string;
  version: number;
};

function error(
  code: string,
  message: string,
  status: 400 | 401 | 403 | 404 | 422 | 500 = 400,
) {
  return Response.json({ error: { code, message } }, { status });
}

function publicReminder(row: ReminderRow) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    timezone: row.timezone,
    rule: ruleSchema.parse(JSON.parse(row.rule_json)),
    status: row.status,
    next_fire_at:
      row.next_fire_at_utc === null
        ? null
        : new Date(row.next_fire_at_utc * 1000).toISOString(),
    version: row.version,
  };
}

function occurrenceStatement(db: D1Database, reminderId: string, at: number) {
  return db
    .prepare(
      `INSERT INTO reminder_occurrences
    (id, reminder_id, scheduled_at_utc, next_attempt_at_utc, line_retry_key)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(reminder_id, scheduled_at_utc) DO UPDATE SET status = 'pending', next_attempt_at_utc = excluded.next_attempt_at_utc
    WHERE reminder_occurrences.status = 'canceled'`,
    )
    .bind(crypto.randomUUID(), reminderId, at, at, crypto.randomUUID());
}

async function readReminder(db: D1Database, id: string, userId: string) {
  return db
    .prepare("SELECT * FROM reminders WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<ReminderRow>();
}

app.get("/health", (c) => c.json({ ok: true }));

app.use("/api/*", async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (
    c.env.LOCAL_MOCK_AUTH !== "1" ||
    !["localhost", "127.0.0.1"].includes(host)
  ) {
    return error("AUTH_NOT_CONFIGURED", "登入功能將於 Milestone 1B 啟用", 401);
  }
  const userId = c.req.header("x-dev-user-id") || "demo-a";
  if (!["demo-a", "demo-b"].includes(userId))
    return error("UNAUTHORIZED", "無效的本機測試身分", 401);
  if (["POST", "PATCH", "DELETE"].includes(c.req.method)) {
    if (c.req.header("origin") !== new URL(c.req.url).origin)
      return error("INVALID_ORIGIN", "請從本機管理頁操作", 403);
    if (!c.req.header("content-type")?.startsWith("application/json"))
      return error("INVALID_CONTENT_TYPE", "請使用 JSON", 400);
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, line_user_id, timezone, created_at, updated_at)
    VALUES (?, ?, 'Asia/Taipei', ?, ?)`,
  )
    .bind(userId, `local-${userId}`, now, now)
    .run();
  c.set("userId", userId);
  await next();
});

app.get("/api/me", (c) =>
  c.json({
    id: c.get("userId"),
    display_name: c.get("userId"),
    timezone: "Asia/Taipei",
    mode: "local_mock",
  }),
);

app.get("/api/reminders", async (c) => {
  const status = c.req.query("status");
  if (status && !["active", "paused", "canceled", "completed"].includes(status))
    return error("INVALID_STATUS", "狀態無效");
  const query = status
    ? c.env.DB.prepare(
        "SELECT * FROM reminders WHERE user_id = ? AND status = ? ORDER BY next_fire_at_utc, created_at DESC",
      ).bind(c.get("userId"), status)
    : c.env.DB.prepare(
        "SELECT * FROM reminders WHERE user_id = ? ORDER BY next_fire_at_utc, created_at DESC",
      ).bind(c.get("userId"));
  const rows = await query.all<ReminderRow>();
  return c.json({ reminders: rows.results.map(publicReminder) });
});

app.post("/api/reminders", async (c) => {
  const input = createReminderSchema.parse(await c.req.json());
  const now = Math.floor(Date.now() / 1000);
  const at = nextFireAt(input.rule, input.timezone, now);
  if (at === null) return error("INVALID_SCHEDULE", "提醒時間需晚於現在", 422);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO reminders
      (id, user_id, title, notes, timezone, rule_json, next_fire_at_utc, status, origin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'pwa', ?, ?)`,
    ).bind(
      id,
      c.get("userId"),
      input.title,
      input.notes ?? null,
      input.timezone,
      JSON.stringify(input.rule),
      at,
      now,
      now,
    ),
    occurrenceStatement(c.env.DB, id, at),
  ]);
  return c.json(
    publicReminder((await readReminder(c.env.DB, id, c.get("userId")))!),
    201,
  );
});

app.get("/api/reminders/:id", async (c) => {
  const row = await readReminder(c.env.DB, c.req.param("id"), c.get("userId"));
  return row
    ? c.json(publicReminder(row))
    : error("NOT_FOUND", "找不到提醒", 404);
});

app.patch("/api/reminders/:id", async (c) => {
  const row = await readReminder(c.env.DB, c.req.param("id"), c.get("userId"));
  if (!row || row.status === "canceled")
    return error("NOT_FOUND", "找不到提醒", 404);
  const input = updateReminderSchema.parse(await c.req.json());
  const rule: Rule = input.rule ?? ruleSchema.parse(JSON.parse(row.rule_json));
  const timezone = input.timezone ?? row.timezone;
  const status = input.status ?? row.status;
  const reschedule =
    input.rule !== undefined ||
    input.timezone !== undefined ||
    input.status !== undefined;
  const now = Math.floor(Date.now() / 1000);
  const at =
    status === "paused"
      ? null
      : reschedule
        ? nextFireAt(rule, timezone, now)
        : row.next_fire_at_utc;
  if (status === "active" && at === null)
    return error("INVALID_SCHEDULE", "提醒時間需晚於現在", 422);
  const statements = [
    c.env.DB.prepare(
      `UPDATE reminders SET title = ?, notes = ?, timezone = ?, rule_json = ?,
    next_fire_at_utc = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(
      input.title ?? row.title,
      input.notes === undefined ? row.notes : input.notes,
      timezone,
      JSON.stringify(rule),
      at,
      status,
      now,
      row.id,
      c.get("userId"),
    ),
  ];
  if (reschedule) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE reminder_occurrences SET status = 'canceled'
      WHERE reminder_id = ? AND status IN ('pending','retry')`,
      ).bind(row.id),
    );
    if (at !== null) statements.push(occurrenceStatement(c.env.DB, row.id, at));
  }
  await c.env.DB.batch(statements);
  return c.json(
    publicReminder((await readReminder(c.env.DB, row.id, c.get("userId")))!),
    200,
  );
});

app.delete("/api/reminders/:id", async (c) => {
  const row = await readReminder(c.env.DB, c.req.param("id"), c.get("userId"));
  if (!row) return error("NOT_FOUND", "找不到提醒", 404);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE reminders SET status = 'canceled', next_fire_at_utc = NULL,
      version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(now, row.id, c.get("userId")),
    c.env.DB.prepare(
      `UPDATE reminder_occurrences SET status = 'canceled'
      WHERE reminder_id = ? AND status IN ('pending','retry')`,
    ).bind(row.id),
  ]);
  return c.json({ ok: true });
});

app.onError((cause, c) => {
  if (cause instanceof ZodError || cause instanceof RangeError)
    return error("INVALID_INPUT", "輸入資料或時區無效", 400);
  console.error(
    "Request failed",
    cause instanceof Error ? cause.message : "unknown",
  );
  return error("INTERNAL_ERROR", "服務暫時無法處理請求", 500);
});

export default app;
