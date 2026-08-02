import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import { StatTile } from '../../components/StatTile';
import type { AdminAppointment, AdminOrder, WeeklyBusinessHour } from '../../types/models';
import { businessDayRange } from '../../utils/businessDays';
import { formatDuration, formatPrice } from '../../utils/format';

/** 待結案往回查多久。超過這個範圍的舊預約已經不是日常待辦了 */
const OVERDUE_LOOKBACK_DAYS = 180;

/**
 * 後台首頁。
 *
 * 兩個區塊，對應每天實際會做的兩件事：
 *
 * 1. **近期行程** —— 今天前後各三個營業日。用營業日而非日曆日計算，
 *    否則週一店休的工作室在週日打開後台，往後三天只會看到兩天有內容。
 * 2. **待結案** —— 所有已經過了服務時間卻還沒結案的預約。這些會一直
 *    算在待收款裡，是最容易被遺漏的部分。
 */
export default function AdminHomePage() {
  const [upcoming, setUpcoming] = useState<AdminAppointment[] | null>(null);
  const [overdue, setOverdue] = useState<AdminAppointment[] | null>(null);
  const [ordersById, setOrdersById] = useState<Record<string, AdminOrder>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');

    // 先取營業設定才知道哪幾天店休，範圍才算得出來
    let weekly: WeeklyBusinessHour[] = [];
    try {
      const hours = await callApi('adminGetBusinessHours', {});
      weekly = hours.businessHours.weekly;
    } catch {
      // 取不到就當全年無休，總比整頁空白好
    }

    const range = businessDayRange(weekly, 3);
    const now = new Date();
    const lookback = new Date(now.getTime() - OVERDUE_LOOKBACK_DAYS * 86_400_000);

    const [nearResult, overdueResult, orderResult] = await Promise.allSettled([
      callApi('adminListAppointments', {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        status: 'booked',
        limit: 200
      }),
      callApi('adminListAppointments', {
        from: lookback.toISOString(),
        to: now.toISOString(),
        status: 'booked',
        limit: 200
      }),
      callApi('adminListOrders', {
        from: lookback.toISOString(),
        to: range.to.toISOString(),
        limit: 200
      })
    ]);

    if (nearResult.status === 'fulfilled') {
      // 後端以 startAt 遞減排序，但行程要由早看到晚
      setUpcoming(sortByStart(nearResult.value.appointments));
    } else {
      setUpcoming([]);
      setError(isApiError(nearResult.reason) ? nearResult.reason.message : '載入行程失敗。');
    }

    if (overdueResult.status === 'fulfilled') {
      // 用結束時間再篩一次：查詢是以 startAt 為界，
      // 今天稍早開始但還沒結束的預約不算逾期
      setOverdue(
        sortByStart(
          overdueResult.value.appointments.filter(
            (a) => new Date(a.endAt).getTime() < Date.now()
          )
        )
      );
    } else {
      setOverdue([]);
    }

    if (orderResult.status === 'fulfilled') {
      const map: Record<string, AdminOrder> = {};
      orderResult.value.orders.forEach((order) => {
        if (order.appointmentId) map[order.appointmentId] = order;
      });
      setOrdersById(map);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overdueAmount = (overdue ?? []).reduce(
    (sum, a) => sum + (ordersById[a.appointmentId]?.finalAmount ?? 0),
    0
  );

  return (
    <div className="page">
      <h1>後台首頁</h1>

      {error && <p className="error">{error}</p>}

      {/* 待結案放最前面：它是待辦，近期行程只是參考 */}
      <section className="stack">
        <div className="page-head">
          <h2>待結案</h2>
          {(overdue?.length ?? 0) > 0 && (
            <Link className="btn" to="/admin/appointments">
              前往處理
            </Link>
          )}
        </div>

        {overdue === null && <div className="skeleton" />}

        {overdue?.length === 0 && (
          <p className="hint">沒有待結案的預約，很好。</p>
        )}

        {overdue && overdue.length > 0 && (
          <>
            <div className="stat-row">
              <StatTile label="待結案筆數" value={String(overdue.length)} tone="strong" />
              <StatTile
                label="待收金額"
                value={formatPrice(overdueAmount)}
                hint="結案前不會計入已收"
              />
            </div>

            <div className="stack">
              {overdue.slice(0, 10).map((appointment) => (
                <AppointmentRow
                  key={appointment.appointmentId}
                  appointment={appointment}
                  order={ordersById[appointment.appointmentId]}
                  overdue
                />
              ))}
            </div>

            {overdue.length > 10 && (
              <p className="hint">另有 {overdue.length - 10} 筆，請到「預約與訂單」查看。</p>
            )}
          </>
        )}
      </section>

      <section className="stack" style={{ marginTop: 'var(--space-7)' }}>
        <div className="page-head">
          <h2>近期行程</h2>
          <Link className="btn secondary" to="/admin/appointments">
            查看全部
          </Link>
        </div>
        <p className="hint">今天前後各三個營業日，店休日會自動往後延。</p>

        {upcoming === null && <div className="skeleton" />}

        {upcoming?.length === 0 && (
          <div className="empty-state">
            <h2>這幾天沒有預約</h2>
            <p>可以趁機整理環境，或到「優惠券」發幾張券給老客人。</p>
          </div>
        )}

        {upcoming?.map((appointment) => (
          <AppointmentRow
            key={appointment.appointmentId}
            appointment={appointment}
            order={ordersById[appointment.appointmentId]}
          />
        ))}
      </section>
    </div>
  );
}

function AppointmentRow({
  appointment,
  order,
  overdue = false
}: {
  appointment: AdminAppointment;
  order?: AdminOrder;
  overdue?: boolean;
}) {
  return (
    <article className={`card today-row${overdue ? ' today-row--overdue' : ''}`}>
      <span className="today-time">
        {formatDayTime(appointment.startAt)}
      </span>
      <span className="today-body">
        <strong>{appointment.items.map((item) => item.productName).join('、') || '—'}</strong>
        <span className="hint">
          {formatDuration(appointment.totalDurationMinutes)}
          {order && ` · ${formatPrice(order.finalAmount)}`}
        </span>
      </span>
    </article>
  );
}

function sortByStart(list: AdminAppointment[]): AdminAppointment[] {
  return [...list].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
}

/** 跨多天的清單只顯示時間會分不出是哪一天 */
function formatDayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return sameDay ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
