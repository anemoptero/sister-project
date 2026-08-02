import { describe, expect, it } from 'vitest';
import type { WeeklyBusinessHour } from '../types/models';
import { businessDayRange } from './businessDays';

/** 0 = 週日。傳入的陣列指定哪幾天營業 */
function weekly(openDays: number[]): WeeklyBusinessHour[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday: weekday as WeeklyBusinessHour['weekday'],
    enabled: openDays.includes(weekday),
    openTime: '10:00',
    closeTime: '20:00'
  }));
}

const ALL_DAYS = weekly([0, 1, 2, 3, 4, 5, 6]);

/** 2026-08-05 是週三 */
const WEDNESDAY = new Date(2026, 7, 5, 12, 0, 0);

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('businessDayRange', () => {
  it('全年無休時就是單純的前後三天', () => {
    const { from, to } = businessDayRange(ALL_DAYS, 3, WEDNESDAY);

    expect(ymd(from)).toBe('2026-08-02');
    expect(ymd(to)).toBe('2026-08-08');
  });

  it('遇到店休往後延，確保仍看得到三個營業日', () => {
    // 週一店休：從週三往前數三個營業日會跳過週一，落在週六
    const { from, to } = businessDayRange(weekly([0, 2, 3, 4, 5, 6]), 3, WEDNESDAY);

    expect(ymd(from)).toBe('2026-08-01');
    expect(ymd(to)).toBe('2026-08-08');
  });

  it('連續兩天店休時延得更遠', () => {
    // 週一、週二皆休
    const { from } = businessDayRange(weekly([0, 3, 4, 5, 6]), 3, WEDNESDAY);

    expect(ymd(from)).toBe('2026-07-31');
  });

  it('今天即使店休也包含在範圍內', () => {
    // 週三店休，但使用者今天打開後台就是想看今天
    const { from, to } = businessDayRange(weekly([0, 1, 2, 4, 5, 6]), 3, WEDNESDAY);

    expect(new Date(ymd(from)) <= WEDNESDAY).toBe(true);
    expect(new Date(ymd(to)) >= WEDNESDAY).toBe(true);
  });

  it('起訖涵蓋整天，不會漏掉當天稍早或稍晚的預約', () => {
    const { from, to } = businessDayRange(ALL_DAYS, 3, WEDNESDAY);

    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
  });

  it('設定尚未載入時視為全年無休，不會算出空區間', () => {
    const { from, to } = businessDayRange([], 3, WEDNESDAY);

    expect(ymd(from)).toBe('2026-08-02');
    expect(ymd(to)).toBe('2026-08-08');
  });

  it('全部設為店休時退化成日曆日，不會無窮迴圈', () => {
    // 這是設定異常的情況，但不可以讓畫面卡死
    const { from, to } = businessDayRange(weekly([]), 3, WEDNESDAY);

    expect(ymd(from)).toBe('2026-08-02');
    expect(ymd(to)).toBe('2026-08-08');
  });
});
