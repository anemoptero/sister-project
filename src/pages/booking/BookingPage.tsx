import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import type { ApiDataOf } from '../../types/api';
import type { Product } from '../../types/models';
import { formatPrice } from '../../utils/format';
import { StepConfirm } from './StepConfirm';
import { StepCoupons } from './StepCoupons';
import { StepServices } from './StepServices';
import { StepTime } from './StepTime';
import { totalDurationOf, type BookingItem } from './types';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: '選服務',
  2: '選時間',
  3: '優惠券',
  4: '確認'
};

/**
 * 預約流程。
 *
 * 步驟順序不是排版偏好，而是**資料相依**：
 *
 * ```text
 * 選服務 → 得到總時長 → 才能查可預約時間 → 有了開始時間 → 才能判斷券的星期限制
 * ```
 *
 * 因此服務組合一變動就必須清掉後面的選擇，否則會拿舊時長算出的時段
 * 去預約新的組合，或套用一張在新時間其實不適用的券。
 */
export default function BookingPage() {
  const location = useLocation();
  const preselect = (location.state as { preselect?: string } | null)?.preselect ?? '';

  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState('');

  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [startAt, setStartAt] = useState('');
  const [cartCouponGrantId, setCartCouponGrantId] = useState('');
  const [conflictSlot, setConflictSlot] = useState('');
  const [timeReloadKey, setTimeReloadKey] = useState(0);
  const [done, setDone] = useState<ApiDataOf<'createOrder'> | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await callApi('listProducts', {});
      setProducts(data.products);

      if (preselect) {
        const found = data.products.find((p) => p.productId === preselect);
        if (found) setItems([{ product: found, couponGrantId: '' }]);
      }
    } catch (err) {
      setLoadError(isApiError(err) ? err.message : '載入療程失敗，請稍後再試。');
    }
  }, [preselect]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 服務組合變動時，清掉時間與券。
   *
   * 總時長變了，原本選的時段不一定塞得下；開始時間沒了，券的星期限制
   * 也就無從判斷。留著舊選擇只會讓顧客在最後一步才被退回。
   */
  function toggleProduct(product: Product) {
    setItems((prev) => {
      const exists = prev.some((item) => item.product.productId === product.productId);
      return exists
        ? prev.filter((item) => item.product.productId !== product.productId)
        : [...prev, { product, couponGrantId: '' }];
    });
    setStartAt('');
    setCartCouponGrantId('');
    setConflictSlot('');
  }

  function setItemCoupon(index: number, grantId: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, couponGrantId: grantId } : item))
    );
  }

  /** 產品在流程途中被改過，以最新資料替換但保留已選的券 */
  function updateProduct(next: Product) {
    setItems((prev) =>
      prev.map((item) =>
        item.product.productId === next.productId ? { ...item, product: next } : item
      )
    );
  }

  if (done) {
    return <BookingSuccess result={done} />;
  }

  if (loadError) {
    return (
      <div className="page">
        <h1>預約</h1>
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (products === null) {
    return (
      <div className="page">
        <h1>預約</h1>
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  return (
    <div className="page">
      <h1>預約</h1>

      <ol className="steps">
        {([1, 2, 3, 4] as Step[]).map((value) => (
          <li
            key={value}
            className={`step${value === step ? ' is-active' : ''}${
              value < step ? ' is-done' : ''
            }`}
          >
            <span className="step-index">{value}</span>
            <span>{STEP_LABELS[value]}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <StepServices
          products={products}
          items={items}
          onToggle={toggleProduct}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepTime
          totalDurationMinutes={totalDurationOf(items)}
          startAt={startAt}
          conflictSlotStartAt={conflictSlot}
          reloadKey={timeReloadKey}
          onSelect={(value) => {
            setStartAt(value);
            setConflictSlot('');
          }}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepCoupons
          items={items}
          startAt={startAt}
          cartCouponGrantId={cartCouponGrantId}
          onSetItemCoupon={setItemCoupon}
          onSetCartCoupon={setCartCouponGrantId}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <StepConfirm
          items={items}
          startAt={startAt}
          cartCouponGrantId={cartCouponGrantId}
          onBack={() => setStep(3)}
          onBackToServices={() => setStep(1)}
          onBackToTime={(conflict) => {
            // 時段被搶走：回到選時間並重新查詢，同時標出衝突的那一格
            setConflictSlot(conflict);
            setStartAt('');
            setTimeReloadKey((k) => k + 1);
            setStep(2);
          }}
          onProductUpdated={updateProduct}
          onDone={setDone}
        />
      )}
    </div>
  );
}

function BookingSuccess({ result }: { result: ApiDataOf<'createOrder'> }) {
  const { appointment, order } = result;

  return (
    <div className="page">
      <div className="card success-card">
        <h1>預約完成</h1>
        <p>我們已收到你的預約，期待為你服務。</p>

        <dl className="product-meta">
          <div>
            <dt>時間</dt>
            <dd>{new Date(appointment.startAt).toLocaleString('zh-TW', { hour12: false })}</dd>
          </div>
          <div>
            <dt>應付金額</dt>
            <dd className="product-price">{formatPrice(order.finalAmount)}</dd>
          </div>
        </dl>

        <div className="actions">
          <Link className="btn" to="/my/appointments">
            查看我的預約
          </Link>
          <Link className="btn secondary" to="/products">
            繼續瀏覽療程
          </Link>
        </div>
      </div>
    </div>
  );
}
