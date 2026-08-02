import { useContext } from 'react';
import { SiteContext, type SiteContextValue } from './SiteProvider';

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) {
    throw new Error('useSite 必須在 <SiteProvider> 內使用');
  }
  return ctx;
}
