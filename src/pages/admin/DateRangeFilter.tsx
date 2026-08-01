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
 * 篩選控制項集中在圖表與清單上方一列，切換條件時不需要在頁面裡找。
 */
export function DateRangeFilter({ value, onChange, children }: Props) {
  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    onChange({ from: toIso(from), to: toIso(to) });
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
            value={isoToLocalInput(value.from)}
            onChange={(e) => onChange({ ...value, from: localInputToIso(e.target.value) })}
          />
        </div>

        <div className="field">
          <label htmlFor="range-to">迄</label>
          <input
            id="range-to"
            type="datetime-local"
            value={isoToLocalInput(value.to)}
            onChange={(e) => onChange({ ...value, to: localInputToIso(e.target.value) })}
          />
        </div>

        {children}
      </div>
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
