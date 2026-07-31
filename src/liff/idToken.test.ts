import { describe, expect, it } from 'vitest';
import { isIdTokenExpired } from './liff';

// JWT 的 exp 單位是秒，不是毫秒 —— 用毫秒判斷會永遠得到「未過期」
const NOW = 1_800_000_000;

describe('isIdTokenExpired', () => {
  it('尚未到期時回傳 false', () => {
    expect(isIdTokenExpired(NOW + 3600, NOW)).toBe(false);
  });

  it('已過期時回傳 true', () => {
    expect(isIdTokenExpired(NOW - 1, NOW)).toBe(true);
  });

  it('留 60 秒緩衝 —— 送達後端的路上剛好過期會很難懂', () => {
    // 還有 30 秒才到期，但已在緩衝區內，視為過期
    expect(isIdTokenExpired(NOW + 30, NOW)).toBe(true);
    // 還有 90 秒，超出緩衝，仍算有效
    expect(isIdTokenExpired(NOW + 90, NOW)).toBe(false);
  });

  it('缺少 exp 時視為過期（fail closed）', () => {
    // 當成有效的話會送出一個必定被拒絕的 token，錯誤更難查
    expect(isIdTokenExpired(undefined, NOW)).toBe(true);
    expect(isIdTokenExpired(Number.NaN, NOW)).toBe(true);
  });

  it('exp 不是數字時視為過期', () => {
    expect(isIdTokenExpired('123' as unknown as number, NOW)).toBe(true);
  });
});
