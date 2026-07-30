import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionToken, getSessionToken, hasSessionToken, setSessionToken } from './session';

afterEach(() => {
  vi.restoreAllMocks();
  clearSessionToken();
});

describe('session 儲存', () => {
  it('存入後可讀回', () => {
    setSessionToken('sess_abc.secret');
    expect(getSessionToken()).toBe('sess_abc.secret');
    expect(hasSessionToken()).toBe(true);
  });

  it('清除後為空字串而非 null', () => {
    setSessionToken('sess_abc.secret');
    clearSessionToken();

    // 回傳型別固定是 string，呼叫端不需要處理 null
    expect(getSessionToken()).toBe('');
    expect(hasSessionToken()).toBe(false);
  });

  it('localStorage 不可用時退回記憶體，不讓整個 App 掛掉', () => {
    // Safari 無痕模式、瀏覽器停用儲存權限時 localStorage 會直接拋例外
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => setSessionToken('sess_fallback.secret')).not.toThrow();
    expect(getSessionToken()).toBe('sess_fallback.secret');
  });
});
