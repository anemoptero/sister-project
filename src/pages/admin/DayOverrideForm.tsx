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
  const [dayTotal, setDayTotal] = useState(0);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult('');
    setAffected(0);
    setDayTotal(0);

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
      // 這是**落在新營業區間之外**的筆數，不是當天總筆數 ——
      // 縮短半小時營業時間時，兩者差很多
      setAffected(data.existingAppointmentCount ?? 0);
      setDayTotal(data.dayAppointmentCount ?? 0);
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
      {/*
        後端目前沒有列出既有例外的 API（要新增 adminListDayOverrides 才做得到），
        所以設完之後無法從任何畫面確認哪些日子設過。在補上之前先誠實說明，
        總比讓管理員以為自己漏設了而重設一次好。
      */}
      <p className="notice">
        設定後<strong>無法從這個畫面查看已設過哪些日期</strong>，請自行記錄。
        要確認某天是否生效，可到前台的預約流程看那天有沒有可選時段。
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
                這天有 <strong>{affected}</strong> 筆預約落在新的營業時間之外
                {dayTotal > affected && `（當天共 ${dayTotal} 筆）`}，
                系統<strong>不會自動取消</strong>它們。請主動聯繫這些顧客安排改期 ——
                在「預約與訂單」頁可以查到名單。
              </p>
            )}
            {affected === 0 && dayTotal > 0 && (
              <p className="hint">
                這天有 {dayTotal} 筆預約，但都落在新的營業時間內，不受影響。
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
