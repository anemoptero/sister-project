import { Link } from 'react-router-dom';
import { isApiConfigured } from '../api/client';
import { useAuth } from '../auth/useAuth';

export default function HomePage() {
  const { isLoggedIn, user } = useAuth();

  return (
    <div className="page">
      <h1>Sister Project</h1>
      <p>療程預約與後台管理系統</p>

      {isLoggedIn ? (
        <p>你好，{user?.displayName || '會員'}。</p>
      ) : (
        <p>
          <Link to="/login">登入</Link> 後即可預約。
        </p>
      )}

      <p>
        <Link to="/products">瀏覽療程</Link>
      </p>

      {/* 設定缺漏時給明確提示，否則整站會以「莫名連不上」的方式失敗 */}
      {!isApiConfigured() && (
        <p className="hint">
          ⚠️ 尚未設定 <code>VITE_APPS_SCRIPT_URL</code>，API 呼叫皆會失敗。
        </p>
      )}
    </div>
  );
}
