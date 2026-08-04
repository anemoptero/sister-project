import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  callApi,
  isApiError,
  onUnauthorized,
  productChangedDetails,
  slotUnavailableDetails,
  validationField
} from './client';
import { clearSessionToken, getSessionToken, setSessionToken } from './session';
import { ERROR_CODES, NETWORK_ERROR } from '../types/api';

/** 組出 Apps Script 的回應。刻意允許指定 HTTP status 來驗證它不被採信 */
function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function fetchMock() {
  return vi.spyOn(globalThis, 'fetch' as never) as unknown as ReturnType<typeof vi.fn>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearSessionToken();
  fetchSpy = fetchMock();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSessionToken();
});

/**
 * 取出最後一次請求。
 *
 * 不用 `Array.prototype.at()` —— 那是 ES2022，而 tsconfig 的 lib 停在
 * ES2020 以保留較舊 LINE 內建瀏覽器的支援。
 */
function lastCall(): RequestInit {
  const calls = fetchSpy.mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

function lastRequestBody(): Record<string, unknown> {
  return JSON.parse(lastCall().body as string);
}

describe('callApi 成功路徑', () => {
  it('回傳 data 本身，而不是整個信封', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ ok: true, data: { message: 'pong', serverTime: '2026-07-30T10:00:00+08:00' } })
    );

    const data = await callApi('ping', {});

    expect(data.message).toBe('pong');
  });

  it('送出 action、requestId 與 payload', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { products: [] } }));

    await callApi('listProducts', { includeDisabled: true });

    const body = lastRequestBody();
    expect(body.action).toBe('listProducts');
    expect(body.requestId).toBeTruthy();
    expect(body.payload).toEqual({ includeDisabled: true });
  });

  it('使用 text/plain 避免觸發 CORS preflight', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { products: [] } }));

    await callApi('listProducts', {});

    const init = lastCall();
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/text\/plain/);
  });
});

describe('sessionToken 附加規則', () => {
  it('已登入時保護 API 會帶上 token', async () => {
    setSessionToken('sess_abc.secret');
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { orders: [] } }));

    await callApi('listOrders', {});

    expect(lastRequestBody().sessionToken).toBe('sess_abc.secret');
  });

  it('未登入時不帶 sessionToken 欄位', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { products: [] } }));

    await callApi('listProducts', {});

    expect(lastRequestBody().sessionToken).toBeUndefined();
  });

  it('ping 與 loginWithLine 不帶 token —— 手上的過期 token 不該影響登入', async () => {
    setSessionToken('sess_expired.secret');
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { message: 'pong' } }));

    await callApi('ping', {});
    expect(lastRequestBody().sessionToken).toBeUndefined();

    fetchSpy.mockResolvedValue(
      mockResponse({
        ok: true,
        data: { sessionToken: 'new', expiresAt: '', user: {}, profileComplete: false, isNewAccount: true }
      })
    );
    await callApi('loginWithLine', { lineIdToken: 'token' });
    expect(lastRequestBody().sessionToken).toBeUndefined();
  });

  it('listProducts 帶著過期 token 時不會靜默降級為訪客', async () => {
    // 後端的 OPTIONAL 層級刻意設計成「有帶就必須有效」。
    // client 必須照樣把 token 送出去，才會收到 UNAUTHORIZED。
    setSessionToken('sess_expired.secret');
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { products: [] } }));

    await callApi('listProducts', {});

    expect(lastRequestBody().sessionToken).toBe('sess_expired.secret');
  });
});

describe('錯誤處理', () => {
  it('body.ok 為 false 時拋出 ApiError', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ ok: false, errorCode: 'COUPON_EXPIRED', message: '此優惠券已過期' })
    );

    await expect(callApi('listMyCoupons', {})).rejects.toThrow(ApiError);

    try {
      await callApi('listMyCoupons', {});
      expect.unreachable('應該要拋錯');
    } catch (err) {
      expect(isApiError(err)).toBe(true);
      const apiErr = err as ApiError;
      expect(apiErr.errorCode).toBe(ERROR_CODES.COUPON_EXPIRED);
      expect(apiErr.message).toBe('此優惠券已過期');
    }
  });

  it('HTTP status 一律不採信，成敗只看 body.ok', async () => {
    // Apps Script 無法自訂 status code。若 client 誤用 response.ok 判斷，
    // 這個案例會把成功回應當成失敗。
    fetchSpy.mockResolvedValue(mockResponse({ ok: true, data: { products: [] } }, 500));

    const data = await callApi('listProducts', {});

    expect(data.products).toEqual([]);
  });

  it('回應不是 JSON 時視為 NETWORK_ERROR', async () => {
    // 部署網址失效時 Google 會回 HTML 錯誤頁
    fetchSpy.mockResolvedValue(mockResponse('<!DOCTYPE html><html>Error</html>'));

    await expect(callApi('ping', {})).rejects.toMatchObject({ errorCode: NETWORK_ERROR });
  });

  it('信封缺少 ok 欄位時視為 NETWORK_ERROR', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ data: { products: [] } }));

    await expect(callApi('listProducts', {})).rejects.toMatchObject({ errorCode: NETWORK_ERROR });
  });

  it('fetch 本身失敗時視為 NETWORK_ERROR', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(callApi('ping', {})).rejects.toMatchObject({ errorCode: NETWORK_ERROR });
  });
});

