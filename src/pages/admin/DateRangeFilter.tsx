import { useEffect, useState } from 'react';
import { isoToLocalInput, localInputToIso } from '../../utils/datetime';

export interface DateRange {
  from: string;
  to: string;
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  children?: React.ReactNode;
}

/** 常用區間。後端未指定時預設最近 30 天，這裡與之對齊 */
const PRESETS: { label: string; days: number }[] = [
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 },
  { label: '近 90 天', days: 90 }
];

/**
 * 日期區間篩選，訂單／預約／統計三頁共用。
 *
 * ## 為什麼手動輸入是 onBlur 而不是 onChange
 *
 * `<input type="datetime-local">` 在使用者還沒打完時就會觸發 change，
 * 而且**值不完整時瀏覽器回傳空字串**。綁在 onChange 上的話，改個日期的
 * 過程中會先送出一次 `from: ''` 的查詢 —— 那不只是浪費一次 1～14 秒的
 * 往返，回來的還是錯的區間。
 *
 * 改用本地 state 承接輸入、離開欄位（或按 Enter）才往上送。
 *
 * 與此搭配的是呼叫端的 `useLatestRequest` —— 這裡只減少請求次數，
 * 「舊請求晚回蓋掉新結果」要由那個守衛處理。
 */
export function DateRangeFilter({ value, onChange, children }: Props) {
  const [fromInput, setFromInput] = useState(() => isoToLocalInput(value.from));
  const [toInput, setToInput] = useState(() => isoToLocalInput(value.to));

  // 外部改變區間（按預設按鈕、或呼叫端重設）時要跟著同步，
  // 否則輸入框會停在使用者上次手動打的值
  useEffect(() => {
    setFromInput(isoToLocalInput(value.from));
    setToInput(isoToLocalInput(value.to));
  }, [value.from, value.to]);

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    onChange({ from: toIso(from), to: toIso(to) });
  }

  /**
   * 送出手動輸入的區間。
   *
   * 兩邊都必須有值才送 —— 空字串會被後端當成「沒給」而套用預設的近 30 天，
   * 畫面卻顯示著使用者正在編輯的那個日期，兩者對不上。
   * 值沒變也不送，避免每次點過欄位都重新查一次。
   */
  function commit(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;

    const from = localInputToIso(nextFrom);
    const to = localInputToIso(nextTo);
    if (!from || !to) return;
    if (from === value.from && to === value.to) return;

    onChange({ from, to });
  }

  return (
    <div className="filter-bar">
      <div className="chip-group">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.days}
            className="chip"
            onClick={() => applyPreset(preset.days)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="filter-fields">
        <div className="field">
          <label htmlFor="range-from">起</label>
          <input
            id="range-from"
            type="datetime-local"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            onBlur={() => commit(fromInput, toInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(fromInput, toInput);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="range-to">迄</label>
          <input
            id="range-to"
            type="datetime-local"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            onBlur={() => commit(fromInput, toInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(fromInput, toInput);
            }}
          />
        </div>

        {children}
      </div>

      <p className="hint">日期改好後點一下別處，或按 Enter 套用。</p>
    </div>
  );
}

/** 預設區間：最近 30 天，與後端 `parseStatsRange_` 的預設一致 */
export function defaultRange(days = 30): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: toIso(from), to: toIso(to) };
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return localInputToIso(local);
}
