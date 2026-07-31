import { describe, expect, it } from 'vitest';
import { MOCK_UID_PREFIX, isMockUid, makeMockCustomers } from './mockCustomers';

describe('makeMockCustomers', () => {
  it('產生指定筆數', () => {
    expect(makeMockCustomers(30)).toHaveLength(30);
  });

  it('每一筆的 uid 都帶有 mock 前綴，確保送出前一定被濾掉', () => {
    // 這是防止假資料寫進 Firestore 的唯一防線
    const all = makeMockCustomers(50);

    expect(all.every((c) => c.uid.startsWith(MOCK_UID_PREFIX))).toBe(true);
    expect(all.every((c) => isMockUid(c.uid))).toBe(true);
  });

  it('uid 不重複', () => {
    const all = makeMockCustomers(100);

    expect(new Set(all.map((c) => c.uid)).size).toBe(100);
  });

  it('內容穩定 —— 重繪時清單不可以換一批人', () => {
    expect(makeMockCustomers(10)).toEqual(makeMockCustomers(10));
  });

  it('每一筆都有名稱與電話，才看得出實際版面', () => {
    const all = makeMockCustomers(20);

    expect(all.every((c) => c.displayName.length > 0)).toBe(true);
    expect(all.every((c) => /^09\d{8}$/.test(c.phone))).toBe(true);
  });

  it('數量異常時不會產生無限資料', () => {
    expect(makeMockCustomers(-5)).toHaveLength(0);
    expect(makeMockCustomers(Number.NaN)).toHaveLength(0);
    expect(makeMockCustomers(99_999).length).toBeLessThanOrEqual(500);
  });
});

describe('isMockUid', () => {
  it('真實 uid 不會被誤判', () => {
    expect(isMockUid('usr_01HZABCDEF')).toBe(false);
  });
});
