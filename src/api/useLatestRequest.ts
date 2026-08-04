import { useCallback, useRef } from 'react';

/**
 * 請求序號守衛。
 *
 * ## 在防什麼
 *
 * 使用者連按兩次「近 7 天 / 近 30 天」時會發出兩個並行請求。Apps Script
 * 每次呼叫要 1～14 秒且**回應順序不保證**，較早送出的那個很可能晚回，
 * 於是畫面顯示的是上一個區間的資料，而篩選器上寫著新的區間。
 *
 * 沒有任何錯誤跡象 —— 數字看起來都很正常，只是不對。
 *
 * ## 用法
 *
 * ```ts
 * const isLatest = useLatestRequest();
 * const load = useCallback(async () => {
 *   const check = isLatest();
 *   const data = await callApi(...);
 *   if (!check()) return;   // 已經有更新的請求送出，這份結果丟掉
 *   setRows(data.rows);
 * }, [isLatest]);
 * ```
 *
 * 刻意不用 `AbortSignal` 取消舊請求：Apps Script 那一端不會因此少跑，
 * 而且取消會讓 client 拋 `NETWORK_ERROR`，呼叫端還得再分辨那是不是
 * 自己造成的。丟棄結果單純得多。
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0);

  return useCallback(() => {
    seq.current += 1;
    const mine = seq.current;
    return () => seq.current === mine;
  }, []);
}
