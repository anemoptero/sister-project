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
  | 'NO_ID_TOKEN';

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
  return token;
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
