# LINE AI 提醒助手 — MVP 開發規格 v1.0

版本日期：2026-10-18  
產品方向：C 版，PWA + LINE 雙入口，單一提醒資料來源  
預設時區：Asia/Taipei（使用者可修改）

## 1. 產品目標與範圍

讓使用者能以手機 PWA 或 LINE 一對一聊天室，透過文字或語音建立、查詢、修改、取消提醒，系統定期檢查到期任務並主動使用 LINE Messaging API 推播。

### MVP（P0）
- LINE Login 登入 PWA，與 LINE 官方帳號建立相同使用者對應。
- PWA：文字輸入、麥克風輸入／文字備援、AI 時間解析預覽、確認儲存、列表、編輯、取消、暫停及恢復提醒。
- LINE：一對一文字／語音設定提醒、列出即將到來提醒、取消／修改、確認按鈕、收到通知後「完成」／「延後 10 分鐘」。
- 排程：單次、每日、每週指定星期、每月指定日期；預設發送 LINE 主動通知。
- 完整分隔每個使用者的資料、Webhook 去重、送訊去重及失敗重試、基本日誌與用量統計。

### 不在 MVP（P1/P2）
- 群組聊天、家庭共享、多租戶團隊、跨人分享。
- Google Calendar 同步、圖片賀卡、商業收費、原生 Android/iOS App、網頁推播。
- 自動執行會影響外部世界的任務（例如代替使用者寄電子郵件）。

## 2. 主要操作流程

### 2.1 PWA 新增
1. 使用者以 LINE Login 登入。
2. 在文字欄或麥克風輸入「下週三下午三點提醒我聯絡客戶」。
3. 服務端傳回 `intent=create`、提醒標題、時區、當地時間與 recurrence；前端顯示預覽。
4. 使用者點「確認」，前端呼叫 `POST /api/reminders`。
5. 後端新增提醒及第一個待發 occurrence；清單同步顯示。
6. 到期時透過 LINE 主動推播。

### 2.2 LINE 文字／語音新增
1. LINE webhook 收到訊息，驗證簽章，儲存 `webhookEventId` 去重，送入 Queue 處理。
2. 文字訊息直接送 Gemini 解析；語音訊息先向 LINE 下載音訊並由 Gemini 轉成文字。
3. 若時間明確，產生確認草稿；若不明確，要求補充資訊。
4. 使用者點「確認建立」的 Postback，伺服器以短效一次性操作憑證建立提醒。
5. LINE 回覆成功；PWA 重新載入或輪詢後顯示同一筆提醒。

### 2.3 修改、取消及查詢
- 文字指令 `明天有哪些提醒` 回覆排序後清單。
- `把明天 8 點的提醒改成 9 點` 找到唯一匹配後預覽；若同時匹配多筆，列出可選對象。
- `取消明天 8 點的提醒` 需要確認；取消待發 occurrence，保留軟刪除紀錄。
- LINE 提醒訊息附有「完成」和「延後 10 分鐘」；後者只建立一次性延後 occurrence，不更改例行提醒的後續頻率。

### 2.4 日期語意
- 後端提供可信任的當下 UTC 時間與使用者 IANA 時區給 Gemini。Gemini 只提供結構化解析結果，後端必須再次驗證所有日期、時間及歧義。
- `10 分鐘後`、`明天早上`、`每週五下午五點`、`每月 15 日`、`每月月底`為支援輸入。
- 沒有明確時刻（例如「明天提醒我」）、已過期時間、含糊週別、同名待辦修改都需要追問。
- 每月 29～31 日遇到不存在的日子時，預設「跳過該月」，但「每月月底」採每月最後一天；UI 清楚說明。
- 資料庫保存 UTC 時點與 IANA 時區；重複提醒以使用者當地日曆時間計算，避免時區與日光節約時間錯誤。

## 3. 技術架構

