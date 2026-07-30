/// <reference types="vite/client" />

/**
 * ⚠️ `VITE_` 前綴的變數會被打包進 bundle，**任何人都能從瀏覽器讀到**。
 * 這裡只能放公開值。LINE Channel Secret、Firebase service account key
 * 一律存 Apps Script 指令碼屬性，見 docs/SETUP_SECRETS.md。
 */
interface ImportMetaEnv {
  /** Apps Script Web App 部署網址。重新 deploy 會換網址，需同步更新 */
  readonly VITE_APPS_SCRIPT_URL?: string;
  /** LINE Developers → LINE Login channel → LIFF 分頁取得 */
  readonly VITE_LIFF_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
