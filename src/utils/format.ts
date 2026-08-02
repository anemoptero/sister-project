/**
 * 顯示格式化。
 *
 * 金額一律是整數（新台幣元），後端不使用浮點數儲存金額
 * （`docs/AGENT_GUIDE.md` §8.3），所以這裡也不做小數處理。
 */

/**
 * 金額顯示。
 *
 * 收到非數字時回傳「—」而不是拋錯或顯示 0。
 *
 * 兩者都不行的理由不同：拋錯會讓整頁白畫面（實際發生過 —— 後端欄位叫
 * `revenue`、前端型別誤寫成 `totalSales`，統計頁整個掛掉）；顯示 0 則更糟，
 * 那是把「沒有資料」謊報成「金額為零」，經營者看不出哪裡不對。
 *
 * 「—」讓缺漏看得見，但不會拖垮整個畫面。
 */
export function formatPrice(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

/**
 * 分鐘轉成好讀的時長。
 *
 * 療程動輒 90、150 分鐘，直接顯示「150 分鐘」要顧客自己換算，
 * 顯示「2 小時 30 分」才一眼看得出要待多久。
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分`;
}

/** ISO 字串轉本地時間顯示。後端一律以 +08:00 的 ISO 字串儲存 */
export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}
