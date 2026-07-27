import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="page">
      <h1>404</h1>
      <p>找不到這個頁面。</p>
      <Link to="/">回首頁</Link>
    </main>
  );
}
