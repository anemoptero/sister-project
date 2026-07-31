import type { Product } from '../types/models';
import { ProductDiff } from './ProductDiff';

export interface ProductChange {
  /** 顧客**最初看到**的內容。管理員連續改兩次時仍以最早的為準 */
  before: Product;
  after: Product;
}

interface Props {
  changes: ProductChange[];
  /** 有值時顯示確認按鈕；省略則為唯讀提示（例如在選時間頁） */
  onAcknowledge?: () => void;
  compact?: boolean;
}

/**
 * 療程內容變更的通知。
 *
 * ⚠️ **這個通知必須跨步驟存活。**
 *
 * 曾經把它放在確認頁元件內，結果顧客因時段被搶而被退回選時間頁時，元件卸載、
 * 通知消失；重新選好時間回來後，畫面直接顯示新價格與新時長，沒有任何提示。
 * 對照情境：療程從 45 分鐘 1200 元改成 60 分鐘 50 元，顧客不但不知道價格變了，
 * 連「為什麼時段選項跟剛才不一樣」都無從理解。
 *
 * 因此變更記錄由流程的最上層保存，並且在顧客明確按下確認之前**不允許送出**。
 */
export function ProductChangeNotice({ changes, onAcknowledge, compact = false }: Props) {
  if (changes.length === 0) return null;

  return (
    <section className="card notice-card">
      <h3>療程內容已更新</h3>
      <p>
        你在預約的這段時間裡，以下療程被調整了。
        {compact
          ? '可預約時段已依新的療程時間重新計算。'
          : '金額已更新為最新內容，確認後再送出一次即可 —— 不需要重新預約。'}
      </p>

      {changes.map((change) => (
        <div key={change.after.productId} className="change-block">
          <h4>{change.after.name}</h4>
          <ProductDiff before={change.before} after={change.after} />
        </div>
      ))}

      {onAcknowledge && (
        <div className="actions">
          <button type="button" onClick={onAcknowledge}>
            我已確認以上變更
          </button>
        </div>
      )}

      {!onAcknowledge && (
        <p className="hint">回到確認頁後需要再次確認這些變更才能送出。</p>
      )}
    </section>
  );
}
