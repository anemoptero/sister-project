import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useSite } from '../site/useSite';
import { Footer } from './Footer';

/**
 * 前台外框。
 *
 * 只放顧客會用到的動線。管理員的功能在 `AdminLayout`，兩者不共用導覽列 ——
 * 管理員不需要（也不該）從顧客介面操作，例如代客預約應該長成後台的功能，
 * 而不是讓管理員假裝成顧客走一次前台流程。
 *
 * 已登入的管理員仍看得到「後台」入口，方便切回去。
 */
export function Layout() {
  const { isLoggedIn, isAdmin, user, signOut } = useAuth();
  const { site } = useSite();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="app-brand">
          {/* 有 Logo 就用圖，沒有就顯示店名文字 */}
          {site.logoUrl ? (
            <img src={site.logoUrl} alt={site.siteName} className="app-logo" />
          ) : (
            site.siteName
          )}
        </NavLink>

        <nav className="app-nav">
          <NavLink to="/products">療程</NavLink>
          <NavLink to="/booking">預約</NavLink>
          {isLoggedIn && <NavLink to="/my/appointments">我的預約</NavLink>}
          {isLoggedIn && <NavLink to="/my/orders">我的訂單</NavLink>}
          {isLoggedIn && <NavLink to="/my/coupons">我的優惠券</NavLink>}
        </nav>

        <div className="app-account">
          {isAdmin && (
            <NavLink to="/admin" className="app-frontlink">
              後台
            </NavLink>
          )}
          {isLoggedIn ? (
            <>
              <span className="app-username">{user?.displayName || '會員'}</span>
              {/* 登出用 ghost：視覺重點應該在預約，不是離開 */}
              <button type="button" className="ghost" onClick={() => void signOut()}>
                登出
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn">
              登入
            </NavLink>
          )}
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
