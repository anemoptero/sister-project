import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callApi, isApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import type { Product } from '../types/models';
import { formatDuration, formatPrice } from '../utils/format';

/**
 * 療程列表。
 *
 * 公開頁面 —— 未登入也看得到，登入才需要在預約時檢查。
 * `listProducts` 的權限層級是 OPTIONAL：沒帶 token 以訪客身分回傳啟用中的產品。
 */
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callApi('listProducts', {});
      setProducts(data.products);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入療程失敗，請稍後再試。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 帶著選定的產品進入預約流程。
   *
   * 用 router state 傳遞而非網址參數：`/booking` 不帶 `:productId`，
   * 因為一次預約可含多項服務，產品選擇是流程中的一步而非入口參數。
   * 這裡只是替顧客先勾好一項，他仍可在流程中增減。
   */
  function startBooking(productId: string) {
    if (!isLoggedIn) {
      void navigate('/login', { state: { from: '/booking' } });
      return;
    }
    void navigate('/booking', { state: { preselect: productId } });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>療程</h1>
        <button type="button" onClick={() => startBooking('')}>
          開始預約
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {products === null && !error && (
        <div className="product-grid">
          <div className="card skeleton-card">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
          <div className="card skeleton-card">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
      )}

      {products?.length === 0 && (
        <div className="empty-state">
          <h2>目前沒有開放的療程</h2>
          <p>請稍後再回來看看。</p>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="product-grid">
          {products.map((product) => (
            <article className="card product-card" key={product.productId}>
              {product.imageUrl && (
                <img
                  className="product-image"
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  loading="lazy"
                />
              )}

              <div className="product-body">
                <h2>{product.name}</h2>
                {product.description && <p>{product.description}</p>}

                <dl className="product-meta">
                  <div>
                    <dt>價格</dt>
                    <dd className="product-price">{formatPrice(product.price)}</dd>
                  </div>
                  <div>
                    <dt>療程時間</dt>
                    <dd>{formatDuration(product.durationMinutes)}</dd>
                  </div>
                </dl>

                <button type="button" onClick={() => startBooking(product.productId)}>
                  預約這項療程
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
