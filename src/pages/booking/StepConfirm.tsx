import { useCallback, useEffect, useRef, useState } from 'react';
import {
  callApi,
  isApiError,
  productChangedDetails,
  slotUnavailableDetails,
  type ApiError
} from '../../api/client';
import { ProductChangeNotice, type ProductChange } from '../../components/ProductChangeNotice';
import { ERROR_CODES, type ApiDataOf } from '../../types/api';
import type { MyCoupon, Product } from '../../types/models';
import { formatDuration, formatPrice } from '../../utils/format';
import {
  isCartCouponEligible,
  isCouponEligibleForProduct,
  matchesWeekday,
  originalAmountOf,
  totalDurationOf,
  type BookingItem
} from './types';

interface Props {
  items: BookingItem[];
  startAt: string;
  cartCouponGrantId: string;
  onSetItemCoupon: (index: number, grantId: string) => void;
  onSetCartCoupon: (grantId: string) => void;
  /** 流程中被改過的療程。未確認前不允許送出 */
  changes: ProductChange[];
  onAcknowledgeChanges: () => void;
  onChangeTime: (conflictSlotStartAt: string) => void;
  onChangeServices: () => void;
  onProductUpdated: (product: Product) => void;
  onDone: (order: ApiDataOf<'createOrder'>) => void;
}

type Preview = ApiDataOf<'previewOrder'>;

/**
 * 試算的節流間隔。
 *
 * 每次改動優惠券都要向後端重新試算（金額只能由後端決定），而 Apps Script
 * 一次往返約一到三秒。連續切換下拉選單時若每次都送，回應會亂序抵達，
 * 畫面金額可能停在中間某個狀態。
 */
const PREVIEW_DEBOUNCE_MS = 350;

/**
 * 確認頁：選券、看金額、送出，全部在同一頁。
 *
 * 原本把選券獨立成一步，結果顧客在選券當下看不到折抵多少 ——
 * 那正是他需要判斷的資訊。合併之後每次改動都會重新試算並更新金額。
 *
 * **所有失敗都在這一頁原地復原，不讓顧客重頭來過**：
 *
 * ```text
 * 產品被改  顯示差異橫幅 → 自動套用新版本並重算 → 再按一次送出
 * 時段被搶  顯示原因 → 就地跳回選時間，服務與券全部保留
 * 券不適用  標示是哪一張 → 清掉那張重算，其餘保留
 * 缺電話    引導補資料，回來後選擇都還在
 * ```
 */
