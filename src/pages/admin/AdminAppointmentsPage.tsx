import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError, reopenConflictDetails } from '../../api/client';
import { Modal } from '../../components/Modal';
import { StatTile } from '../../components/StatTile';
import type { AdminAppointment, AdminOrder, OrderStatus } from '../../types/models';
import { formatDateTime, formatDuration, formatPrice } from '../../utils/format';
import { CloseAppointmentModal, type CloseAction } from './CloseAppointmentModal';
import { DateRangeFilter, defaultRange, type DateRange } from './DateRangeFilter';

/**
 * 預約與訂單合併成同一頁。
 *
 * 兩者在這個系統裡是一對一的（`createOrder` 一次建立兩者），訂單只是預約的
 * 金額面。分成兩頁會讓經營者為了「這筆多少錢、收了沒」在兩邊來回對照。
 */

type Tab = 'open' | 'done' | 'all';

const TAB_LABELS: Record<Tab, string> = {
  open: '未完成',
  done: '已完成',
  all: '全部'
};

/**
 * 狀態一律看**訂單**。
 *
 * 預約自身也有狀態，但那是內部欄位（讓 appointments 能在資料庫端依狀態
 * 篩選），與訂單狀態嚴格一對一，不呈現在畫面上。兩個欄位並列只會讓人
 * 困惑哪個才算數。
 */
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: '待結案',
  paid: '已結案',
  void: '未完成',
  cancelled: '已取消'
};

function statusLabel(order: AdminOrder | undefined): string {
  if (!order) return '—';
  return ORDER_STATUS_LABELS[order.status] ?? order.status;
}

/**
 * 預約時間是否已經過去。
 *
 * 以**服務結束時間**判斷而非開始時間 —— 服務還在進行中就標記完成沒有意義。
 */
function isPast(appointment: AdminAppointment): boolean {
  return new Date(appointment.endAt).getTime() < Date.now();
}

