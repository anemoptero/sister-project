import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { callApi } from '../api/client';
import type { ApiDataOf } from '../types/api';
import { applyAppearance } from '../theme/appearance';

export type SiteSettings = ApiDataOf<'getSiteSettings'>['site'];

export const DEFAULT_SITE: SiteSettings = {
  siteName: '預約系統',
  logoUrl: '',
  tagline: '',
  description: '',
  contactPhone: '',
  contactAddress: '',
  lineUrl: '',
  businessNote: '',
  theme: 'sand',
  backgroundType: 'none',
  backgroundImageUrl: '',
  backgroundGradient: '',
  backgroundOverlay: 82,
  configured: false
};

export interface SiteContextValue {
  site: SiteSettings;
  loading: boolean;
  /** 後台儲存後立即套用，不必重新整理 */
  setSite: (next: SiteSettings) => void;
  reload: () => Promise<void>;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

const CACHE_KEY = 'sister.site';

/**
 * 網站設定的來源。
 *
 * **在 App 層讀一次就好。** 店名與配色每一頁都要用，若各元件自己呼叫，
 * 一次瀏覽會產生好幾次往返，而 Apps Script 一次往返就要一到三秒。
 *
 * 以 localStorage 快取上次的結果作為初始值：外觀屬於「上次看到什麼、
 * 這次就該看到什麼」的資料，等 API 回來才套用會讓畫面先閃一次預設配色。
 * 快取過期沒有風險 —— 背景重新取回後就會更新。
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSiteState] = useState<SiteSettings>(readCache);
  const [loading, setLoading] = useState(true);

  // 設定一變動就套用配色與背景。走 CSS 變數，不需要重繪任何元件
  useEffect(() => {
    applyAppearance({
      theme: site.theme,
      background: {
        type: site.backgroundType,
        imageUrl: site.backgroundImageUrl,
        gradient: site.backgroundGradient,
        overlay: site.backgroundOverlay
      }
    });
  }, [site]);

  // 店名要進瀏覽器分頁標題，否則所有頁面都叫同一個名字
  useEffect(() => {
    if (site.siteName) document.title = site.siteName;
  }, [site.siteName]);

  const reload = useCallback(async () => {
    try {
      const data = await callApi('getSiteSettings', {});
      setSiteState(data.site);
      writeCache(data.site);
    } catch {
      // 取不到就沿用快取或預設值 —— 網站設定失敗不該讓整站打不開
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setSite = useCallback((next: SiteSettings) => {
    setSiteState(next);
    writeCache(next);
  }, []);

  const value = useMemo<SiteContextValue>(
    () => ({ site, loading, setSite, reload }),
    [site, loading, setSite, reload]
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

function readCache(): SiteSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_SITE, ...(JSON.parse(raw) as Partial<SiteSettings>) } : DEFAULT_SITE;
  } catch {
    return DEFAULT_SITE;
  }
}

function writeCache(site: SiteSettings): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(site));
  } catch {
    // 寫不進去只是少一層快取
  }
}
