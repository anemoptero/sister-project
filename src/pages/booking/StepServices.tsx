import type { Product } from '../../types/models';
import { formatDuration, formatPrice } from '../../utils/format';
import { originalAmountOf, totalDurationOf, type BookingItem } from './types';

interface Props {
  products: Product[];
  items: BookingItem[];
  onToggle: (product: Product) => void;
  onNext: () => void;
}

/** 後端上限：一次預約最多 10 項 */
const MAX_ITEMS = 10;

/**
 * 步驟一：選擇服務組合。
 *
 * **必須排在選時間之前。** `listAvailableTimes` 需要總時長才能算出哪些起點
 * 塞得下，所以流程不能反過來 —— 先選時間再加購的話，原本選好的時段可能
 * 根本放不下新的總長。
 */
export function StepServices({ products, items, onToggle, onNext }: Props) {
  const selectedIds = new Set(items.map((item) => item.product.productId));
  const duration = totalDurationOf(items);
  const amount = originalAmountOf(items);
  const reachedMax = items.length >= MAX_ITEMS;

  return (
    <div className="stack">
      <div>
        <h2>選擇服務</h2>
        <p className="hint">可以複選，加購的項目會排在同一次預約裡連續進行。</p>
      </div>

      {products.length === 0 && (
        <div className="empty-state">
          <h2>目前沒有開放的療程</h2>
          <p>請稍後再回來看看。</p>
        </div>
      )}

      <div className="select-list">
        {products.map((product) => {
          const selected = selectedIds.has(product.productId);
          return (
            <button
              type="button"
              key={product.productId}
              className={`select-item${selected ? ' is-selected' : ''}`}
              onClick={() => onToggle(product)}
              disabled={!selected && reachedMax}
              aria-pressed={selected}
            >
              <span className="select-check" aria-hidden="true">
                {selected ? '✓' : ''}
              </span>

              <span className="select-body">
                <span className="select-title">{product.name}</span>
                {product.description && <span className="hint">{product.description}</span>}
              </span>

              <span className="select-side">
                <span className="product-price">{formatPrice(product.price)}</span>
                <span className="hint">{formatDuration(product.durationMinutes)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {reachedMax && <p className="hint">一次預約最多 {MAX_ITEMS} 項。</p>}

      <div className="summary-bar">
        <div>
          <span className="hint">已選 {items.length} 項</span>
          <strong>
            {formatPrice(amount)} · 共 {formatDuration(duration)}
          </strong>
        </div>
        <button type="button" onClick={onNext} disabled={items.length === 0}>
          選擇時間
        </button>
      </div>
    </div>
  );
}
