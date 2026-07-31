/**
 * 顯示格式化。
 *
 * 金額一律是整數（新台幣元），後端不使用浮點數儲存金額
 * （`docs/AGENT_GUIDE.md` §8.3），所以這裡也不做小數處理。
 */

export function formatPrice(amount: number): string {
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
