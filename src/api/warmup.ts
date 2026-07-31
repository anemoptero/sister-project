import { callApi } from './client';

/**
 * 預先喚醒 Apps Script 執行個體。
 *
 * 實測數據（`ping` 這支不碰 Firestore 的 API）：
 *
 * ```
 * 閒置後第一次   3.4 ～ 14.2 秒
 * 連續呼叫       1.1 ～ 1.7 秒
 * ```
 *
 * 差距全來自冷啟動。因此在 App 啟動時先送一次 ping，讓使用者在讀畫面、
 * 點按鈕、跳去 LINE 登入的這段時間裡把執行個體喚醒 —— 等到真正需要
 * 資料時就是熱的。
 *
 * ⚠️ 這不是萬靈丹：若真正的請求緊接著 ping 送出（例如已登入者直接開
 * 後台頁），兩者幾乎同時，喚醒來不及生效。它主要改善的是「開啟頁面
 * 之後隔幾秒才動作」的情境，而登入流程正好是這種。
 */

let warmed = false;

export function warmUpApi(): void {
  // 一次瀏覽只需要一次。重複送只是徒增請求
  if (warmed) return;
  warmed = true;

  // 刻意不 await、不處理結果：這是純粹的副作用，失敗了也不該
  // 影響任何畫面。逾時設短一點，避免在網路不通時佔著連線。
  void callApi('ping', {}, { timeoutMs: 15000 }).catch(() => {
    // 喚醒失敗不需要告訴使用者 —— 他們沒有要求做這件事
  });
}
