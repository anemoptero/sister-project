import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import { Modal } from '../../components/Modal';
import type { AdminAppointment, AppointmentStatus } from '../../types/models';
import { formatDateTime, formatDuration } from '../../utils/format';
import { DateRangeFilter, defaultRange, type DateRange } from './DateRangeFilter';
import { StatTile } from './AdminOrdersPage';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: '已預約',
  cancelled: '已取消',
  completed: '已完成',
  no_show: '未到'
};

export default function AdminAppointmentsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [appointments, setAppointments] = useState<AdminAppointment[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState<AdminAppointment | null>(null);
  const [cancelling, setCancelling] = useState('');

  const load = useCallback(async () => {
    setError('');
    setAppointments(null);
    try {
      const data = await callApi('adminListAppointments', {
        from: range.from,
        to: range.to,
        ...(status ? { status } : {}),
        limit: 200
      });
      setAppointments(data.appointments);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入預約失敗。');
    }
  }, [range, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCancel(appointment: AdminAppointment) {
    setCancelling(appointment.appointmentId);
    setError('');
    setMessage('');
    try {
      await callApi('cancelAppointment', { appointmentId: appointment.appointmentId });
      setMessage('已取消該筆預約，訂單一併作廢，使用的優惠券已退回顧客帳戶。');
      setConfirming(null);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '取消失敗。');
    } finally {
      setCancelling('');
    }
  }

  const active = (appointments ?? []).filter((a) => a.status !== 'cancelled');

  return (
    <div className="page">
      <h1>預約查詢</h1>

      <DateRangeFilter value={range} onChange={setRange}>
        <div className="field">
          <label htmlFor="appt-status">狀態</label>
          <select
            id="appt-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')}
          >
            <option value="">全部</option>
            {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </DateRangeFilter>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {appointments && (
        <div className="stat-row">
          <StatTile label="總筆數" value={String(appointments.length)} />
          <StatTile label="未取消" value={String(active.length)} />
        </div>
      )}

      {appointments === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {appointments?.length === 0 && (
        <div className="empty-state">
          <h2>這個區間沒有預約</h2>
          <p>試著調整日期區間或狀態篩選。</p>
        </div>
      )}

      {appointments && appointments.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>預約時間</th>
                <th>服務內容</th>
                <th>時長</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr
                  key={appointment.appointmentId}
                  className={appointment.status === 'cancelled' ? 'row-disabled' : ''}
                >
                  <td>{formatDateTime(appointment.startAt)}</td>
                  <td>
                    {appointment.items.map((item) => item.productName).join('、') || '—'}
                  </td>
                  <td>{formatDuration(appointment.totalDurationMinutes)}</td>
                  <td>
                    <span
                      className={`tag ${
                        appointment.status === 'booked' ? 'tag--on' : 'tag--off'
                      }`}
                    >
                      {STATUS_LABELS[appointment.status]}
                    </span>
                  </td>
                  <td>
                    {/* 管理員可取消任何預約；已完成／未到／已取消的由後端擋下 */}
                    {appointment.status === 'booked' && (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => setConfirming(appointment)}
                      >
                        取消
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        改成公休不會自動取消既有預約。需要調整時請在這裡逐筆處理，並主動聯繫顧客。
      </p>

      {confirming && (
        <Modal
          title="確定要取消這筆預約嗎？"
          busy={Boolean(cancelling)}
          onClose={() => setConfirming(null)}
        >
          <p className="confirm-time">{formatDateTime(confirming.startAt)}</p>
          <p>
            取消後時段會釋出，<strong>無法復原</strong>。
            訂單會一併作廢，顧客使用的優惠券會退回他的帳戶。
          </p>
          <p className="hint">系統不會通知顧客，請記得另外聯繫。</p>
          <div className="actions">
            <button
              type="button"
              className="danger"
              onClick={() => void handleCancel(confirming)}
              disabled={Boolean(cancelling)}
            >
              {cancelling ? '取消中…' : '確定取消'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(null)}
              disabled={Boolean(cancelling)}
            >
              保留
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
