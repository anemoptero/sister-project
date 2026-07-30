import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'eslint.config.js'] },

  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [
      js.configs.recommended,
      // TypeChecked 版本需要型別資訊，比較慢，但能啟用 no-floating-promises
      // 這類真正抓得到 bug 的規則
      ...tseslint.configs.recommendedTypeChecked
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // 未使用變數視為錯誤，但允許以底線開頭表示「刻意不用」
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],

      /**
       * 本專案最重要的一條規則。
       *
       * 所有 API 呼叫都是非同步且**失敗時會 throw**。Promise 沒被 await
       * 或 catch 時，錯誤會變成 unhandled rejection 靜默消失 ——
       * 使用者看到的是「按了沒反應」，而不是錯誤訊息。
       *
       * 刻意不等待時請明確寫 `void somePromise()`。
       */
      '@typescript-eslint/no-floating-promises': 'error'
    }
  },

  {
    // 測試檔大量使用 mock 與 JSON.parse，型別上比 production code 寬鬆是合理的。
    // 但 no-floating-promises 不放行 —— 沒 await 的斷言會靜默通過，
    // 那正是測試最不該出現的失敗模式。
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  }
);
