/**
 * 把游標分頁的清單 API 一次抓完。
 *
 * ## 為什麼是「一次抓完 + 前端分頁」而不是後端分頁
 *
 * Apps Script 的呼叫開銷是熱 1.1～1.7 秒、冷 3.4～14.2 秒，而且**與回傳
 * 筆數幾乎無關**。在這個平台上，減少往返次數遠比減少單次資料量重要 ——
 * 所以後端單次上限調到 1000，正常情況下一次就抓得完。
 *
 * 還有一個非顯而易見的理由：**後台的統計是在前端算的**。
 * 例如「待收款總額」是把抓回來的訂單加總。若改成後端分頁、每次只抓一頁，
 * 那個數字就只會是當頁的總和，而且**不會有任何錯誤跡象** —— 畫面照常
 * 顯示一個看起來合理的金額。
 *
 * 一次抓完之後，「畫面顯示幾筆」與「JS 加總的範圍」是兩件互不相干的事，
 * 統計自然正確。
 *
 * ## 這個設計的天花板
 *
 * 資料量成長後會失效。重新評估的時機：
 *
 * - 會員數超過 1000，或
 * - 單次日期區間內的預約超過 1000，或
 * - 後台任一頁的載入時間超過 10 秒
 *
 * 屆時要改成後端分頁 + 後端搜尋，而且**統計必須同時改為後端計算**。
 * 這是可預期的技術債，不是設計缺陷 —— 個人工作室的資料量在可見的未來
 * 都不會到那個規模，現在做後端分頁是過度設計。
 */

/** 每頁筆數。分頁只影響渲染，不影響統計與搜尋的資料範圍 */
export const PAGE_SIZE = 50;

/**
 * 游標迴圈的圈數上限。
 *
 * 後端異常時 `nextCursor` 可能永遠不為 null（例如每次都回滿一頁）。
 * 沒有這道保險的話，畫面會卡在載入中而且無聲地打爆 API 配額。
 * 10 圈 × 1000 筆 = 10000 筆，遠超過這個系統的預期資料量。
 */
const MAX_PAGES = 10;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * 反覆呼叫 `fetchPage` 直到沒有下一頁。
 *
 * @param fetchPage 接收游標（首次為 `null`），回傳該頁資料與下一頁游標
 * @returns 所有頁面串接後的完整陣列
 */
export async function fetchAll<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const page: Page<T> = await fetchPage(cursor);
    out.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < MAX_PAGES);

  return out;
}

/** 取出目前這一頁要渲染的項目。`page` 從 1 起算 */
export function pageSlice<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

/** 總頁數。空清單時回 1，避免畫面出現「第 1 頁，共 0 頁」 */
export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
