import { describe, expect, it } from 'vitest';
import { parseIntStrict } from './number';

describe('parseIntStrict', () => {
  it('接受純整數字串', () => {
    expect(parseIntStrict('1800')).toBe(1800);
    expect(parseIntStrict('0')).toBe(0);
    expect(parseIntStrict(' 90 ')).toBe(90);
    expect(parseIntStrict('-5')).toBe(-5);
  });

  it('拒絕小數 —— parseInt 會悄悄截斷成 1800，金額因此失真', () => {
    expect(parseIntStrict('1800.5')).toBeNull();
    expect(parseIntStrict('.5')).toBeNull();
    expect(parseIntStrict('1800.0')).toBeNull();
  });

  it('拒絕夾雜文字的輸入', () => {
    expect(parseIntStrict('18abc')).toBeNull();
    expect(parseIntStrict('abc')).toBeNull();
    expect(parseIntStrict('1 800')).toBeNull();
  });

  it('拒絕空字串 —— 清空的數字欄位不可被當成 0', () => {
    expect(parseIntStrict('')).toBeNull();
    expect(parseIntStrict('   ')).toBeNull();
  });

  it('拒絕會失真的超大整數', () => {
    expect(parseIntStrict('9007199254740993')).toBeNull();
  });

  it('拒絕科學記號與正號 —— 表單不該產生這種輸入', () => {
    expect(parseIntStrict('1e3')).toBeNull();
    expect(parseIntStrict('+5')).toBeNull();
  });
});
