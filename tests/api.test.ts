import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workerDir = resolve("apps/worker");
const wrangler = join(workerDir, "node_modules/.bin/wrangler");
const persist = mkdtempSync(join(tmpdir(), "line-reminder-d1-"));
const port = 19878;
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess;

function command(args: string[]) {
  return execFileSync(wrangler, args, {
    cwd: workerDir,
    encoding: "utf8",
    timeout: 60000,
  });
}

async function request(
  path: string,
  method = "GET",
  user = "demo-a",
  body?: object,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "x-dev-user-id": user,
      ...(body ? { "Content-Type": "application/json", Origin: base } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

beforeAll(async () => {
  command([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    persist,
  ]);
  server = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--persist-to",
      persist,
      "--port",
      String(port),
      "--var",
      "LOCAL_MOCK_AUTH:1",
    ],
    { cwd: workerDir, stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Wrangler 本機服務無法啟動");
});

afterAll(() => {
  server?.kill();
  rmSync(persist, { recursive: true, force: true });
});

describe("D1 migration 與提醒 API", () => {
  it("建立六張資料表及唯一約束", () => {
    const output = command([
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      persist,
      "--command",
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'd1_%' AND name NOT LIKE 'sqlite_%' AND name != '_cf_METADATA' ORDER BY name",
      "--json",
    ]);
    const names = JSON.parse(output)[0].results.map(
      (row: { name: string }) => row.name,
    );
    expect(names).toEqual([
      "incoming_events",
      "pending_actions",
      "reminder_occurrences",
      "reminders",
      "sessions",
      "users",
    ]);
  });

  it("使用者只能讀寫自己的提醒，並可建立、修改、暫停、恢復和取消", async () => {
    const rule = { kind: "weekly", weekdays: [1], time: "09:00" };
    const created = await request("/api/reminders", "POST", "demo-a", {
      title: "測試提醒",
      timezone: "Asia/Taipei",
      rule,
    });
    expect(created.status).toBe(201);
    const id = created.data.id as string;
    expect(created.data.next_fire_at).toMatch(/Z$/);
    expect(
      (await request("/api/reminders", "GET", "demo-b")).data.reminders,
    ).toEqual([]);
    expect(
      (await request(`/api/reminders/${id}`, "GET", "demo-b")).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/reminders/${id}`, "PATCH", "demo-b", {
          title: "偷改",
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(`/api/reminders/${id}`, "DELETE", "demo-b", {})).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/reminders/${id}`, "PATCH", "demo-a", {
          title: "已修改",
        })
      ).data.title,
    ).toBe("已修改");
    expect(
      (
        await request(`/api/reminders/${id}`, "PATCH", "demo-a", {
          status: "paused",
        })
      ).data.next_fire_at,
    ).toBeNull();
    expect(
      (
        await request(`/api/reminders/${id}`, "PATCH", "demo-a", {
          status: "active",
        })
      ).data.status,
    ).toBe("active");
    const pending = command([
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      persist,
      "--command",
      `SELECT status FROM reminder_occurrences WHERE reminder_id = '${id}'`,
      "--json",
    ]);
    expect(JSON.parse(pending)[0].results).toEqual([{ status: "pending" }]);
    expect(
      (await request(`/api/reminders/${id}`, "DELETE", "demo-a", {})).status,
    ).toBe(200);
    expect(
      (await request(`/api/reminders/${id}`, "GET", "demo-a")).data.status,
    ).toBe("canceled");
    const canceled = command([
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      persist,
      "--command",
      `SELECT status FROM reminder_occurrences WHERE reminder_id = '${id}'`,
      "--json",
    ]);
    expect(JSON.parse(canceled)[0].results).toEqual([{ status: "canceled" }]);
  });

  it("拒絕過期提醒、非 JSON 寫入及不受信任來源", async () => {
    const expired = await request("/api/reminders", "POST", "demo-a", {
      title: "過期",
      timezone: "Asia/Taipei",
      rule: { kind: "once", at_local: "2020-01-01T09:00:00" },
    });
    expect(expired.status).toBe(422);
    const origin = await fetch(base + "/api/reminders", {
      method: "POST",
      headers: {
        Origin: "https://example.com",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(origin.status).toBe(403);
    expect((await request("/api/reminders", "GET", "unknown")).status).toBe(
      401,
    );
  });

  it("單次與重複提醒建立時各只產生下一筆 occurrence", async () => {
    for (const rule of [
      { kind: "once", at_local: "2099-01-01T09:00:00" },
      { kind: "daily", time: "09:00" },
    ]) {
      const created = await request("/api/reminders", "POST", "demo-a", {
        title: "事件數測試",
        timezone: "Asia/Taipei",
        rule,
      });
      expect(created.status).toBe(201);
      const output = command([
        "d1",
        "execute",
        "DB",
        "--local",
        "--persist-to",
        persist,
        "--command",
        `SELECT COUNT(*) AS total FROM reminder_occurrences WHERE reminder_id = '${created.data.id}'`,
        "--json",
      ]);
      expect(JSON.parse(output)[0].results[0].total).toBe(1);
    }
  });
});
