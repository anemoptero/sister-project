/**
 * 登入狀態的 context 定義。
 *
 * 刻意與 Provider 分成不同檔案：context 物件是純值，Provider 是元件。
 * 放在一起會讓 HMR 在每次改動 Provider 時重建 context，導致開發時
 * 登入狀態莫名消失。
 */

import { createContext } from 'react';
import type { PublicUser } from '../types/models';

export interface AuthState {
  /** 未登入時為 null */
  user: PublicUser | null;
  /**
   * 是否已填電話。false 時下單會被後端擋下並回 `PROFILE_INCOMPLETE`，
   * 所以進入預約流程前應先導向補資料頁。
   */
  profileComplete: boolean;
  /**
   * 初始化是否完成。
   *
   * 必須區分「還在確認登入狀態」與「確認過了，沒登入」——
   * 否則重新整理的瞬間會把已登入的使用者閃到登入頁。
   */
  initializing: boolean;
}

/**
 * 函式一律以**屬性語法**宣告（`f: () => void`）而非方法簡寫（`f(): void`）。
 *
 * 方法簡寫在 TS 中被視為類別方法，解構出來使用時會觸發
 * `@typescript-eslint/unbound-method` —— 而這裡的實作全是 `useCallback`
 * 產生的獨立函式，本來就與 `this` 無關，屬性語法才是誠實的描述。
 */
export interface AuthContextValue extends AuthState {
  isLoggedIn: boolean;
  isAdmin: boolean;
  /** 由登入流程在 `loginWithLine` 成功後呼叫 */
  signIn: (sessionToken: string, user: PublicUser, profileComplete: boolean) => void;
  /** 呼叫 logout API 並清除本地狀態。失敗時仍會清除本地狀態 */
  signOut: () => Promise<void>;
  /** 補完個人資料後更新狀態，避免整頁重載 */
  updateUser: (user: PublicUser, profileComplete: boolean) => void;
  /** 重新向後端確認一次登入狀態 */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
