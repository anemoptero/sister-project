# sister-project

簡易工作室預約系統 — React SPA 前端。

後端 API 為 Google Apps Script Web App，資料庫為 Firebase Firestore。
完整規格請見 root 的 `docs/`：`DEV_PLAN.md`、`DATA_MODEL.md`、`API_SPEC.md`、`AGENT_GUIDE.md`。

## 技術

- React 19 + TypeScript
- Vite 6（Node 20.11 尚未達到 Vite 7 要求的 20.19，故停留在 v6）
- React Router 7，使用 **HashRouter**

GitHub Pages 是靜態託管，沒有伺服器端 rewrite，BrowserRouter 重新整理子路由會 404。
第一階段用 HashRouter 迴避此問題，`vite.config.ts` 的 `base` 設為 `'./'`，
部署在任何 `/<repo-name>/` 子路徑下都能正確載入資源。

## 開發

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build
npm run preview
```

## 環境變數

複製 `.env.example` 為 `.env.local` 後填值。

⚠️ Vite 的 `VITE_` 前綴變數會被打包進 bundle，屬於**公開值**。
LINE Channel Secret、Firebase service account key 等機密一律存放於
Apps Script 指令碼屬性（PropertiesService），絕不可放進前端。

## 安全邊界

前端不得決定：產品正式價格、優惠券折扣、訂單 `finalAmount`、使用者 role、
管理員權限、優惠券是否已核銷、預約是否成功。以上全部由 Apps Script API 重新驗證計算。

前端**不直接連線 Firestore**，`firestore.rules` 為 deny all。

## 已知 npm audit 警告

`react-router` GHSA-qwww-vcr4-c8h2（RSC Mode CSRF）目前在 7.x 線上沒有已發布的修正版，
`npm audit fix --force` 會把版本降回 7.11.0 —— 那個版本反而帶有 14 個 advisory，因此不要照做。

本專案為純 client-side SPA，使用 HashRouter，沒有 server、沒有 actions、沒有 RSC，
不在該漏洞的觸發路徑上。待官方發布修正版後再升級。
