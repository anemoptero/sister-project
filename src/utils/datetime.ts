/**
 * `<input type="datetime-local">` 與後端 ISO 字串之間的轉換。
 *
 * 兩邊的格式不同，而且**差異是隱形的**：
 *
 * ```text
 * datetime-local 的值   2026-08-01T00:00        沒有時區
 * 後端儲存的格式        2026-08-01T00:00:00+08:00
 * ```
 *
 * 直接把前者丟給後端，或用 `toISOString()`（會轉成 UTC 的 Z 格式）送出，
 * 都會讓時間悄悄偏移八小時 —— 而畫面上看起來完全正常，只有到期日突然
 * 早一天失效時才會發現。
 *
 * 資料模型要求 ISO 字串帶時區偏移，見 `docs/AGENT_GUIDE.md` §8.2。
 */

/**
 * 本地輸入值 → 帶時區偏移的 ISO 字串。
 *
 * 用瀏覽器當下的時區偏移，而不是寫死 `+08:00`：管理員若在國外操作，
 * 他輸入的「下午三點」本來就是指他當地的三點，寫死台北時區反而會錯。
 *
 * @param local `YYYY-MM-DDTHH:mm`（datetime-local 的值）
 * @return ISO 字串，或空字串（輸入為空或格式不合）
 */
export function localInputToIso(local: string): string {
  if (!local) return '';

  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return '';

  // getTimezoneOffset 回傳的是「UTC 減本地」的分鐘數，
  // 所以東八區得到 -480，符號與 ISO 偏移相反，這裡要轉回來
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);

  return (
    `${local.length === 16 ? `${local}:00` : local}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/**
 * ISO 字串 → 本地輸入值。
 *
 * 用各欄位分別取值而非切字串：後端可能回傳 `Z` 結尾或不同偏移，
 * 直接截前 16 個字元會顯示成錯誤的時間。
 */
export function isoToLocalInput(iso: string): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
