import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { RequireAdmin, RequireAuth, RequireProfile } from './components/RouteGuards';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ProfilePage from './pages/ProfilePage';

/**
 * 路由表，對應 docs/DEV_PLAN.md Phase 9 與 AGENT_GUIDE.md §9.1。
 *
 * 使用 HashRouter：GitHub Pages 為靜態託管，沒有伺服器端 rewrite，
 * BrowserRouter 在重新整理子路由時會 404。
 *
 * 前台與後台使用**不同的外框**（Layout / AdminLayout）。管理員與顧客是
 * 兩種操作情境，共用一條導覽列會讓後台看起來像顧客介面多加了幾個按鈕。
 */
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* --- 後台 --- */}
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<PlaceholderPage title="後台首頁" stage="D 段" />} />
              <Route
                path="/admin/products"
                element={<PlaceholderPage title="產品管理" stage="D 段" />}
              />
              <Route
                path="/admin/business-hours"
                element={<PlaceholderPage title="營業時間" stage="D 段" />}
              />
              <Route
                path="/admin/coupons"
                element={<PlaceholderPage title="優惠券與發放活動" stage="D 段" />}
              />
              <Route
                path="/admin/customers"
                element={<PlaceholderPage title="會員管理" stage="F 段" />}
              />
              <Route
                path="/admin/orders"
                element={<PlaceholderPage title="訂單查詢" stage="F 段" />}
              />
              <Route
                path="/admin/appointments"
                element={<PlaceholderPage title="預約查詢" stage="F 段" />}
              />
              <Route
                path="/admin/stats"
                element={<PlaceholderPage title="銷售統計" stage="F 段" />}
              />
            </Route>
          </Route>

          {/* --- 前台 --- */}
          <Route element={<Layout />}>
            {/* 公開 */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/products"
              element={<PlaceholderPage title="療程列表" stage="E 段" />}
            />

            {/* 需登入 */}
            <Route element={<RequireAuth />}>
              <Route path="/my/profile" element={<ProfilePage />} />
              <Route
                path="/my/appointments"
                element={<PlaceholderPage title="我的預約" stage="E 段" />}
              />
              <Route
                path="/my/orders"
                element={<PlaceholderPage title="我的訂單" stage="E 段" />}
              />
              <Route
                path="/my/coupons"
                element={<PlaceholderPage title="我的優惠券" stage="E 段" />}
              />
            </Route>

            {/* 需登入且已填電話 —— 少了電話，最後一步下單會被擋 */}
            <Route element={<RequireProfile />}>
              <Route
                path="/booking"
                element={<PlaceholderPage title="預約流程" stage="E 段" />}
              />
            </Route>

            {/* 舊網址相容：曾以 /my 作為入口 */}
            <Route path="/my" element={<Navigate to="/my/appointments" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
