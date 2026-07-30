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

export function setSessionToken(token: string): void {
  writeStorage(token);
}

export function clearSessionToken(): void {
  writeStorage('');
}

export function hasSessionToken(): boolean {
  return Boolean(readStorage());
}
