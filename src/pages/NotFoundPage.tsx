import { Link } from 'react-router-dom';

// 用 div 而非 main：外層 Layout 已經有一個 <main>，巢狀 main 不合法。
export default function NotFoundPage() {
  return (
    <div className="page">
      <h1>404</h1>
      <p>找不到這個頁面。</p>
      <Link to="/">回首頁</Link>
    </div>
  );
}
