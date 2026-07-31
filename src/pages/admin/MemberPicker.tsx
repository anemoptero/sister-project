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

/** 一次最多顯示幾筆候選。太多會把版面淹掉，也失去「搜尋」的意義 */
const MAX_SUGGESTIONS = 8;

/**
 * 會員選擇器：可搜尋的下拉候選 + 已選清單。
 *
 * 已發放的會員以鎖定狀態顯示，**不提供移除按鈕** —— 券一旦發出去就存在於
 * 對方的帳戶裡，從這個清單上「取消勾選」並不會把它收回來。真正的收回動作
 * 在下方的領取紀錄，那裡才會實際標記 `revokedAt`。
 *
 * 若這裡允許移除，管理員會以為券已經收回，但顧客結帳時仍然能用 ——
 * 畫面與實際狀態不一致是最糟的一種錯誤。
 */
export function MemberPicker({ customers, pending, granted, max, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState('');

  const byUid = (uid: string) => customers.find((c) => c.uid === uid);
  const label = (uid: string) => byUid(uid)?.displayName || '（未命名）';

  const taken = new Set([...pending, ...granted]);

  const suggestions = customers
    .filter((c) => !taken.has(c.uid))
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.trim();
      return c.displayName.includes(q) || c.phone.includes(q);
    })
    .slice(0, MAX_SUGGESTIONS);

  const reachedMax = pending.length + granted.length >= max;

  return (
    <div className="member-picker">
      <div className="field">
        <label htmlFor="mp-search">加入會員</label>
        <input
          id="mp-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="輸入名稱或電話搜尋"
          disabled={reachedMax}
          autoComplete="off"
        />
        <p className="hint">
          已選 {pending.length + granted.length} / {max} 位。
          {reachedMax && '已達單次上限，請先儲存後再分批加入。'}
        </p>
      </div>

      {!reachedMax && (
        <div className="picker-list">
          {customers.length === 0 && <p className="hint">尚無會員資料。</p>}

          {customers.length > 0 && suggestions.length === 0 && (
            <p className="hint">
              {query.trim() ? '沒有符合的會員。' : '所有會員都已加入。'}
            </p>
          )}

          {suggestions.map((customer) => (
            <button
              type="button"
              key={customer.uid}
              className="picker-option"
              onClick={() => {
                onAdd(customer.uid);
                // 加入後清空搜尋，方便連續加入多位
                setQuery('');
              }}
            >
              <span className="picker-name">{customer.displayName || '（未命名）'}</span>
              {customer.phone && <span className="hint">{customer.phone}</span>}
            </button>
          ))}
        </div>
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
