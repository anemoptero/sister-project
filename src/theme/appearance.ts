/**
 * 外觀設定：主題與頁面背景。
 *
 * 設計成一個**純資料物件 + 一個套用函式**，而不是散落在各元件的樣式判斷。
 * 這樣設定來源可以替換而不影響任何畫面程式：
 *
 *   現在   程式內建預設值（+ 本機預覽用的 localStorage）
 *   日後   後端 settings/appearance，讓管理員自己改、所有訪客都看得到
 *
 * 套用方式是覆蓋 CSS 變數，因此不需要 re-render 任何元件。
 */

export const THEME_NAMES = ['sand', 'mono', 'sage', 'night'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_LABELS: Record<ThemeName, string> = {
  sand: '暖砂',
  mono: '淨白',
  sage: '霧綠',
  night: '夜色'
};

export const THEME_DESCRIPTIONS: Record<ThemeName, string> = {
  sand: '米白基底配深棕與陶土色，溫暖沉穩',
  mono: '極簡黑白，俐落中性',
  sage: '柔和草木色，自然放鬆',
  night: '深色介面，夜間或低光環境較舒適'
};

export type BackgroundType = 'none' | 'image' | 'gradient';

export interface AppearanceConfig {
  theme: ThemeName;
  background: {
    type: BackgroundType;
    /** type = image 時使用。必須是 https，否則會被瀏覽器擋掉 */
    imageUrl: string;
    /** type = gradient 時使用，完整的 CSS gradient 值 */
    gradient: string;
    /**
     * 背景之上的遮罩濃度，0～100。
     *
     * 這個值直接決定內文讀不讀得清楚 —— 背景圖越花，需要的遮罩越濃。
     * 預設 82 是實測下大多數照片都還能維持正文對比的濃度。
     */
    overlay: number;
  };
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  theme: 'sand',
  background: { type: 'none', imageUrl: '', gradient: '', overlay: 82 }
};

/** 幾組預設漸層，讓不想找圖的人也能快速換個樣子 */
export const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { label: '晨霧', value: 'linear-gradient(160deg, #f5efe6 0%, #e8dfd2 100%)' },
  { label: '暮色', value: 'linear-gradient(160deg, #efe3d8 0%, #d9c3b0 100%)' },
  { label: '淺草', value: 'linear-gradient(160deg, #eef2ea 0%, #d9e3d5 100%)' },
  { label: '靜夜', value: 'linear-gradient(160deg, #23252b 0%, #14151a 100%)' }
];

/**
 * 把設定套到文件上。
 *
 * 直接操作 `document.documentElement` 而非透過 React state，是因為主題是
 * **全域樣式**，不屬於任何一個元件的狀態。走 CSS 變數也讓切換不需要重繪元件。
 */
export function applyAppearance(config: AppearanceConfig): void {
  const root = document.documentElement;
  const { theme, background } = config;

  root.dataset.theme = THEME_NAMES.includes(theme) ? theme : DEFAULT_APPEARANCE.theme;

  const image = resolveBackgroundImage(background);
  if (image) {
    root.dataset.hasBg = 'true';
    root.style.setProperty('--page-bg-image', image);
    root.style.setProperty('--page-bg-opacity', `${clampPercent(background.overlay)}%`);
  } else {
    // 用 delete 而非設成 'false'：base.css 是以屬性存在與否來判斷，
    // 留著 data-has-bg="false" 會讓選擇器意外命中
    delete root.dataset.hasBg;
    root.style.removeProperty('--page-bg-image');
    root.style.removeProperty('--page-bg-opacity');
  }
}

function resolveBackgroundImage(background: AppearanceConfig['background']): string {
  if (background.type === 'gradient' && background.gradient) {
    return background.gradient;
  }

  if (background.type === 'image' && background.imageUrl) {
    // 只接受 https：前端部署在 https 上，http 圖片會被當成混合內容擋掉，
    // 畫面只會是空白背景而沒有任何錯誤提示
    if (!background.imageUrl.startsWith('https://')) return '';
    // 網址可能含括號或引號，用 CSS 字串包起來並轉義，避免破壞 url()
    return `url("${background.imageUrl.replace(/["\\]/g, '\\$&')}")`;
  }

  return '';
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_APPEARANCE.background.overlay;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 合併外部設定與預設值。
 *
 * 缺欄位時退回預設，而不是讓 undefined 流進 `applyAppearance` ——
 * 後端日後回傳的資料可能缺欄位（舊文件、部分更新），畫面不該因此變成全白。
 */
export function normalizeAppearance(input: Partial<AppearanceConfig> | null): AppearanceConfig {
  if (!input) return DEFAULT_APPEARANCE;

  const theme =
    input.theme && THEME_NAMES.includes(input.theme) ? input.theme : DEFAULT_APPEARANCE.theme;
  const bg = input.background;

  return {
    theme,
    background: {
      type: bg?.type ?? DEFAULT_APPEARANCE.background.type,
      imageUrl: bg?.imageUrl ?? '',
      gradient: bg?.gradient ?? '',
      overlay:
        typeof bg?.overlay === 'number' ? bg.overlay : DEFAULT_APPEARANCE.background.overlay
    }
  };
}
