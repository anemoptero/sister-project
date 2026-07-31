import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  callApi,
  isApiError,
  productChangedDetails,
  slotUnavailableDetails,
  type ApiError
} from '../../api/client';
import { ProductDiff } from '../../components/ProductDiff';
import { ERROR_CODES, type ApiDataOf } from '../../types/api';
import type { Product } from '../../types/models';
import { formatDuration, formatPrice } from '../../utils/format';
import { totalDurationOf, type BookingItem } from './types';

interface Props {
  items: BookingItem[];
  startAt: string;
  cartCouponGrantId: string;
  onBack: () => void;
  onBackToTime: (conflictSlotStartAt: string) => void;
  onBackToServices: () => void;
  /** 產品在流程中被改過，以最新資料替換 */
  onProductUpdated: (product: Product) => void;
  onDone: (order: ApiDataOf<'createOrder'>) => void;
}

type Preview = ApiDataOf<'previewOrder'>;

/** 產品在流程途中被管理員改過 */
interface ChangedProduct {
  before: Product;
  after: Product;
}

/**
 * 步驟四：確認並送出。
 *
 * 試算（`previewOrder`）純唯讀，不佔用時間也不佔用券的額度。
 * **試算通過不代表下單一定成功** —— 中間可能被別人用掉最後一次券額度
 * 或搶走時段，所以 `createOrder` 會重新驗證一次。
 */
export function StepConfirm({
  items,
  startAt,
  cartCouponGrantId,
  onBack,
  onBackToTime,
  onBackToServices,
  onProductUpdated,
  onDone
}: Props) {
  const navigate = useNavigate();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState<ChangedProduct | null>(null);

  const buildItems = useCallback(
    () =>
      items.map((item) => ({
        productId: item.product.productId,
        // createOrder 每項必填 —— 顧客必須是看著最新的價格下單，
        // 否則會出現「畫面顯示 1800、實際記 2200」的爭議
        expectedProductVersion: item.product.version,
        ...(item.couponGrantId ? { couponGrantId: item.couponGrantId } : {})
      })),
    [items]
  );

  const runPreview = useCallback(async () => {
    setPreviewError('');
    setPreview(null);
    try {
      const data = await callApi('previewOrder', {
        startAt,
        items: buildItems(),
        ...(cartCouponGrantId ? { cartCouponGrantId } : {})
      });
      setPreview(data);
    } catch (err) {
      setPreviewError(isApiError(err) ? err.message : '試算失敗，請稍後再試。');
    }
  }, [startAt, buildItems, cartCouponGrantId]);

  useEffect(() => {
    void runPreview();
  }, [runPreview]);

  function handleApiFailure(err: ApiError) {
    // 產品在顧客瀏覽期間被改過：後端只回當前產品，差異要由前端比對
    const productChange = productChangedDetails(err);
    if (productChange) {
      const before = items.find(
        (item) => item.product.productId === productChange.product.productId
      )?.product;

      if (before) {
        setChanged({ before, after: productChange.product });
        return;
      }
    }

    const slot = slotUnavailableDetails(err);
    if (slot) {
      // 訊息本身已含時間（「16:00 這個時段已額滿」），直接顯示即可
      setError(err.message);
      onBackToTime(slot.conflictSlotStartAt);
      return;
    }

    if (err.is(ERROR_CODES.PROFILE_INCOMPLETE)) {
      void navigate(`/my/profile?from=${encodeURIComponent('/booking')}`);
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

  // --- 產品被改過 ---
  if (changed) {
    return (
      <div className="stack">
        <h2>療程內容已更新</h2>
        <p>你在選擇的這段時間裡，「{changed.after.name}」被調整了。請確認以下變動：</p>

        <ProductDiff before={changed.before} after={changed.after} />

        <div className="actions">
          <button
            type="button"
            onClick={() => {
              // 以新版本取代後重新試算，下一次送出才會帶對的 version
              onProductUpdated(changed.after);
              setChanged(null);
            }}
          >
            我知道了，以新內容繼續
          </button>
          <button type="button" className="secondary" onClick={onBackToServices}>
            重新選擇服務
          </button>
        </div>
      </div>
    );
  }

  const duration = totalDurationOf(items);

  return (
    <div className="stack">
      <div>
        <h2>確認預約</h2>
        <p className="hint">確認以下內容無誤後送出。</p>
      </div>

      <section className="card">
        <h3>預約時間</h3>
        <p className="confirm-time">{formatDateTimeLong(startAt)}</p>
        <p className="hint">共 {formatDuration(duration)}</p>
      </section>

      <section className="card">
        <h3>服務內容</h3>

        {previewError && <p className="error">{previewError}</p>}
        {!preview && !previewError && <div className="skeleton" />}

        {preview && (
          <>
            <ul className="confirm-list">
              {preview.items.map((line, index) => (
                <li key={`${line.productId}-${index}`}>
                  <div className="confirm-line">
                    <span>{line.productName}</span>
                    <span>{formatPrice(line.productPrice)}</span>
                  </div>
                  {line.discountAmount > 0 && (
                    <div className="confirm-line confirm-discount">
                      <span>{line.couponName || '優惠折抵'}</span>
                      <span>-{formatPrice(line.discountAmount)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="confirm-total">
              <div className="confirm-line">
                <span>小計</span>
                <span>{formatPrice(preview.pricing.originalAmount)}</span>
              </div>

              {preview.pricing.cartDiscountAmount > 0 && (
                <div className="confirm-line confirm-discount">
                  <span>{preview.cartCouponName || '整筆折抵'}</span>
                  <span>-{formatPrice(preview.pricing.cartDiscountAmount)}</span>
                </div>
              )}

              <div className="confirm-line confirm-final">
                <span>應付金額</span>
                <span>{formatPrice(preview.pricing.finalAmount)}</span>
              </div>
            </div>

            {preview.pricing.finalAmount === 0 && (
              <p className="hint">這筆訂單已全額折抵，現場不需付款。</p>
            )}
          </>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <div className="summary-bar">
        <button type="button" className="secondary" onClick={onBack} disabled={submitting}>
          上一步
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !preview}
        >
          {submitting ? '送出中…' : '確認預約'}
        </button>
      </div>
    </div>
  );
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
