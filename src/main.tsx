import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { warmUpApi } from './api/warmup';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到 #root 掛載節點');
}

// 在掛載 React 之前就送出喚醒請求，讓它與畫面渲染平行進行。
// Apps Script 閒置後的第一次呼叫要 3～14 秒，熱的時候只要 1～1.7 秒。
warmUpApi();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
