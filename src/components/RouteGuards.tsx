import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/**
 * 路由守衛。
 *
 * ⚠️ 這裡擋的是**畫面**，不是資料。真正的權限檢查在 Apps Script ——
 * 前端守衛被繞過時 API 仍會回 `UNAUTHORIZED` / `FORBIDDEN`。
 * 見 docs/AGENT_GUIDE.md §4.2、§13.4。
 */

function LoadingScreen() {
  return (
    <div className="page">
      <p className="hint">載入中…</p>
    </div>
  );
}

/** 需要登入。未登入時導向 /login，並記住原本要去的位置 */
export function RequireAuth() {
  const { initializing, isLoggedIn } = useAuth();
  const location = useLocation();

  // 必須等初始化完成才判斷，否則重新整理的瞬間
  // 已登入的使用者會被閃到登入頁
  if (initializing) return <LoadingScreen />;

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/** 需要 admin。非 admin 給明確訊息而非導回首頁，免得使用者以為是當機 */
export function RequireAdmin() {
  const { initializing, isLoggedIn, isAdmin } = useAuth();
  const location = useLocation();

  if (initializing) return <LoadingScreen />;

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <h1>無法存取</h1>
        <p>此頁面僅限管理員使用。</p>
        <p className="hint">
          若你應該有管理權限，請確認 Firestore 中 <code>users</code> 的 <code>role</code> 已設為{' '}
          <code>admin</code>。
        </p>
      </div>
    );
  }

  return <Outlet />;
}

/**
 * 需要完整個人資料（目前是電話）。
 *
 * 沒有電話的使用者呼叫 `createOrder` 會被後端擋下並回 `PROFILE_INCOMPLETE`，
 * 與其讓顧客選完服務、挑好時間才在最後一步被退回，不如進入流程前就先補齊。
 */
export function RequireProfile() {
  const { initializing, isLoggedIn, profileComplete } = useAuth();
  const location = useLocation();

  if (initializing) return <LoadingScreen />;

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!profileComplete) {
    return <Navigate to="/my/profile" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
