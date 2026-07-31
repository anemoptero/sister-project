import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callApi, isApiError, validationField } from '../api/client';
import { useAuth } from '../auth/useAuth';

/**
 * 個人資料維護，第一階段的重點是**補電話**。
 *
 * 為什麼需要：LINE 拿不到電話號碼（`docs/DEV_PLAN.md` §8.0），但預約系統
 * 必須有聯絡方式 —— 客人要改期、當天未到、預約有疑問時，工作室根本
 * 找不到人。因此 `createOrder` 會擋下沒電話的使用者並回 `PROFILE_INCOMPLETE`。
 */
export default function ProfilePage() {
  const { user, profileComplete, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const from = searchParams.get('from') || '';

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setErrorField('');
    setSaved(false);

    try {
      // 只送有變動的欄位：後端要求至少要有一個可更新欄位，
      // 全部原樣送出會在使用者只想改一個欄位時造成不必要的寫入
      const payload: { phone?: string; displayName?: string } = {};
      if (phone !== (user?.phone ?? '')) payload.phone = phone;
      if (displayName !== (user?.displayName ?? '')) payload.displayName = displayName;

      if (!payload.phone && !payload.displayName) {
        setError('沒有任何變更。');
        return;
      }

      const data = await callApi('updateMyProfile', payload);
      updateUser(data.user, data.profileComplete);
      setSaved(true);

      // 從預約流程被導過來的，補完就送回去
      if (data.profileComplete && from) {
        void navigate(from, { replace: true });
      }
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        setErrorField(validationField(err));
      } else {
        setError('儲存失敗，請稍後再試。');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>個人資料</h1>

      {!profileComplete && (
        <p className="notice">
          請留下聯絡電話，預約有異動時我們才能通知你。填寫後才能完成預約。
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="phone">聯絡電話</label>
          <input
            id="phone"
            name="phone"
            // tel 讓手機跳出數字鍵盤；格式驗證交給後端，
            // 前端擋太嚴會誤擋市話與少見格式
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912345678"
            aria-invalid={errorField === 'phone'}
          />
          <p className="hint">8 到 15 位數字。</p>
        </div>

        <div className="field">
          <label htmlFor="displayName">稱呼</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={errorField === 'displayName'}
          />
          <p className="hint">預設是你的 LINE 名稱，可改成方便辨識的稱呼。</p>
        </div>

        {error && <p className="error">{error}</p>}
        {saved && !error && <p className="success">已儲存。</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
      </form>
    </div>
  );
}