export function StepConfirm({
  items,
  startAt,
  cartCouponGrantId,
  onSetItemCoupon,
  onSetCartCoupon,
  changes,
  onAcknowledgeChanges,
  onChangeTime,
  onChangeServices,
  onProductUpdated,
  onDone
}: Props) {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [calculating, setCalculating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** 只接受最後一次試算的結果，避免亂序回應把金額停在舊值 */
  const previewSeq = useRef(0);

  const buildItems = useCallback(
    () =>
      items.map((item) => ({
        productId: item.product.productId,
        // createOrder 每項必填 —— 顧客必須是看著最新的價格下單
        expectedProductVersion: item.product.version,
        ...(item.couponGrantId ? { couponGrantId: item.couponGrantId } : {})
      })),
    [items]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await callApi('listMyCoupons', {});
        if (!cancelled) setCoupons(data.coupons);
      } catch {
        // 券載入失敗不該擋住預約，顧客仍可不使用優惠券完成
        if (!cancelled) setCoupons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 品項、時間或整單券變動就重新試算。金額只能由後端決定
  useEffect(() => {
    const seq = ++previewSeq.current;
    setCalculating(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await callApi('previewOrder', {
            startAt,
            items: buildItems(),
            ...(cartCouponGrantId ? { cartCouponGrantId } : {})
          });
          if (seq !== previewSeq.current) return;
          setPreview(data);
          setError('');
        } catch (err) {
          if (seq !== previewSeq.current) return;
          // 試算就會抓出不適用的券，不必等到送出才失敗
          setError(isApiError(err) ? err.message : '試算失敗，請稍後再試。');
          setPreview(null);
        } finally {
          if (seq === previewSeq.current) setCalculating(false);
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [startAt, buildItems, cartCouponGrantId]);

  function handleApiFailure(err: ApiError) {
    const productChange = productChangedDetails(err);
    if (productChange) {
      // 差異記錄交給上層保存，才能在被退回選時間頁之後仍然存在
      onProductUpdated(productChange.product);
      return;
    }

    const slot = slotUnavailableDetails(err);
    if (slot) {
      // 訊息本身已含時間（「16:00 這個時段已額滿」）
      onChangeTime(slot.conflictSlotStartAt);
      return;
    }

    if (err.is(ERROR_CODES.PROFILE_INCOMPLETE)) {
      setError('需要先留下聯絡電話才能完成預約，請到「個人資料」填寫後再回來。');
      return;
    }

    setError(err.message);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const data = await callApi('createOrder', {
        startAt,
        items: buildItems(),
        ...(cartCouponGrantId ? { cartCouponGrantId } : {})
      });
      onDone(data);
    } catch (err) {
      if (isApiError(err)) handleApiFailure(err);
      else setError('下單失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  }

  const originalAmount = originalAmountOf(items);
  const usable = (coupons ?? []).filter((c) => c.usable && matchesWeekday(c, startAt));
  const usedItemCoupons = items.map((item) => item.couponGrantId).filter(Boolean);
  const hasItemCoupon = usedItemCoupons.length > 0;
  const hasCartCoupon = Boolean(cartCouponGrantId);
  const cartCandidates = usable.filter((c) => isCartCouponEligible(c, originalAmount));

  return (
    <div className="stack">
      {/* 橫幅而非取代整頁：下方的選擇與金額都還在，顧客能對照著看 */}
      <ProductChangeNotice changes={changes} onAcknowledge={onAcknowledgeChanges} />

      <section className="card">
        <div className="page-head">
          <h3>預約時間</h3>
          <button type="button" className="ghost" onClick={() => onChangeTime('')}>
            更改時間
          </button>
        </div>
        <p className="confirm-time">{formatDateTimeLong(startAt)}</p>
        <p className="hint">共 {formatDuration(totalDurationOf(items))}</p>
      </section>

      <section className="card">
        <div className="page-head">
          <h3>服務與優惠券</h3>
          <button type="button" className="ghost" onClick={onChangeServices}>
            增減服務
          </button>
        </div>

        <p className="hint">
          單項折抵與整筆折抵<strong>不能同時使用</strong>，選了一種另一種會停用。
        </p>

        <ul className="confirm-list">
          {items.map((item, index) => {
            const line = preview?.items[index];
            const candidates = usable.filter(
              (c) =>
                isCouponEligibleForProduct(c, item.product) &&
                // 同一張券在同筆訂單只能出現一次
                (c.grantId === item.couponGrantId || !usedItemCoupons.includes(c.grantId))
            );

            return (
              <li key={`${item.product.productId}-${index}`} className="confirm-item">
                <div className="confirm-line">
                  <span className="select-title">{item.product.name}</span>
                  <span>{formatPrice(item.product.price)}</span>
                </div>

                <select
                  value={item.couponGrantId}
                  disabled={hasCartCoupon || candidates.length === 0}
                  onChange={(e) => onSetItemCoupon(index, e.target.value)}
                  aria-label={`${item.product.name}的優惠券`}
                >
                  <option value="">
                    {candidates.length === 0 ? '沒有適用的券' : '不使用優惠券'}
                  </option>
                  {candidates.map((coupon) => (
                    <option key={coupon.grantId} value={coupon.grantId}>
                      {describeCoupon(coupon)}
                    </option>
                  ))}
                </select>

                {line && line.discountAmount > 0 && (
                  <div className="confirm-line confirm-discount">
                    <span>{line.couponName || '優惠折抵'}</span>
                    <span>-{formatPrice(line.discountAmount)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="field">
          <label htmlFor="cart-coupon">整筆訂單折抵</label>
          <select
            id="cart-coupon"
            value={cartCouponGrantId}
            disabled={hasItemCoupon || cartCandidates.length === 0}
            onChange={(e) => onSetCartCoupon(e.target.value)}
          >
            <option value="">
              {cartCandidates.length === 0 ? '沒有適用的整筆折抵券' : '不使用優惠券'}
            </option>
            {cartCandidates.map((coupon) => (
              <option key={coupon.grantId} value={coupon.grantId}>
                {describeCoupon(coupon)}
              </option>
            ))}
          </select>
          {hasItemCoupon && <p className="hint">已使用單項折抵，整筆折抵無法同時使用。</p>}
        </div>
      </section>

      <section className="card">
        <h3>金額</h3>

        <div className="confirm-total">
          <div className="confirm-line">
            <span>服務小計</span>
            <span>{formatPrice(originalAmount)}</span>
          </div>

          {preview && preview.pricing.itemDiscountAmount > 0 && (
            <div className="confirm-line confirm-discount">
              <span>單項折抵</span>
              <span>-{formatPrice(preview.pricing.itemDiscountAmount)}</span>
            </div>
          )}

          {preview && preview.pricing.cartDiscountAmount > 0 && (
            <div className="confirm-line confirm-discount">
              <span>{preview.cartCouponName || '整筆折抵'}</span>
              <span>-{formatPrice(preview.pricing.cartDiscountAmount)}</span>
            </div>
          )}

          <div className="confirm-line confirm-final">
            <span>應付金額</span>
            <span>
              {calculating || !preview ? (
                <span className="hint">計算中…</span>
              ) : (
                formatPrice(preview.pricing.finalAmount)
              )}
            </span>
          </div>
        </div>

        {preview?.pricing.finalAmount === 0 && !calculating && (
          <p className="hint">這筆訂單已全額折抵，現場不需付款。</p>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <div className="summary-bar">
        <div>
          <span className="hint">應付金額</span>
          <strong>
            {calculating || !preview ? '計算中…' : formatPrice(preview.pricing.finalAmount)}
          </strong>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          // 有未確認的療程變更時不允許送出 —— 這是防止顧客在沒注意到
          // 價格或時長已變的情況下完成預約的最後一道關卡
          disabled={submitting || calculating || !preview || changes.length > 0}
        >
          {submitting
            ? '送出中…'
            : changes.length > 0
              ? '請先確認上方變更'
              : '確認預約'}
        </button>
      </div>
    </div>
  );
}

function describeCoupon(coupon: MyCoupon): string {
  const value =
    coupon.type === 'experience' ? '全額折抵' : `折 ${formatPrice(coupon.discountAmount)}`;
  return `${coupon.name}（${value}）`;
}

function formatDateTimeLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return (
    `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（週${weekday}）` +
    ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  );
}
