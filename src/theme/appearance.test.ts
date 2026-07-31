import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  normalizeAppearance,
  type AppearanceConfig
} from './appearance';

function config(patch: Partial<AppearanceConfig['background']>, theme = 'sand' as const) {
  return { theme, background: { ...DEFAULT_APPEARANCE.background, ...patch } };
}

afterEach(() => {
  const root = document.documentElement;
  delete root.dataset.theme;
  delete root.dataset.hasBg;
  root.style.removeProperty('--page-bg-image');
  root.style.removeProperty('--page-bg-opacity');
});

describe('applyAppearance', () => {
  it('套用主題到 data-theme', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, theme: 'sage' });
    expect(document.documentElement.dataset.theme).toBe('sage');
  });

  it('未知主題退回預設，不讓畫面失去所有顏色', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, theme: 'nope' as never });
    expect(document.documentElement.dataset.theme).toBe('sand');
  });

  it('type 為 none 時不設背景圖', () => {
    applyAppearance(config({ type: 'none' }));
    expect(document.documentElement.dataset.hasBg).toBeUndefined();
  });

  it('https 圖片會被包成 url()', () => {
    applyAppearance(config({ type: 'image', imageUrl: 'https://cdn.example/bg.jpg' }));

    expect(document.documentElement.dataset.hasBg).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--page-bg-image')).toBe(
      'url("https://cdn.example/bg.jpg")'
    );
  });

  it('拒絕 http 圖片 —— 在 https 網站上會被當成混合內容擋掉', () => {
    applyAppearance(config({ type: 'image', imageUrl: 'http://cdn.example/bg.jpg' }));
    expect(document.documentElement.dataset.hasBg).toBeUndefined();
  });

  it('網址中的引號會被轉義，不會破壞 url()', () => {
    applyAppearance(config({ type: 'image', imageUrl: 'https://x.test/a"b.jpg' }));

    expect(document.documentElement.style.getPropertyValue('--page-bg-image')).toBe(
      'url("https://x.test/a\\"b.jpg")'
    );
  });

  it('遮罩濃度會被限制在 0～100', () => {
    applyAppearance(config({ type: 'gradient', gradient: 'linear-gradient(#fff,#000)', overlay: 300 }));
    expect(document.documentElement.style.getPropertyValue('--page-bg-opacity')).toBe('100%');

    applyAppearance(config({ type: 'gradient', gradient: 'linear-gradient(#fff,#000)', overlay: -20 }));
    expect(document.documentElement.style.getPropertyValue('--page-bg-opacity')).toBe('0%');
  });

  it('切回 none 時清掉先前設定的背景', () => {
    applyAppearance(config({ type: 'image', imageUrl: 'https://cdn.example/bg.jpg' }));
    applyAppearance(config({ type: 'none' }));

    expect(document.documentElement.dataset.hasBg).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--page-bg-image')).toBe('');
  });
});

describe('normalizeAppearance', () => {
  it('null 回傳預設值', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('缺欄位時補上預設 —— 後端日後回傳舊格式也不該讓畫面變全白', () => {
    const result = normalizeAppearance({ theme: 'night' });

    expect(result.theme).toBe('night');
    expect(result.background.type).toBe('none');
    expect(result.background.overlay).toBe(DEFAULT_APPEARANCE.background.overlay);
  });

  it('未知主題退回預設', () => {
    expect(normalizeAppearance({ theme: 'rainbow' as never }).theme).toBe('sand');
  });
});
