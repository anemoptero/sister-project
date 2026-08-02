import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * 每個測試結束後清掉 DOM。
 *
 * Testing Library 只有在 vitest 開啟 `globals` 時才會自動註冊這件事。
 * 本專案沒有開（明確 import 比隱式全域清楚），所以必須自己來 ——
 * 少了它，前一個測試的畫面會留在 document 裡，後續查詢就會撞到
 * 「Found multiple elements」而不是真的有 bug。
 */
afterEach(() => {
  cleanup();
});
