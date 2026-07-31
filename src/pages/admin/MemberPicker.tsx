import { useState } from 'react';
import type { AdminCustomer } from '../../types/models';

interface Props {
  customers: AdminCustomer[];
  /** 尚未發放、可以移除的會員 */
  pending: string[];
  /** 已經發放、不可從這裡移除的會員。要移除必須到下方回收該張券 */
  granted: string[];
  max: number;
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
}

/**
 * 會員選擇器。
 *
 * **預設就把所有會員列出來**，搜尋只是縮小範圍的輔助 ——
 * 管理員不可能記得每位客人的暱稱或電話，「先搜尋才看得到人」等於要求
 * 他先知道答案才能找答案。清單可捲動，人多時再用搜尋過濾。
 *
 * 已發放的會員以鎖定狀態顯示，**不提供移除按鈕**：券已經在對方帳戶裡，
 * 從清單上取消勾選並不會收回它。真正的收回在下方的領取紀錄，那裡才會
 * 實際標記 `revokedAt`。若這裡允許移除，管理員會以為券收回了，
 * 但顧客結帳時仍然能用。
 */
export function MemberPicker({ customers, pending, granted, max, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState('');

  const byUid = (uid: string) => customers.find((c) => c.uid === uid);
  const label = (uid: string) => byUid(uid)?.displayName || '（未命名）';

  const pendingSet = new Set(pending);
  const grantedSet = new Set(granted);

  const q = query.trim();
  const matched = customers.filter(
    (c) => !q || c.displayName.includes(q) || c.phone.includes(q)
  );

  const selectedCount = pending.length + granted.length;
  const reachedMax = selectedCount >= max;

  return (
    <div className="member-picker">
      <div className="field">
        <label htmlFor="mp-search">
          會員清單（共 {customers.length} 位，已選 {selectedCount} / {max}）
        </label>
        <input
          id="mp-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="人數多時可輸入名稱或電話過濾"
          autoComplete="off"
        />
      </div>

      <div className="picker-list">
        {customers.length === 0 && (
          <p className="hint">
            尚無會員資料。會員要先用 LINE 登入過一次，系統才會建立帳號。
          </p>
        )}

        {customers.length > 0 && matched.length === 0 && (
          <p className="hint">沒有符合「{q}」的會員。</p>
        )}

        {matched.map((customer) => {
          const isGranted = grantedSet.has(customer.uid);
          const isPending = pendingSet.has(customer.uid);
          // 已發放的一律不可再點；未選的在額度滿時也不可再加
          const disabled = isGranted || (!isPending && reachedMax);

          return (
            <button
              type="button"
              key={customer.uid}
              className={`picker-option${isPending ? ' is-selected' : ''}`}
              disabled={disabled}
              onClick={() => (isPending ? onRemove(customer.uid) : onAdd(customer.uid))}
            >
              <span className="picker-check" aria-hidden="true">
                {isGranted ? '✓' : isPending ? '✓' : ''}
              </span>
              <span className="picker-name">{customer.displayName || '（未命名）'}</span>
              {customer.phone && <span className="hint">{customer.phone}</span>}
              {isGranted && <span className="chip-lock">已發放</span>}
            </button>
          );
        })}
      </div>

      {reachedMax && (
        <p className="hint">已達單次上限 {max} 位，請先儲存後再分批加入。</p>
      )}

      {(pending.length > 0 || granted.length > 0) && (
        <div className="field">
          <label>已選擇</label>
          <div className="chip-group">
            {granted.map((uid) => (
              <span key={uid} className="chip is-locked" title="已發放，需在下方領取紀錄回收">
                {label(uid)}
                <span className="chip-lock" aria-hidden="true">
                  已發放
                </span>
              </span>
            ))}

            {pending.map((uid) => (
              <span key={uid} className="chip is-on">
                {label(uid)}
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => onRemove(uid)}
                  aria-label={`移除 ${label(uid)}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {granted.length > 0 && (
            <p className="hint">
              標示「已發放」的無法從這裡移除 —— 券已經在對方帳戶裡，
              取消勾選並不會收回。要收回請到下方的領取紀錄。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
