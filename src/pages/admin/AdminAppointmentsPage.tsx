import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import { Modal } from '../../components/Modal';
import { StatTile } from '../../components/StatTile';
import type { AdminAppointment, AdminOrder, AppointmentStatus } from '../../types/models';
import { formatDateTime, formatDuration, formatPrice } from '../../utils/format';
import { DateRangeFilter, defaultRange, type DateRange } from './DateRangeFilter';

/**
 * 預約與訂單合併成同一頁。
 *
 * 兩者在這個系統裡是一對一的：`createOrder` 一次建立預約與訂單，訂單只是
 * 預約的金額面。分成兩頁會讓經營者為了「這筆多少錢、收了沒」在兩邊來回對照。
 *
 * 因此這頁同時取回兩份資料，以 `appointmentId` 合併成一列 ——
 * 時間、服務、金額、收款狀態、結案動作全部在同一行。
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

/** 訂單狀態在這頁只關心「收了沒」 */
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

export default function AdminAppointmentsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [tab, setTab] = useState<Tab>('open');
  const [appointments, setAppointments] = useState<AdminAppointment[] | null>(null);
  const [ordersById, setOrdersById] = useState<Record<string, AdminOrder>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [acting, setActing] = useState('');
  const [closing, setClosing] = useState<AdminAppointment | null>(null);

  const load = useCallback(async () => {
    setError('');
    setAppointments(null);

    // 兩份資料互不相依，平行取回。Apps Script 一次往返一到三秒，串行會很難等
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

  async function act(
    appointment: AdminAppointment,
    action: 'paid' | 'unpaid' | 'noShow' | 'cancel'
  ) {
    setActing(appointment.appointmentId);
    setError('');
    setMessage('');

    try {
      if (action === 'paid' || action === 'unpaid') {
        await callApi('adminCompleteAppointment', {
          appointmentId: appointment.appointmentId,
          markPaid: action === 'paid'
        });
        setMessage(action === 'paid' ? '已標記完成並收款。' : '已標記完成，尚未收款。');
      } else if (action === 'noShow') {
        await callApi('adminSetAppointmentNoShow', {
          appointmentId: appointment.appointmentId
        });
        setMessage('已標記未到，訂單已作廢。優惠券不會退回。');
      } else {
        await callApi('cancelAppointment', { appointmentId: appointment.appointmentId });
        setMessage('已取消預約，時段已釋出，優惠券已退回顧客。');
      }
      setClosing(null);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '操作失敗，請稍後再試。');
    } finally {
      setActing('');
    }
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

  // 未收款金額只看未取消的訂單，與統計頁的口徑一致
  const unpaid = all.reduce((sum, appointment) => {
    const order = ordersById[appointment.appointmentId];
    return order?.status === 'created' ? sum + order.finalAmount : sum;
  }, 0);

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
            onClick={() => setTab(value)}
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
                const busy = acting === appointment.appointmentId || acting === order?.orderId;
                const inactive =
                  appointment.status === 'cancelled' || appointment.status === 'no_show';

                return (
                  <tr key={appointment.appointmentId} className={inactive ? 'row-disabled' : ''}>
                    <td>{formatDateTime(appointment.startAt)}</td>
                    <td>
                      {appointment.items.map((item) => item.productName).join('、') || '—'}
                      <div className="hint cell-sub">
                        {formatDuration(appointment.totalDurationMinutes)}
                      </div>
                    </td>
                    <td>{order ? formatPrice(order.finalAmount) : '—'}</td>
                    <td>
                      <span
                        className={`tag ${order?.status === 'paid' ? 'tag--on' : 'tag--off'}`}
                      >
                        {paymentLabel(order)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`tag ${appointment.status === 'completed' ? 'tag--on' : 'tag--off'}`}
                      >
                        {STATUS_LABELS[appointment.status]}
                      </span>
                    </td>
                    <td>
                      <div className="cell-actions">
                        {appointment.status === 'booked' && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={busy}
                            onClick={() => setClosing(appointment)}
                          >
                            結案
                          </button>
                        )}

                        {/* 已完成但當時沒收到錢，事後補認列；誤按也能改回來 */}
                        {appointment.status === 'completed' && order?.status === 'created' && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={busy}
                            onClick={() => void togglePaid(order, true)}
                          >
                            認列收款
                          </button>
                        )}
                        {appointment.status === 'completed' && order?.status === 'paid' && (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={busy}
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
        已取消與已作廢的訂單不計入營收。改成公休不會自動取消既有預約，需在這裡逐筆處理。
      </p>

      {closing && (
        <Modal title="這筆預約要如何結案？" busy={Boolean(acting)} onClose={() => setClosing(null)}>
          <p className="confirm-time">{formatDateTime(closing.startAt)}</p>
          <p className="hint">
            {closing.items.map((item) => item.productName).join('、')}
            {ordersById[closing.appointmentId] &&
              ` · ${formatPrice(ordersById[closing.appointmentId].finalAmount)}`}
          </p>

          {/* 三種結果的後果不同，一次列出來讓人選，而不是先做了再想怎麼救 */}
          <div className="choice-list">
            <button
              type="button"
              className="choice"
              disabled={Boolean(acting)}
              onClick={() => void act(closing, 'paid')}
            >
              <strong>完成並收款</strong>
              <span className="hint">服務已完成，款項已收到。最常見的情況。</span>
            </button>

            <button
              type="button"
              className="choice"
              disabled={Boolean(acting)}
              onClick={() => void act(closing, 'unpaid')}
            >
              <strong>完成，稍後收款</strong>
              <span className="hint">服務已完成但還沒收到錢，之後可在列表補認列。</span>
            </button>

            <button
              type="button"
              className="choice"
              disabled={Boolean(acting)}
              onClick={() => void act(closing, 'noShow')}
            >
              <strong>客人未到</strong>
              <span className="hint">訂單作廢不計營收。時段不釋出，優惠券也不退回。</span>
            </button>

            <button
              type="button"
              className="choice choice--danger"
              disabled={Boolean(acting)}
              onClick={() => void act(closing, 'cancel')}
            >
              <strong>取消這筆預約</strong>
              <span className="hint">時段釋出、優惠券退回顧客。適合事先告知的情況。</span>
            </button>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setClosing(null)}
              disabled={Boolean(acting)}
            >
              先不處理
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
