import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, isApiConfigured } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useSite } from '../site/useSite';
import type { Product } from '../types/models';
import { formatDuration, formatPrice } from '../utils/format';

/** 首頁只放前幾項，看完整清單請到療程頁 */
const FEATURED_LIMIT = 3;

export default function HomePage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const { site } = useSite();
  const [products, setProducts] = useState<Product[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await callApi('listProducts', {});
      setProducts(data.products);
    } catch {
      // 首頁的療程只是導引，載入失敗就不顯示這一區，不必打擾訪客
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featured = (products ?? []).slice(0, FEATURED_LIMIT);
  const hasContact = site.contactPhone || site.contactAddress || site.lineUrl;

  return (
    <div className="home">
      {/* 主視覺獨立於 .page 之外，才能做滿版底色 */}
      <section className="hero">
        <div className="hero-inner">
          <h1>{site.siteName}</h1>
          {site.tagline && <p className="hero-tagline">{site.tagline}</p>}
          {site.description && <p className="hero-desc">{site.description}</p>}

          <div className="hero-actions">
            <Link className="btn" to={isLoggedIn ? '/booking' : '/login'}>
              立即預約
            </Link>
            <Link className="btn secondary" to="/products">
              瀏覽療程
            </Link>
          </div>
        </div>
      </section>

      <div className="page">
        {/* 尚未設定過時，只有管理員看得到這則提示 —— 訪客不需要知道 */}
        {isAdmin && !site.configured && (
          <p className="notice">
            尚未設定網站資訊，目前顯示的是預設值。
            <Link to="/admin/site"> 前往設定店名、介紹與聯絡方式</Link>。
          </p>
        )}

        {featured.length > 0 && (
          <section className="home-section">
            <div className="page-head">
              <h2>熱門療程</h2>
              <Link to="/products">看全部</Link>
            </div>

            <div className="product-grid">
              {featured.map((product) => (
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
                    <h3>{product.name}</h3>
                    {product.description && <p>{product.description}</p>}
                    <p className="product-line">
                      <span className="product-price">{formatPrice(product.price)}</span>
                      <span className="hint">{formatDuration(product.durationMinutes)}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {site.businessNote && (
          <section className="home-section">
            <h2>營業說明</h2>
            {/* 保留換行：工作室常會分行寫營業時間 */}
            <p className="preserve-lines">{site.businessNote}</p>
          </section>
        )}

        {hasContact && (
          <section className="home-section">
            <h2>聯絡我們</h2>
            <dl className="contact-list">
              {site.contactPhone && (
                <div>
                  <dt>電話</dt>
                  <dd>
                    {/* tel: 讓手機一點就撥號 */}
                    <a href={`tel:${site.contactPhone.replace(/[^\d+]/g, '')}`}>
                      {site.contactPhone}
                    </a>
                  </dd>
                </div>
              )}
              {site.contactAddress && (
                <div>
                  <dt>地址</dt>
                  <dd>{site.contactAddress}</dd>
                </div>
              )}
              {site.lineUrl && (
                <div>
                  <dt>LINE</dt>
                  <dd>
                    <a href={site.lineUrl} target="_blank" rel="noreferrer">
                      加入官方帳號
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* 設定缺漏時給明確提示，否則整站會以「莫名連不上」的方式失敗 */}
        {!isApiConfigured() && (
          <p className="error">
            尚未設定 <code>VITE_APPS_SCRIPT_URL</code>，所有功能都無法使用。
          </p>
        )}
      </div>
    </div>
  );
}
