import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import type { MyCoupon } from '../../types/models';
import { formatDateTime, formatPrice } from '../../utils/format';

export default function MyCouponsPage() {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (history: boolean) => {
    setError('');
    setCoupons(null);
    try {
      // 預設只回傳可用的券；要看已使用與已過期需明確要求
      const data = await callApi('listMyCoupons', {
        includeUsed: history,
        includeExpired: history
      });
      setCoupons(data.coupons);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入優惠券失敗，請稍後再試。');
    }
  }, []);

  useEffect(() => {
    void load(includeHistory);
  }, [load, includeHistory]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>我的優惠券</h1>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeHistory}
            onChange={(e) => setIncludeHistory(e.target.checked)}
          />
          顯示已使用與過期的
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {coupons === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {coupons?.length === 0 && (
        <div className="empty-state">
          <h2>{includeHistory ? '沒有任何優惠券紀錄' : '目前沒有可用的優惠券'}</h2>
          <p>優惠券由店家發放，收到後會出現在這裡。</p>
          <p className="hint">
            有領取碼？<Link to="/claim">在這裡領取</Link>
          </p>
          <p className="hint">
            <Link to="/products">先看看有哪些療程</Link>
          </p>
        </div>
      )}

      <div className="coupon-grid">
        {coupons?.map((coupon) => (
          <article
            className={`card coupon-card${coupon.usable ? '' : ' is-inactive'}`}
            key={coupon.grantId}
          >
            <div className="page-head">
              <h3>{coupon.name}</h3>
              <span className={`tag ${coupon.usable ? 'tag--on' : 'tag--off'}`}>
                {describeStatus(coupon)}
              </span>
            </div>

            <p className="coupon-value">
              {coupon.type === 'experience' ? '全額折抵' : `折 ${formatPrice(coupon.discountAmount)}`}
            </p>

            <dl className="product-meta">
              <div>
                <dt>使用範圍</dt>
                <dd>{coupon.scope === 'item' ? '單項服務' : '整筆訂單'}</dd>
              </div>
              <div>
                <dt>有效期限</dt>
                <dd>{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : '—'}</dd>
              </div>
            </dl>

            <ul className="coupon-terms">
              {coupon.minOrderAmount > 0 && (
                <li>訂單滿 {formatPrice(coupon.minOrderAmount)} 可用</li>
              )}
              {coupon.weekdays.length > 0 && (
                // 依預約時間的星期判斷，不是下單當天
                <li>限預約 {coupon.weekdays.map((d) => '日一二三四五六'[d]).join('、')} 的時段</li>
              )}
              {coupon.firstPurchaseOnly && <li>限首次消費使用</li>}
              {coupon.eligibleProductIds.length > 0 && <li>限特定療程使用</li>}
            </ul>

            {coupon.usable && (
              <Link className="btn" to="/booking">
                去預約
              </Link>
            )}
          </article>
        ))}
      </div>

      <p className="hint">
        結帳時從清單中挑選即可，不需要輸入代碼。單項折抵與整筆折抵不能同時使用。
      </p>
    </div>
  );
}

function describeStatus(coupon: MyCoupon): string {
  if (coupon.revokedAt) return '已收回';
  if (coupon.usedAt) return '已使用';
  // validityState 與結帳走同一份判定，前端不重算 ——
  // absolute 型的有效期在券上，用 expiresAt 自行比對會與結帳結果不一致
  if (coupon.validityState === 'not_started') return '尚未開始';
  if (coupon.validityState === 'expired' || coupon.validityState === 'invalid') return '已過期';
  if (!coupon.usable) return '無法使用';
  return '可使用';
}
