import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError, productChangedDetails, validationField } from '../../api/client';
import { ProductDiff } from '../../components/ProductDiff';
import type { Product } from '../../types/models';
import { formatDuration, formatPrice } from '../../utils/format';
import { ProductForm, type ProductFormValues } from './ProductForm';

type Mode =
  | { type: 'list' }
  | { type: 'create' }
  /** product 是**載入當下**的內容，同時作為樂觀鎖的比較基準 */
  | { type: 'edit'; product: Product };

/**
 * 版本衝突：另一位管理員在你編輯期間改過同一個產品。
 * 保留三份資料才能讓使用者做出有依據的選擇。
 */
interface Conflict {
  /** 你開始編輯時看到的內容 */
  baseline: Product;
  /** 後端回傳的當前內容 */
  current: Product;
  /**
   * 你這次想套用的修改。
   *
   * `null` 代表衝突來自列表上的啟用／停用切換，那裡沒有表單值 ——
   * 要套用的只有 `baseline.enabled` 的反向值。
   */
  pending: ProductFormValues | null;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>({ type: 'list' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorField, setErrorField] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      // admin 才看得到停用的產品；非 admin 傳這個參數會被靜默忽略
      const data = await callApi('listProducts', { includeDisabled: true });
      setProducts(data.products);
    } catch (err) {
      setLoadError(isApiError(err) ? err.message : '載入產品失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFeedback() {
    setErrorMessage('');
    setErrorField('');
    setMessage('');
  }

  async function handleCreate(values: ProductFormValues) {
    setSubmitting(true);
    resetFeedback();
    try {
      await callApi('adminCreateProduct', values);
      setMode({ type: 'list' });
      setMessage(`已新增「${values.name}」。`);
      await load();
    } catch (err) {
      applyError(err);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * @param baseline 比較基準與 expectedVersion 的來源。
   *   衝突後選擇「仍要套用」時會換成後端回傳的最新版，
   *   否則重送必然再次撞上同一個版本衝突。
   */
  async function handleUpdate(baseline: Product, values: ProductFormValues) {
    const changed = diffValues(baseline, values);

    if (Object.keys(changed).length === 0) {
      setMode({ type: 'list' });
      setMessage('沒有任何變更。');
      return;
    }

    setSubmitting(true);
    resetFeedback();
    try {
      await callApi('adminUpdateProduct', {
        productId: baseline.productId,
        expectedVersion: baseline.version,
        ...changed
      });
      setMode({ type: 'list' });
      setConflict(null);
      setMessage(`已更新「${values.name}」。`);
      await load();
    } catch (err) {
      if (isApiError(err)) {
        const details = productChangedDetails(err);
        if (details) {
          // 不直接覆蓋，也不直接放棄 —— 讓管理員看見差異後自己決定
          setConflict({ baseline, current: details.product, pending: values });
          setSubmitting(false);
          return;
        }
      }
      applyError(err);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 切換啟用狀態。
   *
   * `expectedVersion` 是「我看到的是版本 N」的宣告。少了它，後端那道
   * 版本檢查就形同沒有 —— 而它防的是這種情況：管理員 A 打開列表看到
   * 「臉部保養 · 1800 元 · 啟用中」，去接了通電話，這期間 B 把價格改成
   * 2200，A 回來按下停用。A 是根據已經過期的畫面在做決定。
   *
   * 帶上版本號之後，後端會回 `PRODUCT_CHANGED`，管理員先看到 B 的修改
   * 再決定要不要停用。
   */
  function handleToggleEnabled(product: Product) {
    resetFeedback();
    void applyToggle(product, !product.enabled);
  }

  /**
   * @param baseline `expectedVersion` 的來源。衝突後選擇「仍要切換」時
   *   會換成後端回傳的最新版，否則重送必然再次撞上同一個版本衝突。
   */
  async function applyToggle(baseline: Product, enabled: boolean) {
    setSubmitting(true);
    try {
      await callApi('adminSetProductEnabled', {
        productId: baseline.productId,
        enabled,
        expectedVersion: baseline.version
      });
      setConflict(null);
      setMessage(`已${enabled ? '啟用' : '停用'}「${baseline.name}」。`);
      await load();
    } catch (err) {
      if (isApiError(err)) {
        const details = productChangedDetails(err);
        if (details) {
          // 與編輯表單走同一條路：顯示差異，讓管理員看過再決定。
          // pending 為 null —— 這裡沒有待送出的表單，只有一個切換
          setConflict({ baseline, current: details.product, pending: null });
          return;
        }
      }
      applyError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function applyError(err: unknown) {
    if (isApiError(err)) {
      setErrorMessage(err.message);
      setErrorField(validationField(err));
    } else {
      setErrorMessage('操作失敗，請稍後再試。');
    }
  }

  // --- 版本衝突 ---
  if (conflict) {
    const isToggle = conflict.pending === null;
    const toggleTarget = !conflict.baseline.enabled;

    return (
      <div className="page">
        <h1>產品已被其他人修改</h1>
        <p>
          {isToggle
            ? '你看到這份列表之後，這個產品被改過。確認差異後再決定要不要切換。'
            : '你開始編輯之後，這個產品被改過。請確認差異後決定怎麼做。'}
        </p>

        <ProductDiff before={conflict.baseline} after={conflict.current} />

        <div className="actions">
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (conflict.pending) {
                void handleUpdate(conflict.current, conflict.pending);
              } else {
                // 帶最新版本重送，否則必然再撞一次同樣的衝突
                void applyToggle(conflict.current, toggleTarget);
              }
            }}
          >
            {isToggle ? `仍要${toggleTarget ? '啟用' : '停用'}` : '仍要套用我的修改'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={submitting}
            onClick={() => {
              // 以最新內容重新編輯，避免又拿舊的 version 去撞一次
              setConflict(null);
              setMode(isToggle ? { type: 'list' } : { type: 'edit', product: conflict.current });
              void load();
            }}
          >
            {isToggle ? '先不切換，回到列表' : '放棄我的修改，改用最新內容'}
          </button>
        </div>

        <p className="hint">
          {isToggle
            ? '切換只會改動啟用狀態，不會覆蓋對方剛改的其他欄位。'
            : '「仍要套用」會用你剛才填的值覆蓋目前內容，未修改的欄位維持對方改過的值。'}
        </p>
      </div>
    );
  }

  // --- 表單 ---
  if (mode.type === 'create' || mode.type === 'edit') {
    const initial = mode.type === 'edit' ? mode.product : undefined;
    return (
      <div className="page">
        {errorMessage && <p className="error">{errorMessage}</p>}
        <ProductForm
          key={initial?.productId ?? 'new'}
          initial={initial}
          submitting={submitting}
          errorField={errorField}
          onCancel={() => {
            resetFeedback();
            setMode({ type: 'list' });
          }}
          onSubmit={(values) => {
            if (mode.type === 'edit') {
              void handleUpdate(mode.product, values);
            } else {
              void handleCreate(values);
            }
          }}
        />
      </div>
    );
  }

  // --- 列表 ---
  return (
    <div className="page">
      <div className="page-head">
        <h1>產品管理</h1>
        <button
          type="button"
          onClick={() => {
            resetFeedback();
            setMode({ type: 'create' });
          }}
        >
          新增產品
        </button>
      </div>

      {message && <p className="success">{message}</p>}
      {errorMessage && <p className="error">{errorMessage}</p>}
      {loadError && <p className="error">{loadError}</p>}

      {/* Apps Script 的回應動輒數秒，純文字的「載入中」很容易被當成當機。
          骨架至少讓人看得出畫面正在等資料而不是壞了。 */}
      {products === null && !loadError && (
        <div className="table-scroll" style={{ padding: 'var(--space-4)' }}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {products?.length === 0 && (
        <div className="empty-state">
          <h2>還沒有任何產品</h2>
          <p>先新增一個，顧客端才有東西可以預約。</p>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>排序</th>
                <th>名稱</th>
                <th>價格</th>
                <th>療程時間</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.productId} className={product.enabled ? '' : 'row-disabled'}>
                  <td>{product.displayOrder}</td>
                  <td>
                    {product.name}
                    {product.description && (
                      <div className="hint cell-sub">{product.description}</div>
                    )}
                  </td>
                  <td>{formatPrice(product.price)}</td>
                  <td>{formatDuration(product.durationMinutes)}</td>
                  <td>
                    <span className={`tag ${product.enabled ? 'tag--on' : 'tag--off'}`}>
                      {product.enabled ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          resetFeedback();
                          setMode({ type: 'edit', product });
                        }}
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void handleToggleEnabled(product)}
                      >
                        {product.enabled ? '停用' : '啟用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        停用產品不影響既有的預約與訂單，只是不再出現在前台、也不可被新的預約選用。
      </p>
    </div>
  );
}

/**
 * 只挑出真正變動的欄位。
 *
 * `adminUpdateProduct` 是部分更新，沒出現的欄位維持原值。全部送出雖然也能動，
 * 但稽核紀錄會變成「每次都改了所有欄位」，就看不出實際改了什麼。
 */
function diffValues(baseline: Product, values: ProductFormValues): Partial<ProductFormValues> {
  const changed: Partial<ProductFormValues> = {};

  if (values.name !== baseline.name) changed.name = values.name;
  if (values.description !== baseline.description) changed.description = values.description;
  if (values.price !== baseline.price) changed.price = values.price;
  if (values.durationMinutes !== baseline.durationMinutes) {
    changed.durationMinutes = values.durationMinutes;
  }
  if (values.imageUrl !== baseline.imageUrl) changed.imageUrl = values.imageUrl;
  if (values.imageAlt !== baseline.imageAlt) changed.imageAlt = values.imageAlt;
  if (values.displayOrder !== baseline.displayOrder) changed.displayOrder = values.displayOrder;
  if (values.enabled !== baseline.enabled) changed.enabled = values.enabled;

  return changed;
}
