import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import type { AdminAppointment } from '../../types/models';
import { localInputToIso } from '../../utils/datetime';
import { formatDuration } from '../../utils/format';

/**
 * 後台首頁。
 *
 * 只放一件事：**今天有誰要來**。那是工作室每天開後台最想知道的資訊，
 * 其餘功能從導覽列進去就好，不需要在這裡重複一份連結牆。
 */
export default function AdminHomePage() {
  const [appointments, setAppointments] = useState<AdminAppointment[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callApi('adminListAppointments', {
        from: startOfToday(),
        to: endOfToday(),
        status: 'booked',
        limit: 100
      });
      // 後端以 startAt 遞減排序，但今天的行程要由早到晚看
      setAppointments(
        [...data.appointments].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入今日預約失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>今日預約</h1>
        <Link className="btn secondary" to="/admin/appointments">
          查看全部預約
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {appointments === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {appointments?.length === 0 && (
        <div className="empty-state">
          <h2>今天沒有預約</h2>
          <p>可以趁機整理環境，或到「優惠券」發幾張券給老客人。</p>
        </div>
      )}

      {appointments && appointments.length > 0 && (
        <div className="stack">
          {appointments.map((appointment) => (
            <article className="card today-row" key={appointment.appointmentId}>
              <span className="today-time">{formatTime(appointment.startAt)}</span>
              <span className="today-body">
                <strong>
                  {appointment.items.map((item) => item.productName).join('、') || '—'}
                </strong>
                <span className="hint">
                  {formatDuration(appointment.totalDurationMinutes)}，
                  {formatTime(appointment.endAt)} 結束
                </span>
              </span>
            </article>
          ))}
        </div>
      )}

      <p className="hint">
        只顯示今天狀態為「已預約」的行程。顧客的聯絡電話可在「會員」頁查到。
      </p>
    </div>
  );
}

function startOfToday(): string {
  const d = new Date();
  return localInputToIso(`${dateOnly(d)}T00:00`);
}

function endOfToday(): string {
  const d = new Date();
  return localInputToIso(`${dateOnly(d)}T23:59`);
}

function dateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
