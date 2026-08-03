import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { callApi, isApiError } from '../../api/client';
import { formatDateTime } from '../../utils/format';

/**
 * 領取優惠券。
 *
 * 對應 `claimCoupon`。領取碼由店家在後台建立「連結領取」活動時產生，
 * 可以做成連結（`#/claim/WELCOME2026`）直接分享，也可以口頭給碼讓顧客自行輸入。
 *
 * 刻意**不在載入時自動送出** —— 領取是一次性的（每人有領取上限），
 * 自動送出遇到重新整理或 StrictMode 的重複掛載時，第二次會收到
 * 「您已領取過此優惠券」，顧客會以為領取失敗。
 */
export default function ClaimCouponPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState(token ?? '');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ name: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');

  async function claim() {
    const code = input.trim();
    if (!code) {
      setError('請輸入領取碼。');
      return;
    }

    setClaiming(true);
    setError('');
    try {
      const data = await callApi('claimCoupon', { claimToken: code });
      setClaimed({ name: data.name, expiresAt: data.expiresAt });
    } catch (err) {
      setError(isApiError(err) ? err.message : '領取失敗，請稍後再試。');
    } finally {
      setClaiming(false);
    }
  }

  if (claimed) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>領取成功</h2>
          <p>已把「{claimed.name || '優惠券'}」放進你的優惠券清單。</p>
          {claimed.expiresAt && (
            <p className="hint">使用期限至 {formatDateTime(claimed.expiresAt)}</p>
          )}
          <div className="actions">
            <button type="button" onClick={() => void navigate('/my/coupons')}>
              看我的優惠券
            </button>
            <Link className="btn secondary" to="/booking">
              直接去預約
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>領取優惠券</h1>

      {error && <p className="error">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void claim();
        }}
      >
        <div className="field">
          <label htmlFor="claimToken">領取碼</label>
          <input
            id="claimToken"
            name="claimToken"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如 WELCOME2026"
            autoComplete="off"
            disabled={claiming}
          />
          {/* 後端會統一轉成大寫比對 */}
          <p className="hint">大小寫不影響。領取碼由店家提供。</p>
        </div>

        <div className="actions">
          <button type="submit" disabled={claiming}>
            {claiming ? '領取中…' : '領取'}
          </button>
          <Link className="btn secondary" to="/my/coupons">
            我的優惠券
          </Link>
        </div>
      </form>
    </div>
  );
}
