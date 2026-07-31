import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { callApi, isApiError, onUnauthorized } from '../api/client';
import {
  clearSession,
  getCachedUser,
  hasSessionToken,
  setCachedUser,
  setSessionToken
} from '../api/session';
import type { PublicUser } from '../types/models';
import { AuthContext, type AuthContextValue } from './AuthContext';

/** 快取裡除了使用者本身，也記著上次的 profileComplete，避免多一次判斷 */
interface CachedAuth {
  user: PublicUser;
  profileComplete: boolean;
}

/**
 * 登入狀態的唯一來源。
 *
 * ⚠️ `isAdmin` 只用於**決定畫面顯示什麼**，不是安全防線。
 * 真正的權限判斷在 Apps Script（`applyAuth_`）—— 前端把 admin 按鈕
 * 藏起來只是體驗問題，就算被繞過，API 仍會回 `FORBIDDEN`。
 * 見 docs/AGENT_GUIDE.md §4.2。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  /**
   * 以快取作為初始值。
   *
   * 呼叫 Apps Script 的固定開銷是數秒起跳，若等 `getCurrentUser` 回來才渲染，
   * 使用者會先看到幾秒空白、頁面自己的資料再等第二次往返。先用快取渲染
   * 可以把這兩段等待從串行變成並行。
   */
  const cached = hasSessionToken() ? getCachedUser<CachedAuth>() : null;

  const [user, setUser] = useState<PublicUser | null>(cached?.user ?? null);
  const [profileComplete, setProfileComplete] = useState(cached?.profileComplete ?? false);
  // 有快取就不算初始化中 —— 守衛可以立刻放行，背景再確認
  const [initializing, setInitializing] = useState(!cached);

  const clearLocalAuth = useCallback(() => {
    clearSession();
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
      // 背景確認的結果覆蓋快取，role 或電話有變動時下次開啟就是新的
      setCachedUser({ user: data.user, profileComplete: data.profileComplete });
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
      setCachedUser({ user: nextUser, profileComplete: nextProfileComplete });
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
    setCachedUser({ user: nextUser, profileComplete: nextProfileComplete });
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
