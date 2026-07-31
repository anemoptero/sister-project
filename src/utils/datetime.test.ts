import { describe, expect, it } from 'vitest';
import { isoToLocalInput, localInputToIso } from './datetime';

/**
 * 測試環境的時區由執行環境決定，因此不寫死 `+08:00`，
 * 改為驗證「格式正確」與「來回轉換後時間點不變」——
 * 後者才是真正要保證的性質。
 */
describe('localInputToIso', () => {
  it('補上秒數與時區偏移', () => {
    const result = localInputToIso('2026-08-01T00:00');

    expect(result).toMatch(/^2026-08-01T00:00:00[+-]\d{2}:\d{2}$/);
  });

  it('空輸入回傳空字串，不會變成 1970 年', () => {
    expect(localInputToIso('')).toBe('');
  });

  it('無法解析的輸入回傳空字串', () => {
    expect(localInputToIso('not-a-date')).toBe('');
  });

  it('轉出來的字串代表的時間點與輸入相同', () => {
    // 這是核心性質：若時區處理錯誤，這裡會差 8 小時
    const local = '2026-08-01T15:30';
    const iso = localInputToIso(local);

    expect(new Date(iso).getTime()).toBe(new Date(local).getTime());
  });
});

describe('isoToLocalInput', () => {
  it('轉成 datetime-local 需要的格式', () => {
    expect(isoToLocalInput('2026-08-01T15:30:00+08:00')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
    );
  });

  it('空字串與無效值回傳空字串', () => {
    expect(isoToLocalInput('')).toBe('');
    expect(isoToLocalInput('garbage')).toBe('');
  });

  it('來回轉換後時間點不變', () => {
    const local = '2026-12-31T23:59';

    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
  });

  it('處理 Z 結尾的 UTC 字串而不是截字串', () => {
    // 直接截前 16 字元會得到 UTC 時間，顯示給管理員看的卻該是本地時間
    const utc = '2026-08-01T00:00:00Z';
    const result = isoToLocalInput(utc);

    expect(new Date(result).getTime()).toBe(new Date(utc).getTime());
  });
});
