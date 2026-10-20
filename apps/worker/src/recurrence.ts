import { Temporal } from "@js-temporal/polyfill";
import type { Rule } from "@reminder/shared";

/** 下一次發生時間一律以當地日曆計算，結果回傳 UTC epoch seconds。 */
export function nextFireAt(
  rule: Rule,
  timezone: string,
  afterEpochSeconds: number,
): number | null {
  const after = Temporal.Instant.fromEpochMilliseconds(
    afterEpochSeconds * 1000,
  );
  const localNow = after.toZonedDateTimeISO(timezone).toPlainDate();

  function instant(date: Temporal.PlainDate, time: string): Temporal.Instant {
    const [hour, minute] = time.split(":").map(Number);
    return date
      .toPlainDateTime({ hour, minute })
      .toZonedDateTime(timezone, { disambiguation: "compatible" })
      .toInstant();
  }

  if (rule.kind === "once") {
    const local = Temporal.PlainDateTime.from(rule.at_local);
    const candidate = local
      .toZonedDateTime(timezone, { disambiguation: "compatible" })
      .toInstant();
    return Temporal.Instant.compare(candidate, after) > 0
      ? Math.floor(candidate.epochMilliseconds / 1000)
      : null;
  }

  for (let offset = 0; offset <= 400; offset++) {
    const date = localNow.add({ days: offset });
    if (rule.kind === "weekly" && !rule.weekdays.includes(date.dayOfWeek))
      continue;
    if (rule.kind === "monthly" && date.day !== rule.day_of_month) continue;
    if (rule.kind === "monthly_last_day" && date.day !== date.daysInMonth)
      continue;
    const candidate = instant(date, rule.time);
    if (Temporal.Instant.compare(candidate, after) > 0)
      return Math.floor(candidate.epochMilliseconds / 1000);
  }
  throw new Error("無法計算下一次提醒");
}
