import { useContext } from 'react';
import { AppearanceContext, type AppearanceContextValue } from './AppearanceProvider';

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance 必須在 <AppearanceProvider> 內使用');
  }
  return ctx;
}
