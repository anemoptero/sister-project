import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
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
  /** 畫面實際要套用的設定。有未儲存的預覽時是預覽值，否則等於 savedSite */
  site: SiteSettings;
  /**
   * 後端**已儲存**的設定。
   *
   * 後台判斷「有沒有未儲存的變更」與「放棄變更要還原成什麼」都必須以它為
   * 基準。曾經只有 site 一個值，編輯時被就地覆蓋，於是 dirty 永遠是 false、
   * 提示與放棄變更的按鈕從來不會出現。
   */
  savedSite: SiteSettings;
  loading: boolean;
  /** 後台儲存成功後呼叫：更新已儲存值、寫入快取、並清掉預覽 */
  setSite: (next: SiteSettings) => void;
  /**
   * 即時預覽尚未儲存的變更。傳 null 取消預覽。
   *
   * ⚠️ **不寫入 localStorage**。寫了的話未儲存的店名與配色會跟著使用者
   * 跑到其他頁面，下次開啟也會先閃一次未存的設定才被後端值修正。
   */
  previewSite: (next: SiteSettings | null) => void;
  /** 重新向後端取回，並回傳取到的值 —— 呼叫端不必再從閉包拿舊的 site */
  reload: () => Promise<SiteSettings>;
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
  const [savedSite, setSavedSite] = useState<SiteSettings>(readCache);
  // 後台編輯中的預覽值。只存在記憶體裡，不落地
  const [preview, setPreview] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const site = preview ?? savedSite;

  // reload 失敗時要回傳當下的已儲存值，但它不能進 useCallback 的相依陣列
  // —— 一進去 reload 的識別就會隨設定變動，掛載時的 effect 會反覆重跑
  const savedRef = useRef(savedSite);

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

  useEffect(() => {
    savedRef.current = savedSite;
  }, [savedSite]);

  const reload = useCallback(async (): Promise<SiteSettings> => {
    try {
      const data = await callApi('getSiteSettings', {});
      setSavedSite(data.site);
      savedRef.current = data.site;
      writeCache(data.site);
      return data.site;
    } catch {
      // 取不到就沿用快取或預設值 —— 網站設定失敗不該讓整站打不開
      return savedRef.current;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setSite = useCallback((next: SiteSettings) => {
    setSavedSite(next);
    savedRef.current = next;
    writeCache(next);
    // 已經存進後端，預覽的任務結束
    setPreview(null);
  }, []);

  const previewSite = useCallback((next: SiteSettings | null) => {
    setPreview(next);
  }, []);

  const value = useMemo<SiteContextValue>(
    () => ({ site, savedSite, loading, setSite, previewSite, reload }),
    [site, savedSite, loading, setSite, previewSite, reload]
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
