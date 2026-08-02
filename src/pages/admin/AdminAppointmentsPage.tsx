import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import { StatTile } from '../../components/StatTile';
import type { AdminAppointment, AdminOrder, AppointmentStatus } from '../../types/models';
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

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: '未完成',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到'
};

function paymentLabel(order: AdminOrder | undefined): string {
  if (!order) return '—';
  switch (order.status) {
    case 'paid':
      return '已收款';
    case 'free':
      return '免付款';
    case 'created':
      return '未收款';
    case 'cancelled':
      return '已取消';
    case 'void':
      return '已作廢';
    default:
      return order.status;
  }
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
  const [acting, setActing] = useState('');

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
          await callApi('adminCompleteAppointment', {
            appointmentId: appointment.appointmentId,
            markPaid: action === 'paid'
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

  async function togglePaid(order: AdminOrder, paid: boolean) {
    setActing(order.orderId);
    setError('');
    setMessage('');
    try {
      await callApi('adminSetOrderPaid', { orderId: order.orderId, paid });
      setMessage(paid ? '已認列收款。' : '已取消收款認列。');
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '操作失敗，請稍後再試。');
    } finally {
      setActing('');
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
                <th>收款</th>
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
                        {paymentLabel(order)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`tag ${
                          appointment.status === 'completed' ? 'tag--on' : 'tag--off'
                        }`}
                      >
                        {STATUS_LABELS[appointment.status]}
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

                        {appointment.status === 'completed' && order?.status === 'created' && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={acting === order.orderId}
                            onClick={() => void togglePaid(order, true)}
                          >
                            認列收款
                          </button>
                        )}
                        {appointment.status === 'completed' && order?.status === 'paid' && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={acting === order.orderId}
                            onClick={() => void togglePaid(order, false)}
                          >
                            取消認列
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
