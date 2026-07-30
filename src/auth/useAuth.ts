import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';

/**
 * 取用登入狀態。
 *
 * 在 `<AuthProvider>` 之外呼叫會直接拋錯而非回傳 null —— 那是明確的
 * 組裝錯誤，靜默回 null 只會讓問題延後在某個「使用者莫名沒登入」的
 * 畫面上爆開，更難查。
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必須在 <AuthProvider> 內使用');
  }
  return ctx;
}
