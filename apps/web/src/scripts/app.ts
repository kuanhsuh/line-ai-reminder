type Rule =
  | { kind: "once"; at_local: string }
  | { kind: "daily"; time: string }
  | { kind: "weekly"; weekdays: number[]; time: string }
  | { kind: "monthly"; day_of_month: number; missing_day: "skip"; time: string }
  | { kind: "monthly_last_day"; time: string };
type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  timezone: string;
  rule: Rule;
  status: string;
  next_fire_at: string | null;
};

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const form = byId<HTMLFormElement>("reminder-form");
const kind = byId<HTMLSelectElement>("kind");
const identity = byId<HTMLSelectElement>("identity");
const notice = byId<HTMLDivElement>("notice");
let editingId: string | null = null;
let currentFilter = "active";
let reminders: Reminder[] = [];

identity.value = sessionStorage.getItem("dev-user") || "demo-a";

function showNotice(message: string, isError = false) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle("error", isError);
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "x-dev-user-id": identity.value,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "操作失敗，請稍後再試");
  return data as T;
}

function updateFields() {
  const value = kind.value;
  byId("once-fields").hidden = value !== "once";
  byId("time-fields").hidden = value === "once";
  byId("weekly-fields").hidden = value !== "weekly";
  byId("monthly-fields").hidden = value !== "monthly";
}

function readRule(): Rule {
  const time = byId<HTMLInputElement>("time").value;
  switch (kind.value) {
    case "once": {
      const at = byId<HTMLInputElement>("at-local").value;
      if (!at) throw new Error("請選擇提醒日期與時間");
      return { kind: "once", at_local: `${at}:00` };
    }
    case "daily":
      return { kind: "daily", time };
    case "weekly": {
      const weekdays = [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[name="weekday"]:checked',
        ),
      ].map((input) => Number(input.value));
      if (weekdays.length === 0) throw new Error("請至少選擇一個星期");
      return { kind: "weekly", weekdays, time };
    }
    case "monthly":
      return {
        kind: "monthly",
        day_of_month: Number(byId<HTMLSelectElement>("day-of-month").value),
        missing_day: "skip",
        time,
      };
    default:
      return { kind: "monthly_last_day", time };
  }
}

function ruleLabel(rule: Rule): string {
  if (rule.kind === "once") return "單次提醒";
  if (rule.kind === "daily") return `每天 ${rule.time}`;
  if (rule.kind === "weekly")
    return `每週 ${rule.weekdays.map((day) => "一二三四五六日"[day - 1]).join("、")} ${rule.time}`;
  if (rule.kind === "monthly")
    return `每月 ${rule.day_of_month} 日 ${rule.time}`;
  return `每月最後一天 ${rule.time}`;
}

function renderList() {
  const list = byId("reminder-list");
  const visible = reminders.filter((item) => item.status === currentFilter);
  byId("count").textContent = `${visible.length} 筆`;
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      currentFilter === "active"
        ? "目前沒有進行中的提醒。從上方建立第一筆吧！"
        : "這裡還沒有提醒。";
    list.append(empty);
    return;
  }
  for (const reminder of visible) {
    const article = document.createElement("article");
    article.className = "reminder-card";
    const dot = document.createElement("span");
    dot.className = "card-dot";
    dot.textContent = "●";
    const content = document.createElement("div");
    content.className = "card-content";
    const title = document.createElement("h3");
    title.textContent = reminder.title;
    const schedule = document.createElement("p");
    schedule.className = "schedule";
    schedule.textContent = ruleLabel(reminder.rule);
    const next = document.createElement("p");
    next.className = "next";
    next.textContent = reminder.next_fire_at
      ? `下次：${new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: reminder.timezone }).format(new Date(reminder.next_fire_at))} · ${reminder.timezone}`
      : "目前不會觸發";
    content.append(title, schedule, next);
    if (reminder.notes) {
      const notes = document.createElement("p");
      notes.className = "notes";
      notes.textContent = reminder.notes;
      content.append(notes);
    }
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (reminder.status !== "canceled") {
      actions.append(actionButton("編輯", () => startEdit(reminder)));
      actions.append(
        actionButton(reminder.status === "paused" ? "恢復" : "暫停", () =>
          mutate(
            `/api/reminders/${reminder.id}`,
            "PATCH",
            { status: reminder.status === "paused" ? "active" : "paused" },
            "提醒狀態已更新",
          ),
        ),
      );
      actions.append(
        actionButton(
          "取消提醒",
          () => {
            if (confirm(`確定取消「${reminder.title}」？`))
              void mutate(
                `/api/reminders/${reminder.id}`,
                "DELETE",
                {},
                "提醒已取消",
              );
          },
          "danger",
        ),
      );
    }
    article.append(dot, content, actions);
    list.append(article);
  }
}

function actionButton(label: string, onClick: () => void, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

async function load() {
  try {
    reminders = (await api<{ reminders: Reminder[] }>("/api/reminders"))
      .reminders;
    renderList();
  } catch (cause) {
    showNotice((cause as Error).message, true);
  }
}

async function mutate(
  path: string,
  method: string,
  body: object,
  success: string,
) {
  try {
    await api(path, { method, body: JSON.stringify(body) });
    showNotice(success);
    await load();
  } catch (cause) {
    showNotice((cause as Error).message, true);
  }
}

function startEdit(reminder: Reminder) {
  editingId = reminder.id;
  byId("form-heading").textContent = "編輯提醒";
  byId("submit-button").textContent = "儲存變更 ↗";
  byId("cancel-edit").hidden = false;
  byId<HTMLInputElement>("title").value = reminder.title;
  byId<HTMLTextAreaElement>("notes").value = reminder.notes || "";
  byId<HTMLInputElement>("timezone").value = reminder.timezone;
  kind.value = reminder.rule.kind;
  updateFields();
  if (reminder.rule.kind === "once")
    byId<HTMLInputElement>("at-local").value = reminder.rule.at_local.slice(
      0,
      16,
    );
  else byId<HTMLInputElement>("time").value = reminder.rule.time;
  if (reminder.rule.kind === "weekly")
    document
      .querySelectorAll<HTMLInputElement>('input[name="weekday"]')
      .forEach((input) => {
        input.checked =
          reminder.rule.kind === "weekly" &&
          reminder.rule.weekdays.includes(Number(input.value));
      });
  if (reminder.rule.kind === "monthly")
    byId<HTMLSelectElement>("day-of-month").value = String(
      reminder.rule.day_of_month,
    );
  byId("editor").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  form.reset();
  editingId = null;
  kind.value = "once";
  updateFields();
  byId("form-heading").textContent = "新增提醒";
  byId("submit-button").textContent = "建立提醒 ↗";
  byId("cancel-edit").hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = {
      title: byId<HTMLInputElement>("title").value,
      notes: byId<HTMLTextAreaElement>("notes").value || null,
      timezone: byId<HTMLInputElement>("timezone").value,
      rule: readRule(),
    };
    await api(editingId ? `/api/reminders/${editingId}` : "/api/reminders", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    showNotice(editingId ? "提醒已更新" : "提醒已建立");
    resetForm();
    await load();
  } catch (cause) {
    showNotice((cause as Error).message, true);
  }
});
byId("cancel-edit").addEventListener("click", resetForm);
kind.addEventListener("change", updateFields);
identity.addEventListener("change", () => {
  sessionStorage.setItem("dev-user", identity.value);
  resetForm();
  void load();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-filter]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "active";
      document
        .querySelectorAll("[data-filter]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderList();
    }),
  );
if ("serviceWorker" in navigator)
  void navigator.serviceWorker.register("/sw.js");
updateFields();
void load();
