import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { callApi, isApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import {
  LiffError,
  forceLineRelogin,
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
 * 已經為了取得新 token 重新登入過一次的標記。
 *
 * 存在 sessionStorage 而非記憶體：重新登入是**整頁跳轉**，記憶體變數會歸零，
 * 那樣一來「重試一次」的上限就永遠不會生效，變成無限跳轉迴圈。
 */
const RELOGIN_FLAG = 'sister.liffRelogin';

function hasTriedRelogin(): boolean {
  try {
    return window.sessionStorage.getItem(RELOGIN_FLAG) === '1';
  } catch {
    // 讀不到就當成試過了。寧可讓使用者看到錯誤訊息，
    // 也不要冒無限跳轉的風險
    return true;
  }
}

function markRelogin(tried: boolean): void {
  try {
    if (tried) window.sessionStorage.setItem(RELOGIN_FLAG, '1');
    else window.sessionStorage.removeItem(RELOGIN_FLAG);
  } catch {
    // 無痕模式等情境下寫入會失敗，退回「不自動重試」的行為
  }
}

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

      // 成功了就清掉重試標記，下次過期時才能再自動修復一次
      markRelogin(false);
      signIn(data.sessionToken, data.user, data.profileComplete);

      // 沒有電話就先補資料 —— 否則會在下單最後一步才被擋，體驗更差
      if (!data.profileComplete) {
        void navigate(`/my/profile?from=${encodeURIComponent(from)}`, { replace: true });
        return;
      }

      // 管理員沒有指定目的地時直接進後台 —— 他們登入幾乎都是為了管理，
      // 而不是瀏覽療程。有 from 時仍以 from 為準（例如被守衛導過來的）
      const landing = from === '/' && data.user.role === 'admin' ? '/admin' : from;
      void navigate(landing, { replace: true });
    } catch (err) {
      /**
       * idToken 過期是可以自動修復的：清掉 LINE 登入狀態重新取得即可。
       *
       * 後端只回「LINE idToken 驗證失敗」（`UNAUTHORIZED`），不區分原因 ——
       * 詳細的 error_description 可能含 token 片段，只寫進 Cloud Logging。
       * 因此這裡把後端的 UNAUTHORIZED 也一併當成可能是過期來處理。
       *
       * 只自動修復一次。若重新登入後仍失敗，那就不是過期問題（多半是
       * LINE_CHANNEL_ID 設錯），繼續跳轉只會變成無限迴圈。
       */
      const maybeStaleToken =
        (err instanceof LiffError && err.code === 'ID_TOKEN_EXPIRED') ||
        (isApiError(err) && err.isUnauthorized);

      if (maybeStaleToken && !hasTriedRelogin()) {
        markRelogin(true);
        setPhase('redirecting');
        forceLineRelogin(buildReturnUrl(from, sourceChannel, window.location));
        return;
      }

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
        <p className="error">{errorMessage}</p>

        <div className="actions">
          <button type="button" onClick={() => void runLogin()}>
            重試
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              // 清掉標記再強制重新登入，讓使用者能手動再試一次完整流程
              markRelogin(false);
              forceLineRelogin(buildReturnUrl(from, sourceChannel, window.location));
            }}
          >
            清除 LINE 登入狀態後重試
          </button>
        </div>

        {/* 自動修復過一次仍失敗，代表不是 token 過期，給出實際的排查方向 */}
        {hasTriedRelogin() && (
          <div className="notice" style={{ marginTop: 'var(--space-5)' }}>
            <p>
              <strong>已重新取得 LINE 身分但仍然失敗</strong>，這通常不是登入逾時，而是設定問題。
            </p>
            <p>請確認 Apps Script 指令碼屬性的 <code>LINE_CHANNEL_ID</code> 等於 LIFF ID 的前半段
              （<code>-</code> 之前那串數字）。詳細原因寫在 Apps Script 的執行記錄裡。</p>
          </div>
        )}

        {!isInLineClient() && (
          <p className="hint">若持續失敗，也可以改從 LINE App 開啟此頁面試試。</p>
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
