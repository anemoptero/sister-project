import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import type { Order, OrderStatus } from '../../types/models';
import { formatDateTime, formatPrice } from '../../utils/format';

/**
 * 顧客端用字。「待結案／已結案」是後台的作業用語，對顧客講不通 ——
 * 同一個狀態在兩邊各自用讀得懂的說法即可，資料只有一份。
 */
const STATUS_LABELS: Record<OrderStatus, string> = {
  created: '已成立',
  paid: '已完成',
  cancelled: '已取消',
  void: '未完成'
};

/** 哪些狀態算「還有效」，用來決定標籤顏色 */
const ACTIVE_STATUSES: OrderStatus[] = ['created', 'paid'];

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // 不帶 uid：後端對非管理員一律強制查自己。
      // 也不帶日期區間 —— 指定了對象時區間才是選填，顧客要看得到全部歷史。
      // 品項預設會展開，且只多一次查詢（後端已修掉 N+1）
      const data = await callApi('listOrders', { limit: 200 });
      setOrders(data.orders);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入訂單失敗，請稍後再試。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <h1>我的訂單</h1>

      {error && <p className="error">{error}</p>}

      {orders === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {orders?.length === 0 && (
        <div className="empty-state">
          <h2>還沒有訂單</h2>
          <p>
            <Link to="/products">看看有哪些療程</Link>
          </p>
        </div>
      )}

      <div className="stack">
        {orders?.map((order) => (
          <article className="card" key={order.orderId}>
            <div className="page-head">
              <h3>{formatDateTime(order.createdAt)}</h3>
              <span
                className={`tag ${ACTIVE_STATUSES.includes(order.status) ? 'tag--on' : 'tag--off'}`}
              >
                {STATUS_LABELS[order.status]}
              </span>
            </div>

            <ul className="confirm-list">
              {order.items.map((item) => (
                <li key={item.orderItemId}>
                  <div className="confirm-line">
                    {/* 顯示的是下單當下的產品快照，
                        產品日後調價或改名不會影響歷史訂單 */}
                    <span>{item.productName}</span>
                    <span>{formatPrice(item.productPrice)}</span>
                  </div>
                  {item.discountAmount > 0 && (
                    <div className="confirm-line confirm-discount">
                      <span>優惠折抵</span>
                      <span>-{formatPrice(item.discountAmount)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="confirm-total">
              <div className="confirm-line">
                <span>小計</span>
                <span>{formatPrice(order.originalAmount)}</span>
              </div>

              {order.cartDiscountAmount > 0 && (
                <div className="confirm-line confirm-discount">
                  <span>整筆折抵</span>
                  <span>-{formatPrice(order.cartDiscountAmount)}</span>
                </div>
              )}

              <div className="confirm-line confirm-final">
                <span>{order.status === 'cancelled' ? '原金額' : '應付金額'}</span>
                <span>{formatPrice(order.finalAmount)}</span>
              </div>
            </div>

            {order.cancelledAt && (
              <p className="hint">已於 {formatDateTime(order.cancelledAt)} 取消。</p>
            )}
          </article>
        ))}
      </div>

      <p className="hint">
        訂單會隨預約一起建立。取消預約時訂單會一併作廢，使用的優惠券也會退回。
      </p>
    </div>
  );
}