- 前端：Astro static output + TypeScript + PWA manifest + service worker；Web Speech API 優先，瀏覽器不支援時維持文字輸入或上傳音訊的備援。
- API：Cloudflare Workers + Hono + TypeScript + Zod；同一個 Worker 可透過 Static Assets 提供編譯後的 PWA，同網域路由簡化 Cookie 與 CORS。
- 資料庫：Cloudflare D1 (SQLite)，所有 SQL 使用 bind 參數，使用 Wrangler migrations。
- 非同步：Cloudflare Queues 處理 LINE webhook 與語音；延遲或需重試任務透過 D1 事件狀態與 Queue retry 協調。
- AI：Gemini API JSON Schema 結構化解析；LINE 音訊使用 Gemini 音訊轉錄，模型名稱寫入環境設定且可替換。
- 排程：Cloudflare Workers Cron Trigger 每分鐘觸發 `scheduled()`；在 UTC 執行，查詢 D1 到期 occurrences。
- 訊息：LINE Messaging API reply message 處理可即時完成的互動，push message 負責排程發送或非同步回覆。
- 驗證：LINE Login OpenID Connect 授權碼流程，檢查 state／nonce／ID Token，伺服器簽發 HttpOnly Secure SameSite Cookie Session。
- LINE Login 與 Messaging API Channel 必須建立在相同 Provider，才能取得可對應的 LINE user ID。使用者仍需加官方帳號為好友才能可靠接收長期推播。

## 4. 資料庫設計

