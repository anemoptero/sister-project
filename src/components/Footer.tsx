import { Link } from 'react-router-dom';
import { useSite } from '../site/useSite';

/**
 * 前台頁尾。
 *
 * 主要作用不是導覽，而是**讓頁面有底** —— 內容少的時候，沒有頁尾的畫面
 * 會像是還沒載入完。順帶把聯絡方式放在每一頁都構得到的位置。
 */
export function Footer() {
  const { site } = useSite();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          <strong>{site.siteName}</strong>
          {site.contactAddress && <p className="hint">{site.contactAddress}</p>}
          {site.contactPhone && <p className="hint">{site.contactPhone}</p>}
        </div>

        <nav className="app-footer-nav">
          <Link to="/products">療程</Link>
          <Link to="/booking">預約</Link>
          {site.lineUrl && (
            <a href={site.lineUrl} target="_blank" rel="noreferrer">
              LINE 官方帳號
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
