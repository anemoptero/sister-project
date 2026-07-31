import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/**
 * 後台外框。
 *
 * 與前台 `Layout` 完全分開，而不是在同一個導覽列裡依身分增減項目 ——
 * 管理員與顧客是兩種不同的操作情境，混在一起會讓後台看起來像是
 * 「顧客介面多了幾個按鈕」，實際用起來也容易誤點。
 *
 * ⚠️ 這裡的導覽只是動線，權限由 `RequireAdmin` 擋、再由 Apps Script
 * 的 `applyAuth_` 實質把關。藏起連結不構成任何防護。
 */
export function AdminLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header app-header--admin">
        <NavLink to="/admin" className="app-brand" end>
          後台
        </NavLink>

        <nav className="app-nav">
          <NavLink to="/admin/products">產品</NavLink>
          <NavLink to="/admin/business-hours">營業時間</NavLink>
          <NavLink to="/admin/coupons">優惠券</NavLink>
          <NavLink to="/admin/appointments">預約</NavLink>
          <NavLink to="/admin/orders">訂單</NavLink>
          <NavLink to="/admin/customers">會員</NavLink>
          <NavLink to="/admin/stats">統計</NavLink>
          <NavLink to="/admin/appearance">外觀</NavLink>
        </nav>

        <div className="app-account">
          {/* 保留前台入口：管理員仍需確認產品在顧客眼中長什麼樣，
              例如改完價格或圖片之後 */}
          <NavLink to="/" className="app-frontlink">
            前台
          </NavLink>
          <span className="app-username">{user?.displayName || '管理員'}</span>
          <button type="button" onClick={() => void signOut()}>
            登出
          </button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
