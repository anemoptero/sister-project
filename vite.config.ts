/// <reference types="vitest/config" />
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
  },
  test: {
    // client.ts 會碰 localStorage 與 DOMException，需要瀏覽器環境。
    // 用 happy-dom 而非 jsdom：jsdom 26 的相依鏈需要 Node 20.19+ 的
    // require(ESM) 支援，本機為 20.11.1 會直接崩在載入階段。
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: {
      // 測試不打真的網路，但 client 會在網址為空時提早拋錯，
      // 所以給一個假網址讓流程能走到 fetch（fetch 本身被 mock）
      VITE_APPS_SCRIPT_URL: 'https://example.test/exec'
    }
  }
});
