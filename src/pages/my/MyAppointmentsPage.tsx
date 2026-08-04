import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import { Modal } from '../../components/Modal';
import type { Appointment, AppointmentStatus } from '../../types/models';
import { formatDuration } from '../../utils/format';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: '已預約',
  cancelled: '已取消',
  completed: '已完成',
  no_show: '未到'
};

export default function MyAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cancelling, setCancelling] = useState('');
  /** 正在確認取消的預約，null 表示沒有 */
  const [confirming, setConfirming] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      // 不帶 uid：後端對非管理員一律強制查自己
      const data = await callApi('listAppointments', { limit: 200 });
      setAppointments(data.appointments);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入預約失敗，請稍後再試。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCancel(appointment: Appointment) {
    setCancelling(appointment.appointmentId);
    setError('');
    setMessage('');
    try {
      await callApi('cancelAppointment', { appointmentId: appointment.appointmentId });
      setMessage('已取消預約。若這筆預約有使用優惠券，已經退回你的帳戶。');
      setConfirming(null);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '取消失敗，請稍後再試。');
    } finally {
      setCancelling('');
    }
  }

  const now = Date.now();
  const upcoming = (appointments ?? []).filter(
    (a) => a.status === 'booked' && new Date(a.startAt).getTime() >= now
  );
  const past = (appointments ?? []).filter((a) => !upcoming.includes(a));

  return (
    <div className="page">
      <h1>我的預約</h1>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {appointments === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {appointments?.length === 0 && (
        <div className="empty-state">
          <h2>還沒有預約紀錄</h2>
          <p>
            <Link to="/products">看看有哪些療程</Link>
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="stack">
          <h2>即將到來</h2>
          {upcoming.map((appointment) => (
            <AppointmentCard
              key={appointment.appointmentId}
              appointment={appointment}
              onCancel={() => setConfirming(appointment)}
              cancelling={cancelling === appointment.appointmentId}
            />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="stack" style={{ marginTop: 'var(--space-6)' }}>
          <h2>過去的預約</h2>
          {past.map((appointment) => (
            <AppointmentCard key={appointment.appointmentId} appointment={appointment} />
          ))}
        </section>
      )}

      {/* 取消是不可逆的，而且會連帶作廢訂單，必須明確說清楚再執行 */}
      {confirming && (
        <Modal
          title="確定要取消這筆預約嗎？"
          busy={Boolean(cancelling)}
          onClose={() => setConfirming(null)}
        >
          <p className="confirm-time">{formatDateTimeLong(confirming.startAt)}</p>
          <p>
            取消後這個時段會釋出給其他客人，<strong>無法復原</strong>。
            這筆預約的訂單會一併作廢，使用的優惠券會退回你的帳戶。
          </p>
          <div className="actions">
            <button
              type="button"
              className="danger"
              onClick={() => void handleCancel(confirming)}
              disabled={Boolean(cancelling)}
            >
              {cancelling ? '取消中…' : '確定取消預約'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(null)}
              disabled={Boolean(cancelling)}
            >
              保留預約
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  onCancel,
  cancelling
}: {
  appointment: Appointment;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  return (
    <article className="card">
      <div className="page-head">
        <h3>{formatDateTimeLong(appointment.startAt)}</h3>
        <span className={`tag ${appointment.status === 'booked' ? 'tag--on' : 'tag--off'}`}>
          {STATUS_LABELS[appointment.status]}
        </span>
      </div>

      <ul className="confirm-list">
        {appointment.items.map((item, index) => (
          <li key={`${item.productId}-${index}`} className="confirm-line">
            <span>{item.productName}</span>
            <span className="hint">{formatDuration(item.durationMinutes)}</span>
          </li>
        ))}
      </ul>

      <p className="hint">
        共 {formatDuration(appointment.totalDurationMinutes)}，
        預計 {formatTime(appointment.endAt)} 結束
      </p>

      {appointment.cancelReason && (
        <p className="hint">取消原因：{appointment.cancelReason}</p>
      )}

      {onCancel && (
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={cancelling}>
            取消預約
          </button>
        </div>
      )}
    </article>
  );
}

function formatDateTimeLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return (
    `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（週${weekday}）` +
    ` ${formatTime(iso)}`
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
