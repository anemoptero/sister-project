import { Link } from 'react-router-dom';
import { isApiConfigured } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useSite } from '../site/useSite';

export default function HomePage() {
  const { isLoggedIn, user } = useAuth();
  const { site } = useSite();

  const hasContact = site.contactPhone || site.contactAddress || site.lineUrl;

  return (
    <div className="page">
      <section className="hero">
        <h1>{site.siteName}</h1>
        {site.tagline && <p className="hero-tagline">{site.tagline}</p>}
        {site.description && <p className="hero-desc">{site.description}</p>}

        <div className="actions">
          <Link className="btn" to="/products">
            瀏覽療程
          </Link>
          {!isLoggedIn && (
            <Link className="btn secondary" to="/login">
              登入
            </Link>
          )}
        </div>

        {isLoggedIn && <p className="hint">你好，{user?.displayName || '會員'}。</p>}
      </section>

      {site.businessNote && (
        <section className="card">
          <h2>營業說明</h2>
          {/* 保留換行：工作室常會分行寫營業時間 */}
          <p className="preserve-lines">{site.businessNote}</p>
        </section>
      )}

      {hasContact && (
        <section className="card" style={{ marginTop: 'var(--space-5)' }}>
          <h2>聯絡我們</h2>
          <dl className="contact-list">
            {site.contactPhone && (
              <div>
                <dt>電話</dt>
                <dd>{site.contactPhone}</dd>
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
        <p className="hint">
          ⚠️ 尚未設定 <code>VITE_APPS_SCRIPT_URL</code>，API 呼叫皆會失敗。
        </p>
      )}
    </div>
  );
}
