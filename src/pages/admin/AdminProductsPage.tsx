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
  /** 你這次想套用的修改 */
  pending: ProductFormValues;
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

  async function handleToggleEnabled(product: Product) {
    resetFeedback();
    try {
      await callApi('adminSetProductEnabled', {
        productId: product.productId,
        enabled: !product.enabled
      });
      setMessage(`已${product.enabled ? '停用' : '啟用'}「${product.name}」。`);
      await load();
    } catch (err) {
      applyError(err);
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
    return (
      <div className="page">
        <h1>產品已被其他人修改</h1>
        <p>你開始編輯之後，這個產品被改過。請確認差異後決定怎麼做。</p>

        <ProductDiff before={conflict.baseline} after={conflict.current} />

        <div className="actions">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleUpdate(conflict.current, conflict.pending)}
          >
            仍要套用我的修改
          </button>
          <button
            type="button"
            className="secondary"
            disabled={submitting}
            onClick={() => {
              // 以最新內容重新編輯，避免又拿舊的 version 去撞一次
              setConflict(null);
              setMode({ type: 'edit', product: conflict.current });
              void load();
            }}
          >
            放棄我的修改，改用最新內容
          </button>
        </div>

        <p className="hint">
          「仍要套用」會用你剛才填的值覆蓋目前內容，未修改的欄位維持對方改過的值。
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

      {products === null && !loadError && <p className="hint">載入中…</p>}

      {products?.length === 0 && (
        <p className="hint">目前沒有任何產品。先新增一個，顧客端才有東西可以預約。</p>
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
                  <td>{product.enabled ? '啟用' : '停用'}</td>
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
