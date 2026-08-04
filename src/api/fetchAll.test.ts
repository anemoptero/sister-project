import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, fetchAll, pageCount, pageSlice } from './fetchAll';

/**
 * 這支 helper 撐著後台六個清單的正確性。
 *
 * 它的價值不只是「少寫幾行」—— 統計是在前端加總的，只要有一頁沒抓到，
 * 待收款、待結案金額這些數字就會靜默偏低，而畫面上完全看不出異常。
 */
describe('fetchAll', () => {
  it('跟著 nextCursor 一路抓到底並串接結果', async () => {
    const pages = [
      { items: [1, 2], nextCursor: '2' },
      { items: [3, 4], nextCursor: '4' },
      { items: [5], nextCursor: null }
    ];
    const fetchPage = vi.fn((cursor: string | null) => {
      const index = cursor === null ? 0 : Number(cursor) / 2;
      return Promise.resolve(pages[index]);
    });

    await expect(fetchAll(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    // 第一次必須傳 null，不可自己從 0 開始算 offset
    expect(fetchPage.mock.calls[0][0]).toBeNull();
    expect(fetchPage.mock.calls[1][0]).toBe('2');
  });

  it('只有一頁時只呼叫一次', async () => {
    const fetchPage = vi.fn(() => Promise.resolve({ items: ['a'], nextCursor: null }));

    await expect(fetchAll(fetchPage)).resolves.toEqual(['a']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('後端永遠給游標時仍會停下來', async () => {
    // 沒有這道保險的話，畫面會卡在載入中並無聲地打爆 API 配額
    const fetchPage = vi.fn(() => Promise.resolve({ items: ['x'], nextCursor: '1' }));

    const result = await fetchAll(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(10);
    expect(result).toHaveLength(10);
  });
});

describe('前端分頁的切片', () => {
  const items = Array.from({ length: 120 }, (_, i) => i + 1);

  it('第一頁是 50 筆，共 3 頁', () => {
    expect(pageSlice(items, 1)).toHaveLength(PAGE_SIZE);
    expect(pageSlice(items, 1)[0]).toBe(1);
    expect(pageCount(items.length)).toBe(3);
  });

  it('最後一頁只有剩下的 20 筆', () => {
    const last = pageSlice(items, 3);
    expect(last).toHaveLength(20);
    expect(last[0]).toBe(101);
  });

  it('統計不受切頁影響 —— 加總的是完整資料，不是當頁', () => {
    const pageSum = pageSlice(items, 1).reduce((a, b) => a + b, 0);
    const total = items.reduce((a, b) => a + b, 0);

    expect(total).toBe(7260);
    expect(pageSum).not.toBe(total);
  });

  it('空清單仍是 1 頁，不會顯示「共 0 頁」', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageSlice([], 1)).toEqual([]);
  });
});
