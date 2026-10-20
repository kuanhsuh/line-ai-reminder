# LINE AI Reminder（Milestone 1A）

Astro 靜態 PWA、Cloudflare Worker API 與 Cloudflare D1 的本機提醒管理版本。可新增、查詢、編輯、暫停、恢復及軟取消提醒；支援單次、每天、每週指定星期、每月指定日期及每月最後一天。此階段**不會發送 LINE 訊息**，也沒有 LINE Login、Gemini 或 Webhook 串接。

## 環境與啟動

需要 Node.js 22 以上、pnpm 11。專案根目錄執行：

```sh
pnpm install
pnpm dev
```

`pnpm dev` 會先建置 Astro、套用 Wrangler **本機** D1 migration，再啟動本機 Worker。開啟 <http://localhost:8787>。頁面可在「使用者 A／B」間切換，兩者資料互不相通；資料存放在 `apps/worker/.wrangler/`，重新啟動仍會保留。若要清空本機資料，可在停止服務後刪除該資料夾，再次執行 `pnpm dev`。

也可單獨執行 `pnpm db:migrate`。此命令只操作 Wrangler local D1；`apps/worker/wrangler.jsonc` 的全零 `database_id` 僅供本機使用，不能用於遠端。正式環境要由使用者建立 D1 後換成該環境 ID。

### 本機測試身分與安全界線

`pnpm dev` 透過 `wrangler dev --local --var LOCAL_MOCK_AUTH:1` 啟用 mock 身分，API 僅在 URL 主機為 `localhost` 或 `127.0.0.1` 時接受 `demo-a`、`demo-b`。API 寫入須附同來源 `Origin` 與 JSON Content-Type。此版本尚無真實 session；沒有 mock 開關時所有 `/api/*` 回傳 401。**不要將 `LOCAL_MOCK_AUTH` 放進部署設定或遠端環境。** 真實登入與 HttpOnly session 屬於 Milestone 1B。

## 驗證

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 會建置前端，在暫存目錄套用真正的 Wrangler local D1 migration，啟動本機 Worker，測試提醒 API／使用者隔離／occurrence，以及時區、月底和夏令時間規則。`pnpm build` 的 Worker 步驟是 `wrangler deploy --dry-run`，**不會部署**。

## 專案結構

- `apps/web`：繁體中文手機介面、Astro 靜態站、PWA manifest 與 service worker。
- `apps/worker`：Hono API、重複排程計算、D1 migration 與 Wrangler 本機設定。
- `packages/shared`：共用 Zod 請求與排程規則 schema。
- `tests`：排程單元測試和本機 D1／API 整合測試。

D1 的六張表依 `PRD.md` 建立。每筆提醒建立時只新增一筆下一次待發 occurrence；目前沒有 Cron 發送，因此不會自動建立再下一筆。時間以使用者 IANA 時區的當地日曆計算，精確時點存成 UTC Unix seconds。每月 29～31 日遇到不存在日期會跳過該月；每月最後一天使用該月實際末日。夏令時間不存在的當地時刻會向前調整，重複的時刻取較早一次。UI 顯示的「下次」是排程時間，並非已送達通知。

## 下一階段由你準備的設定（目前不需要金鑰）

1. 在 Cloudflare 建立測試用 Worker、D1；未來 Queue 與 Cron 也分開設測試／正式環境。將測試 D1 的 ID 填入對應的 Wrangler 部署設定，先確認 migration。此專案不會自行建立或部署雲端資源。
2. 在 LINE Developers 建立同一個 Provider 下的 LINE Login Channel 與 Messaging API Channel，並建立 LINE Official Account；測試 Callback／Webhook URL 應使用未來的 HTTPS 測試網址。
3. 在 Google AI Studio 建立 Gemini API Key，等 AI 文字階段再使用。
4. Secrets 請透過 `wrangler secret put` 注入對應環境。本機需測試正式整合時，才將 `.dev.vars.example` 複製為不追蹤的 `.dev.vars` 並填入本機測試值。不要把金鑰貼到聊天或提交 Git。

`SETUP_CHECKLIST.md` 有完整帳號清單。請先驗收本機 1A，再安排 1B LINE Login。
