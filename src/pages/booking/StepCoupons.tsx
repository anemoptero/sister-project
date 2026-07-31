import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import type { MyCoupon } from '../../types/models';
import { formatPrice } from '../../utils/format';
import {
  isCartCouponEligible,
  isCouponEligibleForProduct,
  matchesWeekday,
  originalAmountOf,
  type BookingItem
} from './types';

interface Props {
  items: BookingItem[];
  startAt: string;
  cartCouponGrantId: string;
  onSetItemCoupon: (index: number, grantId: string) => void;
  onSetCartCoupon: (grantId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

/**
 * 步驟三：選擇優惠券。
 *
 * **沒有代碼輸入框。** 券是發放制 —— 顧客只能從自己持有的券中挑選，
 * 傳給後端的是 `couponGrantId`。
 *
 * ⚠️ 品項券與整單券**擇一使用**。同時帶兩者後端會直接回
 * `COUPON_NOT_ELIGIBLE`，所以這裡選了一種就要停用另一種，
 * 而不是讓顧客選完才在下單時被退回。
 */
export function StepCoupons({
  items,
  startAt,
  cartCouponGrantId,
  onSetItemCoupon,
  onSetCartCoupon,
  onBack,
  onNext
}: Props) {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callApi('listMyCoupons', {});
      setCoupons(data.coupons);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入優惠券失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const originalAmount = originalAmountOf(items);
  const usable = (coupons ?? []).filter((c) => c.usable && matchesWeekday(c, startAt));

  const usedItemCoupons = items.map((item) => item.couponGrantId).filter(Boolean);
  const hasItemCoupon = usedItemCoupons.length > 0;
  const hasCartCoupon = Boolean(cartCouponGrantId);

  const cartCandidates = usable.filter((c) => isCartCouponEligible(c, originalAmount));

  return (
    <div className="stack">
      <div>
        <h2>使用優惠券</h2>
        <p className="hint">
          只會列出你持有且適用於這次預約的券。<strong>單項折抵與整筆折抵不能同時使用</strong>。
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      {coupons === null && !error && <div className="skeleton" />}

      {coupons && usable.length === 0 && (
        <div className="empty-state">
          <h2>目前沒有可用的優惠券</h2>
          <p>沒有券也可以直接完成預約。</p>
        </div>
      )}

      {coupons && usable.length > 0 && (
        <>
          <section className="card">
            <h3>單項折抵</h3>
            <p className="hint">每項服務各自使用一張券。</p>

            {items.map((item, index) => {
              const candidates = usable.filter(
                (c) =>
                  isCouponEligibleForProduct(c, item.product) &&
                  // 同一張券在同筆訂單只能出現一次，
                  // 已被其他品項選走的就不再列出
                  (c.grantId === item.couponGrantId || !usedItemCoupons.includes(c.grantId))
              );

              return (
                <div className="field" key={`${item.product.productId}-${index}`}>
                  <label htmlFor={`coupon-${index}`}>
                    {item.product.name}
                    <span className="hint">{formatPrice(item.product.price)}</span>
                  </label>
                  <select
                    id={`coupon-${index}`}
                    value={item.couponGrantId}
                    disabled={hasCartCoupon}
                    onChange={(e) => onSetItemCoupon(index, e.target.value)}
                  >
                    <option value="">不使用</option>
                    {candidates.map((coupon) => (
                      <option key={coupon.grantId} value={coupon.grantId}>
                        {describeCoupon(coupon)}
                      </option>
                    ))}
                  </select>
                  {candidates.length === 0 && (
                    <p className="hint">沒有適用於這項服務的券。</p>
                  )}
                </div>
              );
            })}

            {hasCartCoupon && (
              <p className="notice">
                已選用整筆折抵，單項折抵無法同時使用。要改用單項折抵請先清除下方的整筆折抵。
              </p>
            )}
          </section>

          <section className="card">
            <h3>整筆折抵</h3>
            <p className="hint">一張券折抵整筆訂單。</p>

            <div className="field">
              <label htmlFor="cart-coupon">
                訂單金額 <span className="hint">{formatPrice(originalAmount)}</span>
              </label>
              <select
                id="cart-coupon"
                value={cartCouponGrantId}
                disabled={hasItemCoupon}
                onChange={(e) => onSetCartCoupon(e.target.value)}
              >
                <option value="">不使用</option>
                {cartCandidates.map((coupon) => (
                  <option key={coupon.grantId} value={coupon.grantId}>
                    {describeCoupon(coupon)}
                  </option>
                ))}
              </select>
              {cartCandidates.length === 0 && (
                <p className="hint">沒有適用於這筆訂單的整筆折抵券。</p>
              )}
            </div>

            {hasItemCoupon && (
              <p className="notice">
                已選用單項折抵，整筆折抵無法同時使用。要改用整筆折抵請先把上方的單項折抵改回「不使用」。
              </p>
            )}
          </section>
        </>
      )}

      <div className="summary-bar">
        <button type="button" className="secondary" onClick={onBack}>
          上一步
        </button>
        <button type="button" onClick={onNext}>
          確認訂單
        </button>
      </div>
    </div>
  );
}

function describeCoupon(coupon: MyCoupon): string {
  const value = coupon.type === 'experience' ? '全額折抵' : `折 ${formatPrice(coupon.discountAmount)}`;
  return `${coupon.name}（${value}）`;
}
