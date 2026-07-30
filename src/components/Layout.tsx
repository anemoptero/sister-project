import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/**
 * 全站外框。
 *
 * 導覽列依身分顯示不同項目 —— 但這只是體驗，不是權限控制，
 * 真正的把關在 Apps Script。
 */
export function Layout() {
  const { isLoggedIn, isAdmin, user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="app-brand">
          預約系統
        </NavLink>

        <nav className="app-nav">
          <NavLink to="/products">療程</NavLink>
          <NavLink to="/booking">預約</NavLink>
          {isLoggedIn && <NavLink to="/my/appointments">我的預約</NavLink>}
          {isAdmin && <NavLink to="/admin">後台</NavLink>}
        </nav>

        <div className="app-account">
          {isLoggedIn ? (
            <>
              <span className="app-username">{user?.displayName || '會員'}</span>
              <button type="button" onClick={() => void signOut()}>
                登出
              </button>
            </>
          ) : (
            <NavLink to="/login">登入</NavLink>
          )}
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
