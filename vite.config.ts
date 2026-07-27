import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 使用相對路徑，讓 GitHub Pages 部署在 /<repo-name>/ 子路徑下時
// 資源仍能正確載入，且不需要在建立 repo 後回頭改設定。
// 路由使用 HashRouter，因此不需要 404.html fallback。
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173
  }
});
