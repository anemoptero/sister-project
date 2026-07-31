import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import type { BusinessHours, WeeklyBusinessHour } from '../../types/models';
import { DayOverrideForm } from './DayOverrideForm';

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/**
 * `slotStepMinutes` 必須落在 5～240 **且能整除 60**，
 * 兩條規則交集後合法值只有這 8 個。
 *
 * 用下拉選單而非數字輸入框：輸入 45 會通過範圍檢查卻被整除規則擋下，
 * 而那個錯誤訊息（「必須能整除 60」）對不熟悉的人幾乎無從理解。
 */
const SLOT_STEP_OPTIONS = [5, 6, 10, 12, 15, 20, 30, 60];

export default function AdminBusinessHoursPage() {
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorField, setErrorField] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await callApi('adminGetBusinessHours', {});
      setHours(data.businessHours);
      setConfigured(data.businessHours.configured);
    } catch (err) {
      setLoadError(isApiError(err) ? err.message : '載入營業設定失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDay(weekday: number, patch: Partial<WeeklyBusinessHour>) {
    if (!hours) return;
    setHours({
      ...hours,
      weekly: hours.weekly.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day))
    });
  }

  function updateSetting(patch: Partial<BusinessHours>) {
    if (!hours) return;
    setHours({ ...hours, ...patch });
  }

  async function handleSave() {
    if (!hours) return;

    // 後端也會擋，但先在前端提示才不用等一次往返，
    // 而且能直接指出是星期幾出問題
    const invalid = hours.weekly.find(
      (day) => day.enabled && day.openTime >= day.closeTime
    );
    if (invalid) {
      setErrorMessage(`${WEEKDAY_LABELS[invalid.weekday]}的開店時間必須早於打烊時間。`);
      return;
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');
    setErrorField('');

    try {
      const data = await callApi('adminSetBusinessHours', {
        weekly: hours.weekly,
        resourceCount: hours.resourceCount,
        bufferMinutes: hours.bufferMinutes,
        slotStepMinutes: hours.slotStepMinutes,
        minAdvanceHours: hours.minAdvanceHours,
        maxAdvanceDays: hours.maxAdvanceDays
      });
      setHours(data.businessHours);
      setConfigured(true);
      setMessage('已儲存營業設定。');
    } catch (err) {
      if (isApiError(err)) {
        setErrorMessage(err.message);
        setErrorField(validationField(err));
      } else {
        setErrorMessage('儲存失敗，請稍後再試。');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <h1>營業時間</h1>
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (!hours) {
    return (
      <div className="page">
        <h1>營業時間</h1>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>營業時間</h1>
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '儲存中…' : '儲存設定'}
        </button>
      </div>

      {!configured && (
        <p className="notice">
          尚未設定過營業時間，以下顯示的是預設值。<strong>按下儲存之後才會生效</strong> ——
          在那之前顧客端查不到任何可預約時間。
        </p>
      )}

      {message && <p className="success">{message}</p>}
      {errorMessage && <p className="error">{errorMessage}</p>}

      <section className="card">
        <h2>每週營業時間</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>星期</th>
                <th>營業</th>
                <th>開店</th>
                <th>打烊</th>
              </tr>
            </thead>
            <tbody>
              {hours.weekly.map((day) => (
                <tr key={day.weekday} className={day.enabled ? '' : 'row-disabled'}>
                  <td>{WEEKDAY_LABELS[day.weekday]}</td>
                  <td>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={(e) => updateDay(day.weekday, { enabled: e.target.checked })}
                        aria-label={`${WEEKDAY_LABELS[day.weekday]}是否營業`}
                      />
                    </label>
                  </td>
                  <td>
                    <input
                      type="time"
                      className="time-input"
                      value={day.openTime}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(day.weekday, { openTime: e.target.value })}
                      aria-label={`${WEEKDAY_LABELS[day.weekday]}開店時間`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="time-input"
                      value={day.closeTime}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(day.weekday, { closeTime: e.target.value })}
                      aria-label={`${WEEKDAY_LABELS[day.weekday]}打烊時間`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>預約規則</h2>

        <div className="field-row">
          <div className="field">
            <label htmlFor="bh-resource">同時段可接客數</label>
            <input
              id="bh-resource"
              type="number"
              min={1}
              max={20}
              step={1}
              value={hours.resourceCount}
              onChange={(e) => updateSetting({ resourceCount: Number(e.target.value) })}
              aria-invalid={errorField === 'resourceCount'}
            />
            <p className="hint">同一個時間最多能同時服務幾位客人。1～20。</p>
          </div>

          <div className="field">
            <label htmlFor="bh-step">時間格線</label>
            <select
              id="bh-step"
              value={hours.slotStepMinutes}
              onChange={(e) => updateSetting({ slotStepMinutes: Number(e.target.value) })}
              aria-invalid={errorField === 'slotStepMinutes'}
            >
              {SLOT_STEP_OPTIONS.map((step) => (
                <option key={step} value={step}>
                  {step} 分鐘
                </option>
              ))}
            </select>
            <p className="hint">
              從開店時間起，每隔這麼久切一個可預約的起點。必須能整除 60。
            </p>
          </div>

          <div className="field">
            <label htmlFor="bh-buffer">間隔緩衝</label>
            <input
              id="bh-buffer"
              type="number"
              min={0}
              max={240}
              step={1}
              value={hours.bufferMinutes}
              onChange={(e) => updateSetting({ bufferMinutes: Number(e.target.value) })}
              aria-invalid={errorField === 'bufferMinutes'}
            />
            <p className="hint">
              每次服務後額外保留的整理時間。通常留 0 —— 格線取整本身已有天然間隔。
            </p>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="bh-min">最短提前預約</label>
            <input
              id="bh-min"
              type="number"
              min={0}
              max={720}
              step={1}
              value={hours.minAdvanceHours}
              onChange={(e) => updateSetting({ minAdvanceHours: Number(e.target.value) })}
              aria-invalid={errorField === 'minAdvanceHours'}
            />
            <p className="hint">幾小時之內的時段不開放預約。0 表示不限。</p>
          </div>

          <div className="field">
            <label htmlFor="bh-max">最長可預約天數</label>
            <input
              id="bh-max"
              type="number"
              min={1}
              max={365}
              step={1}
              value={hours.maxAdvanceDays}
              onChange={(e) => updateSetting({ maxAdvanceDays: Number(e.target.value) })}
              aria-invalid={errorField === 'maxAdvanceDays'}
            />
            <p className="hint">顧客最多能預約幾天之後的時段。</p>
          </div>

          <div />
        </div>

        <p className="notice">
          調整「時間格線」或「間隔緩衝」<strong>不會影響已成立的預約</strong>。
          每筆預約的佔用範圍在建立當下就算好了 —— 否則政策一改，原本合法的行事曆會集體出現重疊。
          但可預約時間的呈現會立刻改變，營業中調整前請留意。
        </p>
      </section>

      <DayOverrideForm />
    </div>
  );
}
