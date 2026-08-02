import type { WeeklyBusinessHour } from '../types/models';

/**
 * 以今天為中心，往前後各取 N 個**營業日**。
 *
 * 「往前後各三天」若照日曆日計算，遇到店休就會少看到幾天的行程 ——
 * 週一店休的工作室在週日打開後台，往後三天只會看到兩天有內容。
 * 因此改以營業日計算，遇到店休往後延。
 *
 * ⚠️ **只考慮每週固定的店休**（`settings/businessHours` 的 weekly）。
 * 單日例外（`businessHourOverrides`，臨時公休或加班）不在計算內 ——
 * 後端沒有提供查詢某區間所有單日例外的 API。這在實務上影響很小：
 * 臨時公休那天本來就不該有預約，多顯示一天空的也不礙事。
 *
 * @param weekly 每週營業設定，恰好 7 筆
 * @param spanDays 前後各取幾個營業日
 * @param today 基準日，預設今天。傳入是為了可測試
 */
export function businessDayRange(
  weekly: WeeklyBusinessHour[],
  spanDays = 3,
  today = new Date()
): { from: Date; to: Date } {
  const openOn = buildOpenMap(weekly);

  const from = new Date(today);
  from.setHours(0, 0, 0, 0);

  const to = new Date(today);
  to.setHours(23, 59, 59, 999);

  // 今天無論是否營業都算在範圍內 —— 使用者打開後台就是想看今天
  stepBusinessDays(from, -1, spanDays, openOn);
  stepBusinessDays(to, 1, spanDays, openOn);

  return { from, to };
}

/**
 * 從 date 往指定方向移動，直到累積 count 個營業日。
 *
 * 全年無休或設定異常（完全沒有營業日）時會退化成日曆日，
 * 並以 `MAX_STEPS` 為上限避免無窮迴圈 —— 若 weekly 全部關閉，
 * 沒有這個上限就會永遠找不到下一個營業日。
 */
function stepBusinessDays(
  date: Date,
  direction: 1 | -1,
  count: number,
  openOn: boolean[]
): void {
  const MAX_STEPS = 60;
  let found = 0;
  let steps = 0;

  while (found < count && steps < MAX_STEPS) {
    date.setDate(date.getDate() + direction);
    steps++;
    if (openOn[date.getDay()]) found++;
  }

  // 完全找不到營業日時，至少退回單純的日曆日，不要回傳一個離譜的區間
  if (found < count) {
    date.setDate(date.getDate() + direction * (count - found));
  }
}

function buildOpenMap(weekly: WeeklyBusinessHour[]): boolean[] {
  const open = [false, false, false, false, false, false, false];

  // 設定尚未載入時視為全年無休，避免第一次渲染就把範圍算成空的
  if (!weekly || weekly.length === 0) return open.map(() => true);

  weekly.forEach((day) => {
    if (day.weekday >= 0 && day.weekday <= 6) open[day.weekday] = Boolean(day.enabled);
  });

  return open.some(Boolean) ? open : open.map(() => true);
}
