import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { callApi, isApiError, onUnauthorized } from '../api/client';
import { clearSessionToken, hasSessionToken, setSessionToken } from '../api/session';
import type { PublicUser } from '../types/models';
import { AuthContext, type AuthContextValue } from './AuthContext';

/**
 * 登入狀態的唯一來源。
 *
 * ⚠️ `isAdmin` 只用於**決定畫面顯示什麼**，不是安全防線。
 * 真正的權限判斷在 Apps Script（`applyAuth_`）—— 前端把 admin 按鈕
 * 藏起來只是體驗問題，就算被繞過，API 仍會回 `FORBIDDEN`。
 * 見 docs/AGENT_GUIDE.md §4.2。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const clearLocalAuth = useCallback(() => {
    clearSessionToken();
    setUser(null);
    setProfileComplete(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!hasSessionToken()) {
      clearLocalAuth();
      setInitializing(false);
      return;
    }

    try {
      const data = await callApi('getCurrentUser', {});
      setUser(data.user);
      setProfileComplete(data.profileComplete);
    } catch (err) {
      // UNAUTHORIZED 時 client 已清掉 token 並觸發 onUnauthorized，
      // 這裡只要確保狀態一致即可。其他錯誤（例如網路不通）不應該把
      // 使用者登出 —— 那會讓一次連線抖動變成重新登入。
      if (isApiError(err) && err.isUnauthorized) {
        clearLocalAuth();
      }
    } finally {
      setInitializing(false);
    }
  }, [clearLocalAuth]);

  // 開啟頁面 / 重新整理時確認一次登入狀態
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // session 在任何一支 API 上失效時同步清除畫面狀態。
  // client 不知道 React 的存在，透過這個回呼通知。
  useEffect(() => onUnauthorized(clearLocalAuth), [clearLocalAuth]);

  const signIn = useCallback(
    (sessionToken: string, nextUser: PublicUser, nextProfileComplete: boolean) => {
      setSessionToken(sessionToken);
      setUser(nextUser);
      setProfileComplete(nextProfileComplete);
      setInitializing(false);
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await callApi('logout', {});
    } catch {
      // 撤銷失敗（網路不通、session 早已過期）仍要清掉本地狀態 ——
      // 使用者按了登出，畫面就必須登出，否則會以為自己沒登出成功。
    } finally {
      clearLocalAuth();
    }
  }, [clearLocalAuth]);

  const updateUser = useCallback((nextUser: PublicUser, nextProfileComplete: boolean) => {
    setUser(nextUser);
    setProfileComplete(nextProfileComplete);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profileComplete,
      initializing,
      isLoggedIn: Boolean(user),
      isAdmin: user?.role === 'admin',
      signIn,
      signOut,
      updateUser,
      refresh
    }),
    [user, profileComplete, initializing, signIn, signOut, updateUser, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
