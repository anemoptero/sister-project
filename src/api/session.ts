/**
 * sessionToken 的保存位置。
 *
 * 第一階段放 localStorage（`docs/AGENT_GUIDE.md` §9.4）。刻意獨立成一個模組，
 * 是為了讓日後改用更安全的策略時只需要動這個檔案 —— 其餘程式一律透過
 * `getSessionToken()` / `setSessionToken()` 存取，不直接碰 localStorage。
 *
 * ⚠️ token 是 `{sessionId}.{secret}` 格式的憑證，等同密碼。
 * 不可寫進 log、不可放進網址、不可傳給第三方。
 */

const STORAGE_KEY = 'sister.sessionToken';

/**
 * localStorage 在少數環境會直接拋例外（Safari 無痕模式、瀏覽器停用
 * cookie/儲存權限、LINE 內建瀏覽器的特殊情境）。存取失敗時退回記憶體，
 * 讓使用者至少能在當次瀏覽中維持登入，而不是整個 App 掛掉。
 */
let memoryFallback = '';

function readStorage(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return memoryFallback;
  }
}

function writeStorage(token: string): void {
  memoryFallback = token;
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 已寫進 memoryFallback，忽略
  }
}

export function getSessionToken(): string {
  return readStorage();
}

// ---------------------------------------------------------------------------
// 使用者快取
// ---------------------------------------------------------------------------

const USER_KEY = 'sister.user';

/**
 * 上次登入取得的使用者資料。
 *
 * **只用來讓畫面先渲染，不作為權限依據。**
 *
 * 為什麼需要：每次呼叫 Apps Script 的固定開銷是數秒起跳。若每次開啟頁面
 * 都要先等 `getCurrentUser` 回來才敢渲染，使用者會先盯著幾秒空白，
 * 接著頁面自己的資料再等第二次往返 —— 兩段串起來就是十幾秒。
 *
 * 改成先用快取渲染、背景再重新確認，可以省掉那一段串行等待。
 *
 * ⚠️ 快取可能過期（例如 role 剛被調整）。這不構成安全問題 ——
 * 所有實際操作都由 Apps Script 重新驗證，前端頂多短暫多顯示一個
 * 進不去的選單，背景確認回來後就會修正。
 */
export function getCachedUser<T>(): T | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: unknown): void {
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // 寫不進去就只是少一層快取，不影響功能
  }
}

export function clearCachedUser(): void {
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // 同上
  }
}

export function setSessionToken(token: string): void {
  writeStorage(token);
}

export function clearSessionToken(): void {
  writeStorage('');
}

/** 登出或 session 失效時一併清掉，避免留下沒有 token 卻有身分的矛盾狀態 */
export function clearSession(): void {
  writeStorage('');
  clearCachedUser();
}

export function hasSessionToken(): boolean {
  return Boolean(readStorage());
}