建議使用 6 張資料表。時間以 Unix epoch seconds (UTC) 儲存；`rule_json` 保存原始規則，`next_fire_at_utc` 保存已計算的下一次 UTC 觸發時點。

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  friend_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK(friend_status IN ('unknown','following','blocked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at_utc INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  timezone TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  next_fire_at_utc INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','paused','completed','canceled')),
  origin TEXT NOT NULL CHECK(origin IN ('pwa','line')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE reminder_occurrences (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  scheduled_at_utc INTEGER NOT NULL,
  next_attempt_at_utc INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','retry','sent','acknowledged','failed','canceled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until_utc INTEGER,
  claim_token TEXT,
  line_retry_key TEXT NOT NULL UNIQUE,
  line_message_id TEXT,
  snoozed_from_id TEXT REFERENCES reminder_occurrences(id),
  sent_at_utc INTEGER,
  last_error TEXT,
  UNIQUE(reminder_id, scheduled_at_utc)
);

CREATE TABLE incoming_events (
  webhook_event_id TEXT PRIMARY KEY,
  line_user_id TEXT,
  event_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','queued','processing','processed','failed')),
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  last_error TEXT
);

CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at_utc INTEGER NOT NULL,
  consumed_at_utc INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_reminders_user_status
  ON reminders(user_id, status, next_fire_at_utc);
CREATE INDEX idx_occurrences_due
  ON reminder_occurrences(status, next_attempt_at_utc);
CREATE INDEX idx_occurrences_reminder
  ON reminder_occurrences(reminder_id, scheduled_at_utc DESC);
CREATE INDEX idx_pending_actions_expiry
  ON pending_actions(expires_at_utc);
```

`rule_json` 範例：

```json
{"kind":"once","at_local":"2026-10-19T08:00:00"}
{"kind":"daily","time":"09:00"}
{"kind":"weekly","weekdays":[1,5],"time":"17:00"}
{"kind":"monthly","day_of_month":31,"missing_day":"skip","time":"09:00"}
{"kind":"monthly_last_day","time":"09:00"}
```

星期編碼 `1=星期一 ... 7=星期日`，所有欄位由 Zod 驗證。`reminder_occurrences` 是每次觸發的獨立紀錄，同一排程時間只有一筆。建立重複提醒時只放入下一次 occurrence，觸發時原子地建立再下一次，避免一次產生無限筆資料。

## 5. HTTP API 規格

所有 `/api/*` 除登入與 health 外都必須有有效的 Session，資料查詢一律驗證 `user_id`。POST/PATCH/DELETE 在 Cookie 模式下要實作 CSRF 保護。

| Method | Route | 用途 |
|---|---|---|
| GET | /api/auth/line/start | 產生 LINE Login 授權導向 |
| GET | /api/auth/line/callback | 驗證登入、建立 HttpOnly session |
| POST | /api/auth/logout | 登出、撤銷 session |
| GET | /api/me | 取得登入者及 LINE 加好友狀態 |
| POST | /api/ai/parse | 解析自然語言成動作草稿；不直接修改資料 |
| POST | /api/ai/transcribe | 瀏覽器音訊轉文字備援（大小／時長限制） |
| GET | /api/reminders | 清單，支援 status/limit/cursor |
| POST | /api/reminders | 新增提醒與下一筆 occurrence |
| GET | /api/reminders/:id | 查單筆 |
| PATCH | /api/reminders/:id | 修改標題、規則、暫停／恢復 |
| DELETE | /api/reminders/:id | 軟取消，非物理刪除 |
| GET | /api/occurrences | 查詢發送紀錄與狀態 |
| POST | /api/occurrences/:id/snooze | 延後指定 occurrence，例如 10 分鐘 |
| POST | /api/occurrences/:id/complete | 標記本次完成 |
| POST | /webhooks/line | LINE webhook，驗證原始 body HMAC-SHA256 |
| GET | /health | 健康檢查，不洩漏敏感資訊 |

### 建立提醒範例

`POST /api/reminders`：

```json
{
  "title": "寄報價單給客戶",
  "notes": "確認報價內容與附件",
  "timezone": "Asia/Taipei",
  "rule": {"kind":"weekly","weekdays":[5],"time":"17:00"}
}
```

回傳 `201 Created`：

```json
{
  "id": "rem_...",
  "title": "寄報價單給客戶",
  "status": "active",
  "timezone": "Asia/Taipei",
  "rule": {"kind":"weekly","weekdays":[5],"time":"17:00"},
  "next_fire_at": "2026-10-23T09:00:00Z"
}
```

### AI 解析 API 範例

`POST /api/ai/parse`: `{"text":"每週五下午五點提醒我寄報價單給客戶"}`

```json
{
  "intent": "create",
  "title": "寄報價單給客戶",
  "rule": {"kind":"weekly","weekdays":[5],"time":"17:00"},
  "ambiguities": [],
  "requires_confirmation": true
}
```

AI 可使用 `create/list/update/cancel/snooze/complete/unknown` 動作，但不能直接執行資料庫寫入。需把解析結果交回業務邏輯重新驗證、識別目標任務、授權與確認。時間不明確則返回 `clarification_question`，不得猜測。

API 錯誤統一格式：`{"error":{"code":"INVALID_SCHEDULE","message":"提醒時間需晚於現在"}}`；典型回應碼 400、401、403、404、409、422、429、500。

## 6. LINE 非同步及提醒發送設計

### Webhook
1. 取原始 `request.text()`，以 Messaging API Channel Secret 及 Web Crypto HMAC-SHA256 比對 `x-line-signature`，比較時使用固定時間比較邏輯。
2. 確認有效後才 JSON.parse，檢查事件來源是否為一對一用戶。
3. 以 `webhookEventId` UNIQUE 寫入 `incoming_events`，重送同事件不得重複建立提醒。
4. 推送 Queue 處理，成功回應 `2xx`。如果 Queue 投遞失敗，留下待處理紀錄並回覆失敗促成 webhook 重送；背景補償機制也能檢查 `pending` 事件。
5. LINE 音訊透過 `GET https://api-data.line.me/v2/bot/message/{messageId}/content` 取得；如果回 `202`，延遲重試。音訊限制以產品自訂上限（例如 30 秒、5MB），超出就提示改用文字。
6. 對話結果優先用有效 replyToken 回覆；非同步處理超過可用期限時改用 push message（需納入 LINE 訊息用量）。
7. 確認按鈕使用 10～15 分鐘到期的 `pending_actions.id`，使用者 ID 必須相符，一次性消耗；後端確保重複點擊不會重複新增。

### Cron 到期通知
1. Wrangler Cron `* * * * *`，UTC 每分鐘執行一次。
2. 取待處理的 `pending/retry` occurrences 與到期 lease 的 `processing` occurrences，限制單批數量。
3. 透過有條件的原子 UPDATE 取得 claim token；其它 Worker 不可同時處理同筆。
4. 若為重複提醒，確保下一次 occurrence 與 `reminders.next_fire_at_utc` 原子更新，不能因本次通知失敗就停止未來排程。
5. 呼叫 LINE Push API，**首次發送就帶固定 UUID `X-Line-Retry-Key`**。同一 occurrence 的重試永遠使用相同 key，24 小時內阻擋重複受理。
6. 2xx 代表 LINE 已受理，409 代表同 key 已受理；二者都記成 `sent`（不表示手機確實顯示或使用者已閱讀）。
7. 5xx／逾時採指數退避，最多自動重試預設 5 次，且不超過首發後 24 小時。429 判斷限流與月額度；額度不足時標記失敗並顯示警告，不能無限重試。
8. 修改或取消提醒時，取消尚未送出的 occurrences；對於已經進入 LINE API 發送中的請求，UI 必須告知無法保證撤回。
9. 保留 sent_at、attempts、line_message_id、last_error，方便排障。

## 7. 專案資料夾結構

```text
line-ai-reminder/
├── apps/
│   ├── web/                         # Astro PWA
│   │   ├── public/{manifest.webmanifest,icons/}
│   │   ├── src/
│   │   │   ├── pages/{index.astro,reminders.astro,settings.astro}
│   │   │   ├── components/{VoiceInput,ReminderForm,ReminderList}.tsx
│   │   │   ├── lib/{api-client,speech}.ts
│   │   │   └── styles/global.css
│   │   └── astro.config.mjs
│   └── worker/                      # Cloudflare Worker + Hono
│       ├── src/
│       │   ├── index.ts             # fetch/scheduled/queue handlers
│       │   ├── routes/{auth,me,ai,reminders,occurrences}.ts
│       │   ├── webhooks/line.ts
│       │   ├── queues/line-events.ts
│       │   ├── scheduled/dispatch.ts
│       │   ├── services/{gemini,line,reminders,recurrence}.ts
│       │   ├── repos/{users,reminders,occurrences,events}.ts
│       │   ├── middleware/{auth,csrf,rate-limit}.ts
│       │   └── lib/{time,crypto,errors}.ts
│       ├── migrations/0001_init.sql
│       └── wrangler.jsonc
├── packages/shared/src/{schemas,types,constants}.ts
├── tests/{api,auth,schedules,webhooks,e2e}/
├── .github/workflows/ci.yml
├── .dev.vars.example
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

CI 以 `pnpm lint`、`pnpm typecheck`、`pnpm test` 與 PWA build 為基本門檻。Worker 使用 `@cloudflare/vitest-pool-workers` 或對應的正式推薦測試方式，搭配 Vitest。

## 8. 環境變數、設定與部署

### Secrets（由 Wrangler secret 注入，不進 Git）
- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GEMINI_API_KEY`
- `SESSION_SECRET`

### Variables
- `APP_BASE_URL`：PWA + API 共用正式 HTTPS 網域。
- `DEFAULT_TIMEZONE=Asia/Taipei`
- `GEMINI_TEXT_MODEL` / `GEMINI_AUDIO_MODEL`：可替換的現行支援模型。
- `MAX_AUDIO_SECONDS=30`
- `MAX_AUDIO_BYTES=5242880`

Wrangler binding：`DB`（D1）、`LINE_EVENTS`（Queue producer）、`ASSETS`（靜態資產）；同一 Worker 註冊 Queue consumer 和 Scheduled handler。正式與測試環境使用不同資料庫、LINE Channel 與 API 金鑰。

## 9. 實作步驟與驗收條件

### Milestone 0：官方帳號及雲端資源
- 建立 LINE Provider、LINE Login channel、LINE Messaging API channel（同 Provider）；設定 LINE OA，加為好友。
- 建立 Cloudflare Worker、D1、Queue、Cron、GitHub Repository、Gemini API 金鑰。
- 驗收：Webhook Verify 成功，測試 LINE Push 可收到訊息。

### Milestone 1：專案基礎與驗證
- pnpm workspace、Astro PWA、Hono Worker、Zod、D1 migrations。
- LINE OAuth 登入、Session Cookie、退出登入、綁定好友狀態。
- 驗收：登入後再次開啟 App 身分保留；未授權 API 會得到 401；不能讀取別人的提醒。

### Milestone 2：提醒 CRUD、規則與手機 UI
- Reminder CRUD、UTC／IANA 時區、重複規則運算、列表、編輯、暫停與取消。
- 驗收：PWA 建一筆提醒，重新載入後仍在；每週、每月下一次計算正確。

### Milestone 3：Gemini 與文字入口
- 解析意圖、標題、日期、重複規則；歧義追問；PWA 預覽確認。
- LINE 文字 webhook + Queue + 確認 Postback；待辦查詢／修改／取消。
- 驗收：同一筆提醒能從 PWA 與 LINE 查到，模糊日期不會自行儲存。

### Milestone 4：語音入口
- PWA 使用瀏覽器語音辨識，必要時由後端轉錄；LINE 下載音訊，Gemini transcription。
- 驗收：10～30 秒中文提醒可以轉錄、預覽、建立；無法辨識時可改文字。

### Milestone 5：Cron 通知與回應
- 每分鐘排程、claim/lease、Retry Key、重試、LINE 提醒訊息、完成與延後。
- 驗收：單次不重複發送；重複提醒正常產生下一次；兩次 webhook/cron 同時處理不會建立兩份；模擬 LINE timeout 不會造成重複推播。

### Milestone 6：安全、監控與上線
- CSRF、Webhook 驗簽、速率限制、刪除／留存政策、敏感欄位遮罩、CI 測試、正式部署。
- 驗收：不同使用者完全隔離；不存在秘密金鑰在瀏覽器或 Repo；異常 webhook 被拒絕；LINE 封鎖／額度不足有清楚狀態；手機可安裝 PWA。

## 10. 核心測試案例

1. 「10 分鐘後提醒我喝水」與 PWA/LINE 都能正確解析、確認及通知。
2. 「明天早上 8 點提醒我開會」在台灣時區正確解析；伺服器 UTC 時間正確。
3. 「每週一、四 19:00 運動」產生後續事件；完成本次不取消未來事件。
4. 「每月 31 日」在 2 月依產品規則跳過；「每月月底」落在最後一天。
5. 「明天提醒我」不直接建立，而是詢問具體時間。
6. 「改掉明天的提醒」若有多筆必須先讓使用者選擇。
7. 同一 LINE webhookEventId 重送 3 次只建立一個提醒。
8. 同一 occurrence LINE 5xx 或 timeout 重試使用同一 X-Line-Retry-Key。
9. 使用者取消未發送的提醒，Cron 不再發送；正在送出的請求不可保證撤銷。
10. 已封鎖官方帳號的用戶顯示無法保證推送，而不是假裝成功。
11. 使用者 A 無法透過任一 API 存取使用者 B 的任務。
12. 未帶／錯誤 LINE webhook 簽章應拒絕，不得處理事件。

## 11. 產品與工程決策備註

- `sent` 只表示 LINE API 接受請求，不代表手機已收到或使用者已讀；不要對使用者做秒級或絕對送達保證。
- LINE 主動推播會受官方帳號訊息額度、用戶封鎖及 API 限流影響；正式服務需顯示用量／錯誤。
- 音訊轉錄不預設長期保存原始音檔；日誌避免儲存 LINE token、Cookie 或敏感會話全文。
- AI 不可直接操作資料庫；所有修改均需業務層授權、驗證與確認。
- 後續 v2 可以增加 LINE rich menu、家庭共享、行事曆整合及商業化。

## 12. 官方技術文件

- https://developers.line.biz/en/tips/2026/06/25/provider-design-basics/
- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
- https://developers.line.biz/en/reference/messaging-api/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/audio
