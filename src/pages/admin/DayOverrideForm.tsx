import { useState, type FormEvent } from 'react';
import { callApi, isApiError } from '../../api/client';

type OverrideMode = 'closed' | 'custom' | 'clear';

const MODE_LABELS: Record<OverrideMode, string> = {
  closed: '這天公休',
  custom: '這天使用特殊營業時間',
  clear: '清除例外，恢復每週設定'
};

/**
 * 單日營業例外。
 *
 * 優先於每週設定，用於臨時公休或特殊營業時間。
 *
 * ⚠️ 改成公休**不會自動取消既有預約** —— 那需要人工聯繫顧客改期，
 * 系統只回報受影響的預約筆數供管理員判斷。這是刻意的：自動取消會讓
 * 客人在毫無預警下失去預約。
 */
export function DayOverrideForm() {
  const [date, setDate] = useState('');
  const [mode, setMode] = useState<OverrideMode>('closed');
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('20:00');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState('');
  const [affected, setAffected] = useState(0);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult('');
    setAffected(0);

    if (!date) {
      setError('請選擇日期。');
      return;
    }
    if (mode === 'custom' && openTime >= closeTime) {
      setError('開店時間必須早於打烊時間。');
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        mode === 'clear'
          ? { date, clear: true }
          : mode === 'closed'
            ? { date, closed: true, note }
            : { date, closed: false, openTime, closeTime, note };

      const data = await callApi('adminSetDayOverride', payload);

      setResult(
        mode === 'clear'
          ? `${date} 的例外已清除，恢復每週設定。`
          : mode === 'closed'
            ? `${date} 已設為公休。`
            : `${date} 的營業時間已設為 ${openTime}–${closeTime}。`
      );
      setAffected(data.existingAppointmentCount ?? 0);
    } catch (err) {
      setError(isApiError(err) ? err.message : '設定失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 'var(--space-5)' }}>
      <h2>單日例外</h2>
      <p className="hint">
        臨時公休或特殊營業時間。單日設定優先於上方的每週設定。
      </p>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ov-date">日期</label>
            <input
              id="ov-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="ov-mode">設定為</label>
            <select
              id="ov-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as OverrideMode)}
            >
              {(Object.keys(MODE_LABELS) as OverrideMode[]).map((value) => (
                <option key={value} value={value}>
                  {MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div />
        </div>

        {mode === 'custom' && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="ov-open">開店</label>
              <input
                id="ov-open"
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ov-close">打烊</label>
              <input
                id="ov-close"
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
            <div />
          </div>
        )}

        {mode !== 'clear' && (
          <div className="field">
            <label htmlFor="ov-note">備註</label>
            <input
              id="ov-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：員工旅遊"
              maxLength={200}
            />
            <p className="hint">只有後台看得到，不會顯示給顧客。</p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {result && (
          <>
            <p className="success">{result}</p>
            {affected > 0 && (
              <p className="notice">
                這天已經有 <strong>{affected}</strong> 筆預約，
                系統<strong>不會自動取消</strong>它們。請主動聯繫這些顧客安排改期 ——
                在「預約查詢」頁可以查到名單。
              </p>
            )}
          </>
        )}

        <div className="actions">
          <button type="submit" disabled={submitting}>
            {submitting ? '套用中…' : '套用'}
          </button>
        </div>
      </form>
    </section>
  );
}
