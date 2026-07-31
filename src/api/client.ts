/**
 * Apps Script API client。
 *
 * 全站唯一的 fetch 出口 —— `docs/AGENT_GUIDE.md` §9.3 明訂不可在各頁面散落
 * fetch 寫法。所有請求都經過這裡，才有統一的 requestId、session 附加、
 * 錯誤碼轉換與逾時控制。
 *
 * 對應文件：docs/API_SPEC.md §2 呼叫格式、§4 Response Schema、§5 Error Code
 */

import {
  ERROR_CODES,
  NETWORK_ERROR,
  type ApiAction,
  type ApiDataOf,
  type ApiPayloadOf,
  type ApiResponse,
  type ProductChangedDetails,
  type SlotUnavailableDetails,
  type ValidationErrorDetails
} from '../types/api';
import { clearSession, getSessionToken } from './session';

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL ?? '';

/**
 * 逾時設定。
 *
 * ⚠️ 這個值不能設得太緊。Apps Script Web App 的呼叫開銷本身就很大 ——
 * 實測連 `ping`（不碰 Firestore、只回一個字串）都要 3.4～14.2 秒，
 * 因為每次請求都要經過 script.google.com → googleusercontent.com 的
 * 302 轉址，還可能遇上執行個體冷啟動。
 *
 * 原本設 20 秒，但實測已出現 14.2 秒，尖峰時會誤判成逾時並讓使用者
 * 重送一次 —— 而重送只會讓情況更糟。
 */
const DEFAULT_TIMEOUT_MS = 45000;

/**
 * 不附帶 sessionToken 的 action。
 *
 * `loginWithLine` 是取得 token 的入口，`ping` 用於連線診斷 ——
 * 兩者都不該因為手上有一個過期 token 而受影響。
 *
 * 其餘 action 一律附帶，**包含 `listProducts` 這種 OPTIONAL 層級的**：
 * 後端刻意設計成「有帶就必須有效」，過期時回 `UNAUTHORIZED` 而非
 * 靜默降級為訪客，前端才知道該重新登入。
 */
const NO_SESSION_ACTIONS = new Set<string>(['ping', 'loginWithLine']);

// ---------------------------------------------------------------------------
// 錯誤
// ---------------------------------------------------------------------------

/**
 * API 回傳的業務錯誤。
 *
 * 網路層失敗與伺服器回傳的錯誤都會包成這個型別，呼叫端只要 catch 一種。
 * 兩者以 `errorCode` 區分：`NETWORK_ERROR` 表示請求根本沒送達或回應無法解析。
 */
export class ApiError extends Error {
  readonly errorCode: string;
  readonly details: unknown;
  readonly requestId: string;

  constructor(errorCode: string, message: string, details?: unknown, requestId = '') {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.details = details;
    this.requestId = requestId;
  }

  is(code: string): boolean {
    return this.errorCode === code;
  }

  /** 網路不通、逾時、回應不是 JSON —— 這類錯誤重試通常會成功 */
  get isNetworkError(): boolean {
    return this.errorCode === NETWORK_ERROR;
  }

  /** session 失效，需要重新登入 */
  get isUnauthorized(): boolean {
    return this.errorCode === ERROR_CODES.UNAUTHORIZED;
  }
}

/** 型別窄化用。`catch (err)` 的 err 是 unknown，用這個判斷 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

// ---------------------------------------------------------------------------
// 特定錯誤的 details 取用
// ---------------------------------------------------------------------------

/**
 * 取出 `PRODUCT_CHANGED` 的當前產品資料。
 *
 * 後端不提供變動欄位清單，前端必須拿這裡的 `product` 與畫面上的舊值比對，
 * 列出「價格 1800 → 2200」再請顧客確認。見 `docs/API_SPEC.md` §5.1。
 */
export function productChangedDetails(err: ApiError): ProductChangedDetails | null {
  if (!err.is(ERROR_CODES.PRODUCT_CHANGED)) return null;
  return (err.details as ProductChangedDetails) ?? null;
}

/**
 * 取出 `SLOT_UNAVAILABLE` 的衝突時段。
 * `err.message` 本身已含時間（「16:00 這個時段已額滿」），可直接顯示；
 * 這裡的 `conflictSlotStartAt` 用於標記日曆上的哪一格。
 */
export function slotUnavailableDetails(err: ApiError): SlotUnavailableDetails | null {
  if (!err.is(ERROR_CODES.SLOT_UNAVAILABLE)) return null;
  return (err.details as SlotUnavailableDetails) ?? null;
}

/** 取出 `VALIDATION_ERROR` 指向的欄位名，用於把錯誤訊息掛到對應輸入框 */
export function validationField(err: ApiError): string {
  if (!err.is(ERROR_CODES.VALIDATION_ERROR)) return '';
  return (err.details as ValidationErrorDetails)?.field ?? '';
}

