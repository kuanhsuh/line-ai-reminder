import { describe, expect, it } from "vitest";
import { nextFireAt } from "../apps/worker/src/recurrence";

const seconds = (iso: string) => Date.parse(iso) / 1000;

describe("重複提醒的當地日曆計算", () => {
  it("單次與每週規則會轉換為 UTC，且過期單次不再排程", () => {
    const once = { kind: "once" as const, at_local: "2026-10-21T08:00:00" };
    expect(
      nextFireAt(once, "Asia/Taipei", seconds("2026-10-20T00:00:00Z")),
    ).toBe(seconds("2026-10-21T00:00:00Z"));
    expect(
      nextFireAt(once, "Asia/Taipei", seconds("2026-10-21T00:00:00Z")),
    ).toBeNull();
    expect(
      nextFireAt(
        { kind: "weekly", weekdays: [1, 5], time: "17:00" },
        "Asia/Taipei",
        seconds("2026-10-20T00:00:00Z"),
      ),
    ).toBe(seconds("2026-10-23T09:00:00Z"));
  });

  it("31 日跳過不存在日期，月底採當月最後一日", () => {
    expect(
      nextFireAt(
        {
          kind: "monthly",
          day_of_month: 31,
          missing_day: "skip",
          time: "09:00",
        },
        "Asia/Taipei",
        seconds("2027-02-01T00:00:00Z"),
      ),
    ).toBe(seconds("2027-03-31T01:00:00Z"));
    expect(
      nextFireAt(
        { kind: "monthly_last_day", time: "09:00" },
        "Asia/Taipei",
        seconds("2027-02-01T00:00:00Z"),
      ),
    ).toBe(seconds("2027-02-28T01:00:00Z"));
  });

  it("夏令時間切換後仍維持當地 09:00", () => {
    const rule = { kind: "daily" as const, time: "09:00" };
    expect(
      nextFireAt(rule, "America/New_York", seconds("2026-03-07T15:00:00Z")),
    ).toBe(seconds("2026-03-08T13:00:00Z"));
    expect(
      nextFireAt(rule, "America/New_York", seconds("2026-11-01T00:00:00Z")),
    ).toBe(seconds("2026-11-01T14:00:00Z"));
  });

  it("不存在的當地時間採向前調整；重複的時間採較早時點", () => {
    expect(
      nextFireAt(
        { kind: "once", at_local: "2026-03-08T02:30:00" },
        "America/New_York",
        seconds("2026-03-07T00:00:00Z"),
      ),
    ).toBe(seconds("2026-03-08T07:30:00Z"));
    expect(
      nextFireAt(
        { kind: "once", at_local: "2026-11-01T01:30:00" },
        "America/New_York",
        seconds("2026-10-31T00:00:00Z"),
      ),
    ).toBe(seconds("2026-11-01T05:30:00Z"));
  });
});
