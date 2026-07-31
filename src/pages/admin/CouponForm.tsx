import { useState, type FormEvent } from 'react';
import type {
  Coupon,
  CouponScope,
  CouponType,
  CouponValidityType,
  Product,
  Weekday
} from '../../types/models';
import type { ApiActionMap } from '../../types/api';
import { isoToLocalInput, localInputToIso } from '../../utils/datetime';
import { parseIntStrict } from '../../utils/number';

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' }
];

type CreatePayload = ApiActionMap['adminCreateCoupon']['payload'];

interface Props {
  /** 有值為編輯。編輯時 code / type / scope 不可改 */
  initial?: Coupon;
  products: Product[];
  submitting: boolean;
  errorField: string;
  onCancel: () => void;
  onSubmit: (values: CreatePayload) => void;
}

/**
 * 優惠券定義表單。
 *
 * 三個欄位會改變其他欄位的意義，因此表單是**動態**的：
 *
 * ```text
 * type        discount → 需要折抵金額；experience → 全額折抵，金額固定 0
 * scope       item     → 適用產品有效、滿額門檻無效
 *             cart     → 反之
 * validityType absolute → 需要起訖日期；relative → 需要天數
 * ```
 *
 * 把不適用的欄位**藏起來而不是留著讓人填**：後端會靜默忽略傳錯層級的欄位
 * （item 券的 minOrderAmount 會被存成 0），管理員填了卻沒生效卻毫無提示，
 * 那是最難查的一種問題。
 */
