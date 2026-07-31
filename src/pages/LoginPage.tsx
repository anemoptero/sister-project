import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { callApi, isApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import {
  LiffError,
  getLineIdToken,
  getLineProfile,
  initLiff,
  isInLineClient,
  isLiffConfigured,
  isLoggedInToLine,
  lineLogin
} from '../liff/liff';
import { buildReturnUrl } from '../liff/returnUrl';

type Phase = 'working' | 'redirecting' | 'error';

/**
 * LINE 登入頁。
 *
 * 流程：
 *   liff.init → 未登入 LINE 則導向 LINE 登入（離開頁面）
 *   → 回來後取 idToken → loginWithLine → 存 sessionToken → 導回原頁
 *
 * ⚠️ `liff.login()` 會離開這個頁面，因此「原本要去哪」不能只放在
 * `location.state` —— 那在整頁跳轉後就沒了。必須寫進網址，見 buildReturnUrl。
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, initializing, signIn } = useAuth();

  const [phase, setPhase] = useState<Phase>('working');
  const [errorMessage, setErrorMessage] = useState('');

  // 目的地優先讀網址（跳轉後仍在），其次才是 router state（同頁導航時才有）
  const stateFrom = (location.state as { from?: string } | null)?.from;
  const from = searchParams.get('from') || stateFrom || '/';

  /**
   * 來源渠道，只在**首次登入**時被記錄，之後不再覆蓋 ——
   * 否則客戶來源統計會被最後一次登入洗掉。
   * 行銷連結可帶 `?src=xxx`，未帶時依環境給預設值。
   */
  const sourceChannel =
    searchParams.get('src') ||
    new URLSearchParams(window.location.search).get('src') ||
    '';

  // React 18+ 的 StrictMode 會在開發模式重跑 effect，
  // 而登入流程有副作用（跳轉、建立 session），必須自行防重入
  const startedRef = useRef(false);

  const runLogin = useCallback(async () => {
    setPhase('working');
    setErrorMessage('');

    try {
      await initLiff();

      if (!isLoggedInToLine()) {
        setPhase('redirecting');
        // 把目的地寫進 redirectUri，登入完 LINE 會原樣帶回來
        lineLogin(buildReturnUrl(from, sourceChannel, window.location));
        return; // 頁面即將離開，後面不會執行
      }

      const [idToken, profile] = [getLineIdToken(), await getLineProfile()];

      const data = await callApi('loginWithLine', {
        lineIdToken: idToken,
        ...(sourceChannel ? { sourceChannel } : {}),
        profile
      });

      signIn(data.sessionToken, data.user, data.profileComplete);

      // 沒有電話就先補資料 —— 否則會在下單最後一步才被擋，體驗更差
      if (!data.profileComplete) {
        void navigate(`/my/profile?from=${encodeURIComponent(from)}`, { replace: true });
        return;
      }

      void navigate(from, { replace: true });
    } catch (err) {
      startedRef.current = false; // 允許按重試
      setPhase('error');
      setErrorMessage(describeLoginError(err));
    }
  }, [from, sourceChannel, signIn, navigate]);

  useEffect(() => {
    // 等 AuthProvider 確認完既有 session 再決定要不要跑登入，
    // 否則已登入的使用者會被多做一次 LINE 登入
    if (initializing) return;

    if (isLoggedIn) {
      void navigate(from, { replace: true });
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;
    void runLogin();
  }, [initializing, isLoggedIn, from, navigate, runLogin]);

  if (!isLiffConfigured()) {
    return (
      <div className="page">
        <h1>尚未設定登入</h1>
        <p>此環境缺少 LIFF ID，無法使用 LINE 登入。</p>
        <p className="hint">
          請在部署環境設定 <code>VITE_LIFF_ID</code>，值取自 LINE Developers Console 的 LIFF 分頁。
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="page">
        <h1>登入失敗</h1>
        <p>{errorMessage}</p>
        <p>
          <button type="button" onClick={() => void runLogin()}>
            重試
          </button>
        </p>
        {!isInLineClient() && (
          <p className="hint">若持續失敗，請改從 LINE App 開啟此頁面。</p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>登入中</h1>
      <p className="hint">
        {phase === 'redirecting' ? '正在前往 LINE 登入…' : '正在確認你的 LINE 身分…'}
      </p>
    </div>
  );
}

/** 把各種失敗轉成使用者看得懂的說明，而不是丟原始錯誤訊息 */
function describeLoginError(err: unknown): string {
  if (err instanceof LiffError) {
    return err.message;
  }
  if (isApiError(err)) {
    // 後端的錯誤訊息本來就是寫給使用者看的，直接用
    return err.message;
  }
  return '登入過程發生未預期的問題，請稍後再試。';
}
