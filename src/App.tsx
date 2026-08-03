import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { RequireAdmin, RequireAuth, RequireProfile } from './components/RouteGuards';
import { SiteProvider } from './site/SiteProvider';
import AdminSitePage from './pages/admin/AdminSitePage';
import AdminBusinessHoursPage from './pages/admin/AdminBusinessHoursPage';
import AdminAppointmentsPage from './pages/admin/AdminAppointmentsPage';
import AdminCouponsPage from './pages/admin/AdminCouponsPage';
import AdminHomePage from './pages/admin/AdminHomePage';
import AdminCustomersPage from './pages/admin/AdminCustomersPage';
import AdminStatsPage from './pages/admin/AdminStatsPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import BookingPage from './pages/booking/BookingPage';
import ClaimCouponPage from './pages/my/ClaimCouponPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import MyAppointmentsPage from './pages/my/MyAppointmentsPage';
import MyCouponsPage from './pages/my/MyCouponsPage';
import MyOrdersPage from './pages/my/MyOrdersPage';
import ProductsPage from './pages/ProductsPage';
import NotFoundPage from './pages/NotFoundPage';
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
    <SiteProvider>
      <AuthProvider>
        <HashRouter>
        <Routes>
          {/* --- 後台 --- */}
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route path="/admin/business-hours" element={<AdminBusinessHoursPage />} />
              <Route path="/admin/coupons" element={<AdminCouponsPage />} />
              <Route path="/admin/customers" element={<AdminCustomersPage />} />
              {/* 訂單已併入預約頁 —— 兩者一對一，分開會讓人為了「這筆多少錢、收了沒」兩邊對照 */}
              <Route path="/admin/orders" element={<Navigate to="/admin/appointments" replace />} />
              <Route path="/admin/appointments" element={<AdminAppointmentsPage />} />
              <Route path="/admin/stats" element={<AdminStatsPage />} />
              <Route path="/admin/site" element={<AdminSitePage />} />
              <Route path="/admin/appearance" element={<Navigate to="/admin/site" replace />} />
            </Route>
          </Route>

          {/* --- 前台 --- */}
          <Route element={<Layout />}>
            {/* 公開 */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/products" element={<ProductsPage />} />

            {/* 需登入 */}
            <Route element={<RequireAuth />}>
              <Route path="/my/profile" element={<ProfilePage />} />
              <Route path="/my/appointments" element={<MyAppointmentsPage />} />
              <Route path="/my/orders" element={<MyOrdersPage />} />
              <Route path="/my/coupons" element={<MyCouponsPage />} />
              {/*
                領取碼放在網址上，店家把 #/claim/XXXX 直接分享出去即可。
                未登入時 RequireAuth 會先導去登入，登入後回到這裡繼續領取。
              */}
              <Route path="/claim" element={<ClaimCouponPage />} />
              <Route path="/claim/:token" element={<ClaimCouponPage />} />
            </Route>

            {/* 需登入且已填電話 —— 少了電話，最後一步下單會被擋 */}
            <Route element={<RequireProfile />}>
              <Route path="/booking" element={<BookingPage />} />
            </Route>

            {/* 舊網址相容：曾以 /my 作為入口 */}
            <Route path="/my" element={<Navigate to="/my/appointments" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </SiteProvider>
  );
}
