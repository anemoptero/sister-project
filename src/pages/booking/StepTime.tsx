import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import type { AvailableDay } from '../../types/models';
import { formatDuration } from '../../utils/format';

interface Props {
  totalDurationMinutes: number;
  startAt: string;
  /** 衝突時後端指出的那一格，用來標記出來 */
  conflictSlotStartAt: string;
  onSelect: (startAt: string) => void;
  onBack: () => void;
  onNext: () => void;
  /** 讓上層能在下單失敗後要求重新查詢 */
  reloadKey: number;
}

/** 一次查兩週。上限 31 天，但查太多天回應會變慢且顧客也看不完 */
const DAYS = 14;

/**
 * 步驟二：選擇時間。
 *
 * 送出的是**總時長**，後端回傳「這個時長塞得進去的所有起點」——
 * 因此服務組合一有變動就必須重查，否則會拿舊時長算出的時段去預約新的組合。
 */
export function StepTime({
  totalDurationMinutes,
  startAt,
  conflictSlotStartAt,
  onSelect,
  onBack,
  onNext,
  reloadKey
}: Props) {
  const [days, setDays] = useState<AvailableDay[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setDays(null);
    try {
      const data = await callApi('listAvailableTimes', {
        totalDurationMinutes,
        days: DAYS
      });
      setDays(data.days);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入可預約時間失敗。');
    }
  }, [totalDurationMinutes]);

  // totalDurationMinutes 或 reloadKey 變動時重查。
  // 前者是服務組合改了，後者是下單撞到別人先搶走時段
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const openDays = (days ?? []).filter((day) => !day.closed && day.times.length > 0);

  return (
    <div className="stack">
      <div>
        <h2>選擇時間</h2>
        <p className="hint">
          你選的服務共需 {formatDuration(totalDurationMinutes)}，
          以下是這段時間排得進去的起始時間。
        </p>
      </div>

      {/* 從確認頁被退回來時說明原因，並強調其他選擇都還在 ——
          否則顧客會以為整筆預約作廢了 */}
      {conflictSlotStartAt && (
        <p className="notice">
          你剛才選的時段已經被其他客人預約了，請改選一個時間。
          <strong>你選的服務與優惠券都還保留著</strong>，選好時間就能直接送出。
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {days === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {days && openDays.length === 0 && !error && (
        <div className="empty-state">
          <h2>這兩週沒有可預約的時間</h2>
          <p>可能是時段都被預約了，或這段時間的服務時長排不進營業時間內。</p>
          <p className="hint">可以試著減少服務項目，或稍後再來查看。</p>
        </div>
      )}

      {openDays.map((day) => (
        <section key={day.date} className="day-block">
          <h3>{formatDayLabel(day.date)}</h3>
          <div className="time-grid">
            {day.times.map((time) => {
              const isConflict = time.startAt === conflictSlotStartAt;
              return (
                <button
                  type="button"
                  key={time.startAt}
                  className={`time-slot${time.startAt === startAt ? ' is-selected' : ''}${
                    isConflict ? ' is-conflict' : ''
                  }`}
                  onClick={() => onSelect(time.startAt)}
                  aria-pressed={time.startAt === startAt}
                >
                  <span className="time-start">{formatTime(time.startAt)}</span>
                  {/* 顯示實際結束時間而非取整後的佔用時間，
                      顧客在意的是「幾點可以走」 */}
                  <span className="hint">至 {formatTime(time.endAt)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="summary-bar">
        <button type="button" className="secondary" onClick={onBack}>
          上一步
        </button>
        <button type="button" onClick={onNext} disabled={!startAt}>
          下一步
        </button>
      </div>
    </div>
  );
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;

  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日（週${weekday}）`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