export function CouponForm({
  initial,
  products,
  submitting,
  errorField,
  onCancel,
  onSubmit
}: Props) {
  const isEdit = Boolean(initial);

  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CouponType>(initial?.type ?? 'discount');
  const [scope, setScope] = useState<CouponScope>(initial?.scope ?? 'item');
  const [discountAmount, setDiscountAmount] = useState(
    initial?.discountAmount ? String(initial.discountAmount) : ''
  );
  const [validityType, setValidityType] = useState<CouponValidityType>(
    initial?.validityType ?? 'absolute'
  );
  const [validFrom, setValidFrom] = useState(isoToLocalInput(initial?.validFrom ?? ''));
  const [validTo, setValidTo] = useState(isoToLocalInput(initial?.validTo ?? ''));
  const [validityDays, setValidityDays] = useState(
    initial?.validityDays ? String(initial.validityDays) : '30'
  );
  const [eligibleProductIds, setEligibleProductIds] = useState<string[]>(
    initial?.eligibleProductIds ?? []
  );
  const [minOrderAmount, setMinOrderAmount] = useState(String(initial?.minOrderAmount ?? 0));
  const [weekdays, setWeekdays] = useState<Weekday[]>(initial?.weekdays ?? []);
  const [firstPurchaseOnly, setFirstPurchaseOnly] = useState(initial?.firstPurchaseOnly ?? false);
  const [maxGrantsPerUser, setMaxGrantsPerUser] = useState(String(initial?.maxGrantsPerUser ?? 1));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [localError, setLocalError] = useState('');

  function toggleWeekday(day: Weekday) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function toggleProduct(productId: string) {
    setEligibleProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError('');

    if (!code.trim()) return setLocalError('請填寫代碼。');
    if (!name.trim()) return setLocalError('請填寫名稱。');

    const values: CreatePayload = {
      code: code.trim(),
      name: name.trim(),
      type,
      scope,
      validityType,
      weekdays,
      firstPurchaseOnly,
      enabled
    };

    if (type === 'discount') {
      const amount = parseIntStrict(discountAmount);
      if (amount === null || amount < 1) {
        return setLocalError('折價券的折抵金額必須是 1 以上的整數。');
      }
      values.discountAmount = amount;
    }

    if (validityType === 'absolute') {
      if (!validFrom || !validTo) return setLocalError('請填寫有效期間的起訖時間。');
      if (new Date(validFrom).getTime() >= new Date(validTo).getTime()) {
        return setLocalError('開始時間必須早於結束時間。');
      }
      values.validFrom = localInputToIso(validFrom);
      values.validTo = localInputToIso(validTo);
    } else {
      const days = parseIntStrict(validityDays);
      if (days === null || days < 1) return setLocalError('有效天數必須是 1 以上的整數。');
      values.validityDays = days;
    }

    // 只送對應層級的欄位。傳錯層級不會報錯但會被靜默忽略，
    // 不如根本不送，行為才與畫面一致
    if (scope === 'item') {
      values.eligibleProductIds = eligibleProductIds;
    } else {
      const min = parseIntStrict(minOrderAmount);
      if (min === null || min < 0) return setLocalError('滿額門檻必須是 0 以上的整數。');
      values.minOrderAmount = min;
    }

    const perUser = parseIntStrict(maxGrantsPerUser);
    if (perUser === null || perUser < 0) {
      return setLocalError('每人可持有張數必須是 0 以上的整數。');
    }
    values.maxGrantsPerUser = perUser;

    onSubmit(values);
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{isEdit ? '編輯優惠券' : '新增優惠券'}</h2>

      <div className="field-row">
        <div className="field">
          <label htmlFor="c-code">代碼</label>
          <input
            id="c-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isEdit}
            aria-invalid={errorField === 'code'}
          />
          <p className="hint">
            {isEdit
              ? '建立後不可修改。'
              : '僅供後台辨識，顧客不需要輸入 —— 券是發放制。'}
          </p>
        </div>

        <div className="field">
          <label htmlFor="c-name">名稱</label>
          <input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errorField === 'name'}
          />
          <p className="hint">顧客會看到這個名稱。</p>
        </div>

        <div className="field">
          <label htmlFor="c-per-user">每人可持有</label>
          <input
            id="c-per-user"
            type="number"
            min={0}
            step={1}
            value={maxGrantsPerUser}
            onChange={(e) => setMaxGrantsPerUser(e.target.value)}
          />
          <p className="hint">0 表示不限。</p>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="c-type">折抵方式</label>
          <select
            id="c-type"
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
            disabled={isEdit}
          >
            <option value="discount">折價券（折固定金額）</option>
            <option value="experience">體驗券（全額折抵）</option>
          </select>
          {isEdit && <p className="hint">建立後不可修改。</p>}
        </div>

        {type === 'discount' && (
          <div className="field">
            <label htmlFor="c-amount">折抵金額</label>
            <input
              id="c-amount"
              type="number"
              min={1}
              step={1}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              aria-invalid={errorField === 'discountAmount'}
            />
            <p className="hint">折抵不會超過套用對象的金額。</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="c-scope">套用層級</label>
          <select
            id="c-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as CouponScope)}
            disabled={isEdit}
          >
            <option value="item">單一品項</option>
            <option value="cart">整筆訂單</option>
          </select>
          {isEdit && <p className="hint">建立後不可修改。</p>}
        </div>
      </div>

      <p className="hint">
        品項券與整單券<strong>不可同時使用</strong>。顧客結帳時只能擇一，
        這是後端強制的規則。
      </p>

      {scope === 'item' ? (
        <div className="field">
          <label>適用產品</label>
          <div className="chip-group">
            {products.length === 0 && <p className="hint">尚未建立任何產品。</p>}
            {products.map((product) => (
              <button
                type="button"
                key={product.productId}
                className={`chip${eligibleProductIds.includes(product.productId) ? ' is-on' : ''}`}
                onClick={() => toggleProduct(product.productId)}
                aria-pressed={eligibleProductIds.includes(product.productId)}
              >
                {product.name}
              </button>
            ))}
          </div>
          <p className="hint">全部不選表示不限產品。</p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="c-min">滿額門檻</label>
          <input
            id="c-min"
            type="number"
            min={0}
            step={1}
            value={minOrderAmount}
            onChange={(e) => setMinOrderAmount(e.target.value)}
          />
          <p className="hint">以訂單原價總額判斷。0 表示不限。</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="c-validity">有效期型別</label>
        <select
          id="c-validity"
          value={validityType}
          onChange={(e) => setValidityType(e.target.value as CouponValidityType)}
        >
          <option value="absolute">固定期間（所有人到期日相同）</option>
          <option value="relative">領取後 N 天內有效</option>
        </select>
        <p className="hint">
          沒有「永久有效」的選項 —— 長期活動請在發放活動不設結束時間，
          券本身一定要有明確有效期。
        </p>
      </div>

      {validityType === 'absolute' ? (
        <div className="field-row">
          <div className="field">
            <label htmlFor="c-from">開始</label>
            <input
              id="c-from"
              type="datetime-local"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              aria-invalid={errorField === 'validFrom'}
            />
          </div>
          <div className="field">
            <label htmlFor="c-to">結束</label>
            <input
              id="c-to"
              type="datetime-local"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              aria-invalid={errorField === 'validTo'}
            />
          </div>
          <div />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="c-days">有效天數</label>
          <input
            id="c-days"
            type="number"
            min={1}
            step={1}
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            aria-invalid={errorField === 'validityDays'}
          />
          <p className="hint">到期日在發放的當下算好，之後不會改變。</p>
        </div>
      )}

      <div className="field">
        <label>限定星期</label>
        <div className="chip-group">
          {WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day.value}
              className={`chip${weekdays.includes(day.value) ? ' is-on' : ''}`}
              onClick={() => toggleWeekday(day.value)}
              aria-pressed={weekdays.includes(day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <p className="hint">
          依<strong>預約時間</strong>的星期判斷，不是下單當天。全部不選表示不限。
        </p>
      </div>

      <div className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={firstPurchaseOnly}
            onChange={(e) => setFirstPurchaseOnly(e.target.checked)}
          />
          限首次消費使用
        </label>
      </div>

      <div className="field">
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          啟用
        </label>
      </div>

      {localError && <p className="error">{localError}</p>}

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          取消
        </button>
      </div>
    </form>
  );
}