// ---------------------------------------------------------------------------
// session 失效通知
// ---------------------------------------------------------------------------

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * 註冊 session 失效的處理。
 *
 * client 偵測到 `UNAUTHORIZED` 時會清掉本地 token 並通知這裡，
 * 由 AuthContext 負責把畫面導向登入頁 —— client 不該知道路由的存在。
 *
 * @return 取消註冊的函式
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // 單一 listener 失敗不影響其他 listener 與原本要拋出的錯誤
    }
  });
}

// ---------------------------------------------------------------------------
// requestId
// ---------------------------------------------------------------------------

/**
 * 產生 requestId，用於前後端對照追蹤同一筆請求。
 *
 * `crypto.randomUUID` 只在 secure context 存在。本專案正式環境是 https 沒問題，
 * 但本機以 http 開 `--host` 給手機測試時會是 undefined，所以留了退路。
 * 這個值只用於追蹤，不具安全用途，退路的隨機性足夠。
 */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// 主要呼叫
// ---------------------------------------------------------------------------

export interface CallOptions {
  timeoutMs?: number;
  /** 外部中止用（例如元件卸載）。與內建逾時互相獨立 */
  signal?: AbortSignal;
}

/**
 * 呼叫一支 API。
 *
 * 成功時直接回傳 `data`，失敗時 **throw `ApiError`** —— 不採用回傳
 * `{ok, data}` 讓呼叫端自行判斷的作法，那會讓每個呼叫點都得寫一次
 * 判斷，漏寫時錯誤會被當成成功資料往下傳。
 *
 * @example
 * const { products } = await callApi('listProducts', {});
 */
export async function callApi<A extends ApiAction>(
  action: A,
  payload: ApiPayloadOf<A>,
  options: CallOptions = {}
): Promise<ApiDataOf<A>> {
  if (!API_URL) {
    throw new ApiError(
      NETWORK_ERROR,
      'API 網址未設定，請確認 .env.local 的 VITE_APPS_SCRIPT_URL'
    );
  }

  const requestId = generateRequestId();
  const sessionToken = NO_SESSION_ACTIONS.has(action) ? '' : getSessionToken();

  const body = JSON.stringify({
    action,
    requestId,
    ...(sessionToken ? { sessionToken } : {}),
    payload: payload ?? {}
  });

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', externalAbort);

  let raw: string;
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      // text/plain 是刻意的：避免觸發 CORS preflight。Apps Script Web App
      // 不處理 OPTIONS 請求，送 application/json 會直接失敗。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      // Apps Script 會 302 轉到 googleusercontent 才回傳實際內容
      redirect: 'follow',
      signal: controller.signal
    });

    // ⚠️ 這裡**不檢查 response.ok**。Apps Script 以 ContentService 回應時
    // 無法自訂 status code，一律 200；成敗只在 body 的 ok 欄位。
    // 真正的 HTTP 錯誤（部署網址失效等）會讓下面的 JSON.parse 失敗。
    raw = await response.text();
  } catch (err) {
    if (isAbortError(err)) {
      throw new ApiError(
        NETWORK_ERROR,
        options.signal?.aborted ? '請求已取消' : '連線逾時，請檢查網路後再試一次',
        undefined,
        requestId
      );
    }
    throw new ApiError(NETWORK_ERROR, '無法連線到伺服器，請檢查網路連線', undefined, requestId);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', externalAbort);
  }

  let parsed: ApiResponse<ApiDataOf<A>>;
  try {
    parsed = JSON.parse(raw) as ApiResponse<ApiDataOf<A>>;
  } catch {
    // 常見於部署網址失效、權限設定錯誤 —— 這時回傳的是 Google 的 HTML 錯誤頁
    throw new ApiError(
      NETWORK_ERROR,
      '伺服器回應格式異常，請確認 API 部署狀態',
      undefined,
      requestId
    );
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    throw new ApiError(NETWORK_ERROR, '伺服器回應格式異常', undefined, requestId);
  }

  if (!parsed.ok) {
    // session 失效時清掉本地 token 與使用者快取，避免後續每一支 API
    // 都再撞一次牆，也避免留下「沒有 token 卻有身分」的矛盾狀態
    if (parsed.errorCode === ERROR_CODES.UNAUTHORIZED) {
      clearSession();
      notifyUnauthorized();
    }
    throw new ApiError(
      parsed.errorCode || ERROR_CODES.INTERNAL_ERROR,
      parsed.message || '操作失敗，請稍後再試',
      parsed.details,
      parsed.requestId || requestId
    );
  }

  return parsed.data;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : false;
}

/** 診斷用：確認 API 網址是否已設定。畫面上要提示設定缺漏時用得到 */
export function isApiConfigured(): boolean {
  return Boolean(API_URL);
}
