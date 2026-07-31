import { useState, type FormEvent } from 'react';
import type { Product } from '../../types/models';
import { parseIntStrict } from '../../utils/number';

/**
 * 產品表單，新增與編輯共用。
 *
 * 數字欄位以**字串**保存而非 number：`<input type="number">` 清空時值是空字串，
 * 硬轉成 number 會變 NaN 並靜默送出 0 —— 價格被無聲改成 0 比直接報錯危險得多。
 * 送出前才轉換，轉不出整數就擋下。
 *
 * 前端驗證只做「明顯錯誤」的攔截，正式驗證一律由 Apps Script 負責
 * （`docs/AGENT_GUIDE.md` §4.2）。
 */

export interface ProductFormValues {
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  imageUrl: string;
  imageAlt: string;
  displayOrder: number;
  enabled: boolean;
}

interface Props {
  /** 有值為編輯，沒值為新增 */
  initial?: Product;
  submitting: boolean;
  errorField: string;
  onCancel: () => void;
  onSubmit: (values: ProductFormValues) => void;
}

export function ProductForm({ initial, submitting, errorField, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [duration, setDuration] = useState(initial ? String(initial.durationMinutes) : '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(initial?.imageAlt ?? '');
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? 0));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [localError, setLocalError] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError('');

    if (!name.trim()) {
      setLocalError('請填寫名稱。');
      return;
    }

    const priceValue = parseIntStrict(price);
    const durationValue = parseIntStrict(duration);
    const orderValue = parseIntStrict(displayOrder);

    if (priceValue === null || priceValue < 0) {
      setLocalError('價格必須是 0 或以上的整數，不接受小數。');
      return;
    }
    if (durationValue === null || durationValue <= 0 || durationValue > 1440) {
      setLocalError('療程時間必須是 1 到 1440 之間的整數（分鐘）。');
      return;
    }
    if (orderValue === null || orderValue < 0) {
      setLocalError('排序必須是 0 或以上的整數。');
      return;
    }

    // http 圖片在 https 網站上會被瀏覽器以混合內容擋掉，
    // 畫面破圖卻沒有明顯錯誤訊息，極難排查，所以先擋在這裡
    if (imageUrl && !imageUrl.startsWith('https://')) {
      setLocalError('圖片網址必須以 https:// 開頭。');
      return;
    }

    onSubmit({
      name: name.trim(),
      description,
      price: priceValue,
      durationMinutes: durationValue,
      imageUrl: imageUrl.trim(),
      imageAlt: imageAlt.trim(),
      displayOrder: orderValue,
      enabled
    });
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{initial ? '編輯產品' : '新增產品'}</h2>

      <div className="field">
        <label htmlFor="p-name">名稱</label>
        <input
          id="p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-invalid={errorField === 'name'}
        />
      </div>

      <div className="field">
        <label htmlFor="p-desc">內容</label>
        <textarea
          id="p-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="p-price">價格</label>
          <input
            id="p-price"
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={errorField === 'price'}
          />
          <p className="hint">新台幣元，整數。</p>
        </div>

        <div className="field">
          <label htmlFor="p-duration">療程時間</label>
          <input
            id="p-duration"
            type="number"
            inputMode="numeric"
            step={1}
            min={1}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            aria-invalid={errorField === 'durationMinutes'}
          />
          <p className="hint">分鐘。這會決定預約佔用多少時間。</p>
        </div>

        <div className="field">
          <label htmlFor="p-order">排序</label>
          <input
            id="p-order"
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            aria-invalid={errorField === 'displayOrder'}
          />
          <p className="hint">數字小的排前面。</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="p-image">圖片網址</label>
        <input
          id="p-image"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
          aria-invalid={errorField === 'imageUrl'}
        />
        <p className="hint">
          第一階段不使用 Firebase Storage，請填外部公開圖片網址，必須是 https。可留空。
        </p>
      </div>

      {imageUrl.startsWith('https://') && (
        <div className="field">
          <img src={imageUrl} alt="" className="image-preview" />
        </div>
      )}

      <div className="field">
        <label htmlFor="p-alt">圖片說明</label>
        <input
          id="p-alt"
          value={imageAlt}
          onChange={(e) => setImageAlt(e.target.value)}
          maxLength={200}
        />
        <p className="hint">圖片載入失敗或使用讀屏軟體時顯示的文字。</p>
      </div>

      <div className="field">
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          啟用（顧客可看到並預約）
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

