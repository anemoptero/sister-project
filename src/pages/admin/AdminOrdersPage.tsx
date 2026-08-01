import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import type { AdminOrder, OrderStatus } from '../../types/models';
import { formatDateTime, formatPrice } from '../../utils/format';
import { DateRangeFilter, defaultRange, type DateRange } from './DateRangeFilter';

const STATUS_LABELS: Record<OrderStatus, string> = {
  created: '待付款',
  free: '免付款',
  paid: '已付款',
  cancelled: '已取消',
  void: '已作廢'
};

/** 不計入營收的狀態，與後端 `NON_REVENUE_ORDER_STATUSES` 一致 */
const NON_REVENUE: OrderStatus[] = ['cancelled', 'void'];

export default function AdminOrdersPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setOrders(null);
    try {
      const data = await callApi('adminListOrders', {
        from: range.from,
        to: range.to,
        ...(status ? { status } : {}),
        limit: 200
      });
      setOrders(data.orders);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入訂單失敗。');
    }
  }, [range, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // 只加總有效訂單。取消的訂單仍留在資料庫保留軌跡，但不是營收
  const revenue = (orders ?? [])
    .filter((order) => !NON_REVENUE.includes(order.status))
    .reduce((sum, order) => sum + order.finalAmount, 0);

  return (
    <div className="page">
      <h1>訂單查詢</h1>

      <DateRangeFilter value={range} onChange={setRange}>
        <div className="field">
          <label htmlFor="order-status">狀態</label>
          <select
            id="order-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
          >
            <option value="">全部</option>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </DateRangeFilter>

      {error && <p className="error">{error}</p>}

      {orders && (
        <div className="stat-row">
          <StatTile label="筆數" value={String(orders.length)} />
          <StatTile
            label="有效訂單金額"
            value={formatPrice(revenue)}
            hint="不含已取消與已作廢"
          />
        </div>
      )}

      {orders === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {orders?.length === 0 && (
        <div className="empty-state">
          <h2>這個區間沒有訂單</h2>
          <p>試著調整日期區間或狀態篩選。</p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>建立時間</th>
                <th>品項</th>
                <th>原價</th>
                <th>折抵</th>
                <th>應付</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.orderId}
                  className={NON_REVENUE.includes(order.status) ? 'row-disabled' : ''}
                >
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.itemCount} 項</td>
                  <td>{formatPrice(order.originalAmount)}</td>
                  <td>
                    {order.discountAmount > 0 ? `-${formatPrice(order.discountAmount)}` : '—'}
                  </td>
                  <td>{formatPrice(order.finalAmount)}</td>
                  <td>
                    <span
                      className={`tag ${
                        NON_REVENUE.includes(order.status) ? 'tag--off' : 'tag--on'
                      }`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        已取消與已作廢的訂單仍保留在紀錄中，但不計入營收 —— 這與統計頁的算法一致。
      </p>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
