/**
 * LIFF 初始化與 LINE 身分取得。
 *
 * 全站唯一碰 `@line/liff` 的地方 —— 其餘程式一律透過這裡的函式，
 * 避免各頁面各自 init 造成重複初始化與難以追蹤的狀態。
 *
 * 流程（docs/DEV_PLAN.md §4）：
 *   liff.init → 未登入則 liff.login（會離開頁面）→ 回來後取 idToken
 *   → 呼叫 loginWithLine → 取得系統 sessionToken
 *
 * ⚠️ LIFF ID 是公開值，不是機密。真正的把關是 idToken 上的 LINE 簽章 ——
 * Apps Script 會拿去 LINE 的 verify 端點驗證，偽造不出來。
 */

import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID ?? '';

/**
 * `liff.init()` 只能有意義地執行一次，重複呼叫會浪費時間也可能有副作用。
 * 用 promise 快取讓並行呼叫共用同一次初始化 —— 存 promise 而非布林值，
 * 才能讓「初始化進行中」的第二個呼叫等待同一個結果，而不是又發動一次。
 */
let initPromise: Promise<void> | null = null;

export class LiffError extends Error {
  readonly code: LiffErrorCode;

  constructor(code: LiffErrorCode, message: string) {
    super(message);
    this.name = 'LiffError';
    this.code = code;
  }
}

export type LiffErrorCode =
  /** VITE_LIFF_ID 未設定 —— 部署設定問題，不是使用者的錯 */
  | 'NOT_CONFIGURED'
  /** liff.init 失敗，通常是 LIFF ID 錯誤或 Endpoint URL 不符 */
  | 'INIT_FAILED'
  /** 已登入 LINE 但拿不到 idToken，多半是 LIFF App 沒開 openid scope */
  | 'NO_ID_TOKEN'
  /** idToken 已過期，需要重新向 LINE 取得。可自動修復 */
  | 'ID_TOKEN_EXPIRED';

/**
 * idToken 過期的判斷閾值。
 *
 * 留 60 秒緩衝：token 在送達後端的路上剛好過期的話，
 * 使用者會收到一個看起來莫名其妙的驗證失敗。
 */
const ID_TOKEN_EXPIRY_SKEW_SECONDS = 60;

/**
 * idToken 是否已過期（或即將過期）。
 *
 * @param exp JWT 的 exp，單位是**秒**不是毫秒
 * @param nowSeconds 現在時間（秒）
 */
export function isIdTokenExpired(exp: number | undefined, nowSeconds: number): boolean {
  // 沒有 exp 就無從判斷，一律當成過期 —— fail closed。
  // 當成有效的話會送出一個必定被拒絕的 token，錯誤更難懂。
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return true;
  return nowSeconds >= exp - ID_TOKEN_EXPIRY_SKEW_SECONDS;
}

export function isLiffConfigured(): boolean {
  return Boolean(LIFF_ID);
}

export async function initLiff(): Promise<void> {
  if (!LIFF_ID) {
    throw new LiffError(
      'NOT_CONFIGURED',
      '尚未設定 LIFF ID，請確認部署環境的 VITE_LIFF_ID'
    );
  }

  if (!initPromise) {
    initPromise = liff.init({ liffId: LIFF_ID }).catch((err: unknown) => {
      // 失敗時清掉快取，讓使用者按「重試」能真的重試，
      // 而不是一直拿到同一個已失敗的 promise
      initPromise = null;
      throw new LiffError(
        'INIT_FAILED',
        `LIFF 初始化失敗：${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  return initPromise;
}

export function isLoggedInToLine(): boolean {
  return liff.isLoggedIn();
}

/** 是否在 LINE App 內建瀏覽器中。外部瀏覽器仍可登入，只是流程會跳轉到 LINE */
export function isInLineClient(): boolean {
  return liff.isInClient();
}

/**
 * 導向 LINE 登入。**這會離開目前頁面**，呼叫之後的程式不會執行到。
 *
 * @param redirectUri 登入後要回到的完整網址。LIFF 會原樣帶回，
 *   包含 hash 路由 —— 這是 HashRouter 下能回到原本頁面的關鍵。
 */
export function lineLogin(redirectUri?: string): void {
  liff.login(redirectUri ? { redirectUri } : undefined);
}

export function lineLogout(): void {
  liff.logout();
}

/**
 * 取得 LINE idToken，交給後端驗證。
 *
 * 這是整個身分鏈的起點：前端拿不到也偽造不了有效的 token，
 * 後端則以 LINE 的 verify 端點確認簽章與 aud。
 */
export function getLineIdToken(): string {
  const token = liff.getIDToken();
  if (!token) {
    throw new LiffError(
      'NO_ID_TOKEN',
      '無法取得 LINE 身分資訊，請確認 LIFF App 已開啟 openid 權限'
    );
  }

  /**
   * ⚠️ `liff.getIDToken()` 回傳的是**登入當下取得的那一份**，不會自動更新。
   *
   * LIFF 的登入狀態（`isLoggedIn()`）維持得比 idToken 的有效期久得多，
   * 所以會出現這種情況：使用者看起來還登入著，拿到的卻是一份過期的 token，
   * 後端驗證必然失敗，而錯誤訊息只會是「LINE idToken 驗證失敗」，
   * 完全看不出是過期造成的。
   *
   * 因此送出前先自行檢查，過期就走重新登入取得新的。
   */
  const decoded = liff.getDecodedIDToken();
  if (isIdTokenExpired(decoded?.exp, Math.floor(Date.now() / 1000))) {
    throw new LiffError('ID_TOKEN_EXPIRED', 'LINE 登入資訊已過期，正在重新登入…');
  }

  return token;
}

/**
 * 清掉 LINE 的登入狀態再重新登入，用於取得全新的 idToken。
 *
 * 只呼叫 `liff.login()` 不夠 —— 已登入狀態下它可能直接返回而不重新取得 token。
 * 必須先 `logout()` 才能確保拿到新的。
 *
 * **這會離開目前頁面**，呼叫之後的程式不會執行到。
 */
export function forceLineRelogin(redirectUri: string): void {
  try {
    liff.logout();
  } catch {
    // 清除失敗仍然嘗試登入，最壞的情況是又拿到同一份過期 token，
    // 由呼叫端的重試上限擋住無限迴圈
  }
  liff.login({ redirectUri });
}

/**
 * 取得 LINE 個人資料。
 *
 * ⚠️ 這只是**備援顯示用**。後端一律以 idToken 驗證端點回傳的名稱與頭像為準，
 * 前端傳的值不可信（docs/DEV_PLAN.md Phase 3 實作重點 4）。
 * 取不到時回傳空物件，不讓它擋住登入。
 */
export async function getLineProfile(): Promise<{ displayName?: string; pictureUrl?: string }> {
  try {
    const profile = await liff.getProfile();
    return { displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch {
    return {};
  }
}
