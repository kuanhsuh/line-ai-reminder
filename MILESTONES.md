# 分階段開發與驗收清單

## Milestone 1A：本機骨架、D1 schema、CRUD、PWA
- [ ] pnpm monorepo，Astro + Hono + shared Zod package 可 build
- [ ] 6 張 D1 資料表 migration 可在 Wrangler local 套用
- [ ] CRUD + 暫停／取消 + 列表、dev-only mock 身分隔離
- [ ] UI 可在手機尺寸操作，繁中顯示
- [ ] 時區與 one-time / daily / weekly / monthly 規則測試
- [ ] lint/typecheck/test/build 有可重現的結果
- [ ] 未部署、不使用正式 secrets

## Milestone 1B：LINE Login
- [ ] 同 Provider 下建立 Login + Messaging API channel
- [ ] 完整 OIDC code/state/nonce/ID token 驗證
- [ ] HttpOnly / Secure / SameSite session，CSRF 防護
- [ ] 多使用者資料隔離測試

## Milestone 2：AI 文字解析
- [ ] Gemini Structured Outputs + Zod
- [ ] 解析一次性、每天、每週、每月時間
- [ ] 時間不確定時追問，不自動儲存
- [ ] 使用者明確確認才寫入 D1

## Milestone 3：LINE 雙向文字
- [ ] 原始 body 驗 HMAC；無效請求拒絕
- [ ] 重複 webhookEventId 不重複建立
- [ ] Queue 非同步與失敗補償
- [ ] Postback 綁定使用者、短期到期、一次性消耗

## Milestone 4：語音
- [ ] PWA Web Speech API 支援或文字備援
- [ ] LINE 音訊安全下載、限制大小、轉錄
- [ ] 轉錄文字進入同一 AI 解析與確認流程

## Milestone 5：定時提醒
- [ ] Cron 每分鐘檢查 D1 到期 occurrences
- [ ] claim/lease 防止多 Worker 重複執行
- [ ] LINE 推播成功／失敗／重試紀錄
- [ ] 同 occurrence 重試採相同 X-Line-Retry-Key
- [ ] 完成與延後 10 分鐘不破壞重複排程

## Milestone 6：部署
- [ ] Cloudflare D1 / Queue / Worker 正式設定完成
- [ ] 手機 PWA 可安裝並經過實機測試
- [ ] 日誌隱藏敏感資料、速率限制、權限、重放攻擊測試
- [ ] LINE 加好友／封鎖／配額不足狀況有明確回饋
- [ ] 使用者核准後才部署正式環境
