# 你要準備的帳號／金鑰清單

不必為 Milestone 1A 準備正式金鑰；從 LINE 登入整合才開始需要。

## Cloudflare
- [ ] Cloudflare 帳號（https://dash.cloudflare.com/）
- [ ] Workers 專案
- [ ] D1 資料庫（測試／正式可分開）
- [ ] Queues（開發與正式分開）
- [ ] Cron Trigger（`* * * * *`）
- [ ] 取得 D1 `database_id` 等公開配置資訊；帳號秘密資料使用 Wrangler secrets

## LINE
- [ ] LINE Developers（https://developers.line.biz/）
- [ ] 一個 Provider
- [ ] 同 Provider 下的 LINE Login Channel
- [ ] 同 Provider 下的 Messaging API Channel + LINE Official Account
- [ ] 完成 LINE Login Callback URL 設定
- [ ] 完成 Webhook HTTPS URL 設定
- [ ] 將官方帳號加為好友，用自己的 LINE 實機測試
- [ ] 使用 Secrets 管理 Login Secret、Messaging Channel Secret、Channel Access Token

## Gemini
- [ ] Google AI Studio（https://aistudio.google.com/）
- [ ] 建立 Gemini API Key，使用 Wrangler secret 設定 `GEMINI_API_KEY`

## GitHub / Codex
- [ ] 建議建立 Private repository `line-ai-reminder`
- [ ] 將套件內 5 個 Markdown 檔放到 repo 根目錄
- [ ] 在該 repo / 資料夾開啟 Codex，貼上 `CODEX_START_HERE.md` 的第一段指令
- [ ] 檢視改動與測試；驗收通過後，再要求下一階段

## 預估免費版限制提醒
- Cloudflare D1 免費額度：帳號總儲存上限 5 GB；單資料庫上限目前 500 MB，其他使用量限制請以 Cloudflare 官方為準。
- Cloudflare Queues 目前包含於 Workers Free 方案，基本免費額度是每日 10,000 operations，免費保留期 24 小時。
- LINE Messaging API 推播受官方帳號訊息額度與費率限制；不要因為雲端資料庫免費，就假設整套服務完全沒有費用。
