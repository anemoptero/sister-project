import { describe, expect, it } from 'vitest';
import { formatDuration, formatPrice } from './format';

describe('formatPrice', () => {
  it('加上千分位與幣別', () => {
    expect(formatPrice(1800)).toBe('NT$ 1,800');
    expect(formatPrice(0)).toBe('NT$ 0');
  });

  it('資料缺漏時顯示「—」而不是拋錯', () => {
    /**
     * 實際發生過：後端欄位叫 revenue，前端型別誤寫成 totalSales，
     * formatPrice(undefined) 讓整個統計頁白畫面。
     */
    expect(formatPrice(undefined as unknown as number)).toBe('—');
    expect(formatPrice(Number.NaN)).toBe('—');
    expect(formatPrice(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('缺漏不可顯示成 0 —— 那是把沒資料謊報成金額為零', () => {
    expect(formatPrice(undefined as unknown as number)).not.toBe('NT$ 0');
  });
});

describe('formatDuration', () => {
  it('未滿一小時顯示分鐘', () => {
    expect(formatDuration(45)).toBe('45 分鐘');
  });

  it('整點小時不顯示零分', () => {
    expect(formatDuration(120)).toBe('2 小時');
  });

  it('有零頭時同時顯示', () => {
    expect(formatDuration(90)).toBe('1 小時 30 分');
  });
});
