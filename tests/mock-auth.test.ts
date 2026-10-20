import { expect, it } from "vitest";
import app from "../apps/worker/src/index";

it("mock 身分只在本機明確啟用時可用", async () => {
  const local = new Request("http://localhost/api/reminders");
  const remote = new Request("https://reminder.example/api/reminders");
  expect((await app.fetch(local, {} as never)).status).toBe(401);
  expect(
    (await app.fetch(remote, { LOCAL_MOCK_AUTH: "1" } as never)).status,
  ).toBe(401);
});
