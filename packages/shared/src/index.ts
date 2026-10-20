import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const atLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00$/);

export const ruleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at_local: atLocal }),
  z.object({ kind: z.literal("daily"), time }),
  z.object({
    kind: z.literal("weekly"),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    time,
  }),
  z.object({
    kind: z.literal("monthly"),
    day_of_month: z.number().int().min(1).max(31),
    missing_day: z.literal("skip"),
    time,
  }),
  z.object({ kind: z.literal("monthly_last_day"), time }),
]);

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).nullable().optional(),
  timezone: z.string().min(1).max(80),
  rule: ruleSchema,
});

export const updateReminderSchema = createReminderSchema.partial().extend({
  status: z.enum(["active", "paused"]).optional(),
});

export type Rule = z.infer<typeof ruleSchema>;
export type CreateReminder = z.infer<typeof createReminderSchema>;
export type UpdateReminder = z.infer<typeof updateReminderSchema>;
