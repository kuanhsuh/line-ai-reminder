# 如何開始使用 Codex

## 1. 建立 GitHub 專案（可先做本機專案）
建議名稱：`line-ai-reminder`，設為 Private。將此壓縮檔內的 `AGENTS.md`、`PRD.md`、`CODEX_START_HERE.md`、`MILESTONES.md`、`SETUP_CHECKLIST.md` 放在專案根目錄。Codex 應在此專案／資料夾中啟動。

## 2. 直接貼給 Codex 的第一段指令

> 這是新的 LINE AI 提醒助手專案。請先完整閱讀根目錄的 `AGENTS.md`、`PRD.md`、`MILESTONES.md` 和 `SETUP_CHECKLIST.md`。我們採用 C 方案（Astro PWA + LINE 官方帳號雙入口），資料庫固定為 Cloudflare D1。**現在只實作 Milestone 1A：專案骨架與可在本機運作的提醒 CRUD，不要部署，不要替我建立付費資源，也不要開始 LINE Login、Gemini 或 LINE Webhook 真實串接。**
>
> 需求：
> 1. 建立 pnpm workspace：`apps/web`（Astro + TypeScript，手機優先）、`apps/worker`（Cloudflare Workers + Hono）、`packages/shared`（Zod schema）。
> 2. 初始化 D1 SQL migration，依 PRD 的 6 張資料表建立主鍵、外鍵、唯一約束和索引，新增 `wrangler.jsonc` 範例設定與本機資料庫執行指令；勿硬編任何正式 ID 或 Token。
> 3. 先完成提醒 CRUD、清單、暫停與取消，以及 next_fire_at 計算。對於尚未串接 LINE Login 的本機開發，建立 **僅限 dev/test 環境** 的 mock 登入身分，正式環境必須禁止 mock 模式。
> 4. 建立繁體中文手機 UI：提醒清單、新增／編輯表單、重複規則設定、錯誤提示；暫時以文字輸入為主。
> 5. 寫好日期計算、CRUD/授權隔離、D1 migrations 的單元或整合測試；支援 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
> 6. 提供 `.dev.vars.example`（只有變數名稱，沒有真實值）、`.gitignore`、`README.md` 與本機啟動步驟。
> 7. 完成後執行可以執行的測試，列出你修改的檔案、驗收結果、不能執行的測試、下一階段要我準備的帳號設定；**完成 Milestone 1A 後停止，不要繼續其他階段。**
>
> 發現 PRD 技術細節相互衝突時，以可測試、安全、Cloudflare Workers 實際相容為原則提出最小修正，並先在報告中註明。

## 3. 下一階段依序委派
- **1B 身分驗證**：完成 LINE Login OAuth/OIDC（同 Provider）、安全 session、好友／封鎖狀態；使用測試 Channel 資訊，正式金鑰透過 Secrets 注入。
- **2 AI 文字理解**：串接 Gemini Structured Outputs，日期／時區／歧義測試；使用者確認後才寫入。
- **3 LINE 雙向文字**：Webhook 驗簽、Queues、聊天查詢／新增／修改／取消、Postback 一次性確認。
- **4 語音**：PWA 語音與 LINE 音訊轉錄，限制檔案大小／時長。
- **5 排程與發送**：D1 occurrence、Cron、固定 retry key、LINE push、完成及延後。
- **6 上線**：安全檢查、正式測試、監控、部署；需使用者明確核准雲端操作。

## 4. 注意
- `AGENTS.md` 是 Codex 的持續性專案規則；`PRD.md` 是完整產品規格；第一段指令只會讓 Codex 做 Milestone 1A。
- Codex 不會因為有規格書就自動取得你的 LINE、Cloudflare、Google AI 帳號權限。你仍然必須建立 Channel、D1、Queue、設定 redirect URI、Webhook URL、Secrets。
- 資料庫 D1 是 Cloudflare 的雲端 SQLite，並不是把 SQL 寫完就自動有線上服務；本機使用 Wrangler local D1，正式環境再建立遠端 D1 並執行 migration。
- 功能是否可用以實際測試為準，不以 Codex 表示「完成」為唯一標準。
