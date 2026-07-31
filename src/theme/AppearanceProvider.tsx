import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  normalizeAppearance,
  type AppearanceConfig
} from './appearance';

const STORAGE_KEY = 'sister.appearance';

export interface AppearanceContextValue {
  appearance: AppearanceConfig;
  /** 立即套用並保存。管理員在設定頁調整時即時看到效果 */
  setAppearance: (next: AppearanceConfig) => void;
  reset: () => void;
}

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * 外觀設定的來源與套用。
 *
 * ⚠️ 目前設定存在 **localStorage**，只影響這台裝置 —— 顧客看到的仍是預設外觀。
 * 要讓所有訪客都看到，設定必須存進後端（`settings/appearance`）並新增對應的
 * API。屆時只需要把這裡的讀寫換成 API 呼叫，其餘程式不受影響。
 *
 * 之所以先做成這樣而不是直接寫死：切換與預覽的介面、CSS 變數的套用方式、
 * 設定的資料形狀都可以先定案並實際用起來，之後接後端只是換一個來源。
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceConfig>(() => readStored());

  // 首次掛載與每次變更都重新套用
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  const setAppearance = useCallback((next: AppearanceConfig) => {
    const normalized = normalizeAppearance(next);
    setAppearanceState(normalized);
    writeStored(normalized);
  }, []);

  const reset = useCallback(() => {
    setAppearanceState(DEFAULT_APPEARANCE);
    writeStored(null);
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, setAppearance, reset }),
    [appearance, setAppearance, reset]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function readStored(): AppearanceConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return normalizeAppearance(JSON.parse(raw) as Partial<AppearanceConfig>);
  } catch {
    // 存取失敗或內容毀損都退回預設 —— 外觀設定壞掉不該讓整個 App 開不起來
    return DEFAULT_APPEARANCE;
  }
}

function writeStored(config: AppearanceConfig | null): void {
  try {
    if (config) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 無痕模式等情境下寫入會失敗，設定僅在本次瀏覽有效
  }
}
