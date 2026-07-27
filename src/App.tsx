import { HashRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

// 使用 HashRouter：GitHub Pages 為靜態託管，沒有伺服器端 rewrite，
// BrowserRouter 在重新整理子路由時會 404。第一階段以 HashRouter 降低部署複雜度。
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