describe('UNAUTHORIZED 的副作用', () => {
  it('清除本地 token 並通知 listener', async () => {
    setSessionToken('sess_abc.secret');
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    fetchSpy.mockResolvedValue(
      mockResponse({ ok: false, errorCode: 'UNAUTHORIZED', message: '登入已過期，請重新登入' })
    );

    await expect(callApi('getCurrentUser', {})).rejects.toMatchObject({
      errorCode: ERROR_CODES.UNAUTHORIZED
    });

    expect(getSessionToken()).toBe('');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('其他錯誤碼不會清掉 token', async () => {
    setSessionToken('sess_abc.secret');
    fetchSpy.mockResolvedValue(
      mockResponse({ ok: false, errorCode: 'FORBIDDEN', message: '此操作僅限管理員' })
    );

    await expect(callApi('adminGetSalesStats', { from: '', to: '' })).rejects.toMatchObject({
      errorCode: ERROR_CODES.FORBIDDEN
    });

    expect(getSessionToken()).toBe('sess_abc.secret');
  });

  it('listener 拋錯不影響原本要拋出的 ApiError', async () => {
    const unsubscribe = onUnauthorized(() => {
      throw new Error('listener 壞了');
    });

    fetchSpy.mockResolvedValue(
      mockResponse({ ok: false, errorCode: 'UNAUTHORIZED', message: '登入憑證無效' })
    );

    await expect(callApi('getCurrentUser', {})).rejects.toMatchObject({
      errorCode: ERROR_CODES.UNAUTHORIZED
    });

    unsubscribe();
  });
});

describe('details 取用', () => {
  it('PRODUCT_CHANGED 帶回當前產品供前端比對差異', async () => {
    const product = { productId: 'prd_001', name: '臉部保養', price: 2200, version: 5 };
    fetchSpy.mockResolvedValue(
      mockResponse({
        ok: false,
        errorCode: 'PRODUCT_CHANGED',
        message: '產品資訊已更新，請重新確認',
        details: { expectedVersion: 3, currentVersion: 5, product }
      })
    );

    try {
      await callApi('createOrder', { startAt: '', items: [] });
      expect.unreachable('應該要拋錯');
    } catch (err) {
      const details = productChangedDetails(err as ApiError);
      expect(details?.currentVersion).toBe(5);
      expect(details?.product.price).toBe(2200);
    }
  });

  it('SLOT_UNAVAILABLE 指出衝突的那一格', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        ok: false,
        errorCode: 'SLOT_UNAVAILABLE',
        message: '16:00 這個時段已額滿，請改選其他時間',
        details: { reason: 'SLOT_TAKEN', conflictSlotStartAt: '2026-08-01T16:00:00+08:00' }
      })
    );

    try {
      await callApi('createAppointment', { startAt: '', items: [] });
      expect.unreachable('應該要拋錯');
    } catch (err) {
      expect(slotUnavailableDetails(err as ApiError)?.conflictSlotStartAt).toBe(
        '2026-08-01T16:00:00+08:00'
      );
    }
  });

  it('VALIDATION_ERROR 指出是哪個欄位', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: '電話格式不正確',
        details: { field: 'phone' }
      })
    );

    try {
      await callApi('updateMyProfile', { phone: 'abc' });
      expect.unreachable('應該要拋錯');
    } catch (err) {
      expect(validationField(err as ApiError)).toBe('phone');
    }
  });

  it('錯誤碼不符時取用函式回傳 null，不會誤讀別的 details', () => {
    const err = new ApiError(ERROR_CODES.NOT_FOUND, '找不到資料', { field: 'x' });

    expect(productChangedDetails(err)).toBeNull();
    expect(slotUnavailableDetails(err)).toBeNull();
    expect(validationField(err)).toBe('');
  });
});