export default function AdminAppointmentsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [tab, setTab] = useState<Tab>('open');
  const [appointments, setAppointments] = useState<AdminAppointment[] | null>(null);
  const [ordersById, setOrdersById] = useState<Record<string, AdminOrder>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState<AdminAppointment[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  /** 待確認退回的預約。結案後帳目就變了，退回一樣要確認 */
  const [reopening, setReopening] = useState<AdminAppointment | null>(null);

  const load = useCallback(async () => {
    setError('');
    setAppointments(null);
    setSelected(new Set());

    const [apptResult, orderResult] = await Promise.allSettled([
      callApi('adminListAppointments', { from: range.from, to: range.to, limit: 200 }),
      callApi('adminListOrders', { from: range.from, to: range.to, limit: 200 })
    ]);

    if (apptResult.status === 'fulfilled') {
      setAppointments(apptResult.value.appointments);
    } else {
      setAppointments([]);
      setError(isApiError(apptResult.reason) ? apptResult.reason.message : '載入預約失敗。');
    }

    if (orderResult.status === 'fulfilled') {
      const map: Record<string, AdminOrder> = {};
      orderResult.value.orders.forEach((order) => {
        if (order.appointmentId) map[order.appointmentId] = order;
      });
      setOrdersById(map);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 執行結案或取消。
   *
   * 後端一次只處理一筆，因此批次是逐筆送出。**逐筆記錄成敗**而不是
   * 遇到第一個錯就整批中止 —— 中止會讓使用者不知道前面幾筆到底做了沒。
   */
  async function runAction(action: CloseAction, targets: AdminAppointment[]) {
    setBusy(true);
    setError('');
    setMessage('');

    let done = 0;
    const failed: string[] = [];

    for (const appointment of targets) {
      // 尚未到預約時間的不可結案，但取消不受限制
      if (action !== 'cancel' && !isPast(appointment)) continue;

      try {
        if (action === 'cancel') {
          await callApi('cancelAppointment', { appointmentId: appointment.appointmentId });
        } else if (action === 'noShow') {
          await callApi('adminSetAppointmentNoShow', {
            appointmentId: appointment.appointmentId
          });
        } else {
          // 完成即收款，沒有第二種選擇
          await callApi('adminCompleteAppointment', {
            appointmentId: appointment.appointmentId
          });
        }
        done++;
      } catch (err) {
        failed.push(isApiError(err) ? err.message : '未知錯誤');
      }
    }

    setClosing(null);
    setBusy(false);

    if (done > 0) setMessage(`已處理 ${done} 筆預約。`);
    if (failed.length > 0) {
      setError(`${failed.length} 筆處理失敗：${[...new Set(failed)].join('；')}`);
    }

    await load();
  }

  /**
   * 退回待結案。**這是唯一的復原路徑** —— 結案狀態之間不可直接互轉，
   * 要改按別的結案方式一定要先退回。
   *
   * 已完成與未到不釋放時段，直接改狀態即可。已取消的時段已經釋出，後端會
   * 重新確認沒被佔走、並把當初歸還的優惠券扣回；被佔用時回 SLOT_UNAVAILABLE
   * 並帶 conflicts，要把佔用者顯示出來，管理員才知道要找誰協調。
   */
  async function reopen(appointment: AdminAppointment) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await callApi('adminReopenAppointment', {
        appointmentId: appointment.appointmentId
      });
      const restored = data.restoredCoupons ?? [];
      setMessage(
        restored.length > 0
          ? `已退回待結案，並扣回優惠券：${restored.join('、')}。`
          : '已退回待結案。'
      );
      await load();
    } catch (err) {
      if (!isApiError(err)) {
        setError('退回失敗，請稍後再試。');
        return;
      }
      const conflict = reopenConflictDetails(err);
      if (conflict) {
        const who = conflict.conflicts
          .map((item) => `${formatDateTime(item.startAt)} ${item.customer || item.uid}`)
          .join('；');
        setError(`${err.message}。目前佔用：${who}`);
        return;
      }
      setError(err.message);
    } finally {
      // 一律關閉，否則錯誤訊息會被 Modal 蓋住
      setReopening(null);
      setBusy(false);
    }
  }

  const all = appointments ?? [];
  const visible = all.filter((a) => {
    if (tab === 'open') return a.status === 'booked';
    if (tab === 'done') return a.status === 'completed';
    return true;
  });

  /** 只有未完成的可以被勾選 —— 其餘沒有可執行的動作 */
  const selectable = visible.filter((a) => a.status === 'booked');
  const selectedList = selectable.filter((a) => selected.has(a.appointmentId));
  const allSelected = selectable.length > 0 && selectedList.length === selectable.length;

  const unpaid = all.reduce((sum, appointment) => {
    const order = ordersById[appointment.appointmentId];
    return order?.status === 'created' ? sum + order.finalAmount : sum;
  }, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page">
      <h1>預約與訂單</h1>

      <DateRangeFilter value={range} onChange={setRange} />

      <div className="tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as Tab[]).map((value) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={`tab${tab === value ? ' is-active' : ''}`}
            onClick={() => {
              setTab(value);
              setSelected(new Set());
            }}
          >
            {TAB_LABELS[value]}
            {value !== 'all' && (
              <span className="tab-count">
                {all.filter((a) => a.status === (value === 'open' ? 'booked' : 'completed')).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {appointments && (
        <div className="stat-row">
          <StatTile label="預約筆數" value={String(all.length)} />
          <StatTile label="待收款" value={formatPrice(unpaid)} hint="已預約但尚未收款" />
        </div>
      )}

      {appointments === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {appointments && visible.length === 0 && (
        <div className="empty-state">
          <h2>這個區間沒有{TAB_LABELS[tab]}的預約</h2>
          <p>試著調整日期區間或切換分頁。</p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  {selectable.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(selectable.map((a) => a.appointmentId))
                        )
                      }
                      aria-label="全選"
                    />
                  )}
                </th>
                <th>預約時間</th>
                <th>服務內容</th>
                <th>金額</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((appointment) => {
                const order = ordersById[appointment.appointmentId];
                const inactive =
                  appointment.status === 'cancelled' || appointment.status === 'no_show';
                const canSelect = appointment.status === 'booked';
                const past = isPast(appointment);

                return (
                  <tr key={appointment.appointmentId} className={inactive ? 'row-disabled' : ''}>
                    <td>
                      {canSelect && (
                        <input
                          type="checkbox"
                          checked={selected.has(appointment.appointmentId)}
                          onChange={() => toggle(appointment.appointmentId)}
                          aria-label={`選取 ${formatDateTime(appointment.startAt)} 的預約`}
                        />
                      )}
                    </td>
                    <td>
                      {formatDateTime(appointment.startAt)}
                      {canSelect && !past && <div className="hint cell-sub">尚未開始</div>}
                    </td>
                    <td>
                      {appointment.items.map((item) => item.productName).join('、') || '—'}
                      <div className="hint cell-sub">
                        {formatDuration(appointment.totalDurationMinutes)}
                      </div>
                    </td>
                    <td>{order ? formatPrice(order.finalAmount) : '—'}</td>
                    <td>
                      <span className={`tag ${order?.status === 'paid' ? 'tag--on' : 'tag--off'}`}>
                        {statusLabel(order)}
                      </span>
                    </td>
                    <td>
                      <div className="cell-actions">
                        {canSelect && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={busy}
                            onClick={() => setClosing([appointment])}
                          >
                            處理
                          </button>
                        )}

                        {/* 誤按結案／誤取消的唯一復原路徑，三種結案狀態都可退回 */}
                        {appointment.status !== 'booked' && (
                          <button
                            type="button"
                            className="ghost small"
                            disabled={busy}
                            onClick={() => setReopening(appointment)}
                          >
                            退回待結案
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        只有已經過了服務時間的預約可以結案。<strong>取消不受此限制</strong> ——
        忘記處理的無效預約會一直算在待收款裡，隨時都該能清掉。
      </p>

      {/* 有勾選時浮出批次操作列 */}
      {selectedList.length > 0 && (
        <div className="bulk-bar">
          <span>已選取 {selectedList.length} 筆</span>
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" onClick={() => setClosing(selectedList)} disabled={busy}>
              批次處理
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(new Set())}
              disabled={busy}
            >
              取消選取
            </button>
          </div>
        </div>
      )}

      {reopening && (
        <Modal title="要把這筆預約退回未完成嗎？" busy={busy} onClose={() => setReopening(null)}>
          <p className="confirm-time">{formatDateTime(reopening.startAt)}</p>
          <p>
            預約會回到「未完成」，訂單退回<strong>未收款</strong>，
            這筆金額也會從已收改回未收。
          </p>
          {reopening.status === 'cancelled' ? (
            <p className="hint">
              取消時已經釋出時段、也退回了優惠券，因此會<strong>重新佔用這個時段</strong>
              並把券再次扣掉。若時段已被其他預約佔滿則無法退回，屆時會顯示是誰佔用。
            </p>
          ) : (
            <p className="hint">
              時段與優惠券不受影響 —— 結案本來就沒有釋出時段，也沒有歸還券。
            </p>
          )}
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void reopen(reopening)}>
              {busy ? '處理中…' : '確定退回'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setReopening(null)}
            >
              保持現狀
            </button>
          </div>
        </Modal>
      )}

      {closing && (
        <CloseAppointmentModal
          targets={closing}
          ordersById={ordersById}
          futureCount={closing.filter((a) => !isPast(a)).length}
          busy={busy}
          onClose={() => setClosing(null)}
          onConfirm={(action) => void runAction(action, closing)}
        />
      )}
    </div>
  );
}
