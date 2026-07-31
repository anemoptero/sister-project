import type { Product } from '../types/models';
import { formatDuration, formatPrice } from '../utils/format';

/**
 * 產品變動的差異呈現。
 *
 * 後端回 `PRODUCT_CHANGED` 時**只給當前產品，不給變動欄位清單** ——
 * 那需要保存產品歷史，成本不成比例。前端本來就持有舊資料，由前端比對
 * 最省（`docs/API_SPEC.md` §5.1）。
 *
 * 兩個地方會用到：
 *   後台改產品時另一位管理員先改過
 *   顧客下單途中管理員改了價格
 *
 * 後者尤其要緊 —— 沒有這個畫面，顧客只會看到「產品已更新」卻不知道
 * 到底變了什麼，等於要他盲目重新確認。
 */

/** 只列出顧客／管理員在意的欄位，`version`、`productId` 這種內部欄位不顯示 */
const COMPARED_FIELDS = [
  { key: 'name', label: '名稱' },
  { key: 'price', label: '價格' },
  { key: 'durationMinutes', label: '療程時間' },
  { key: 'description', label: '內容' },
  { key: 'imageUrl', label: '圖片網址' },
  { key: 'imageAlt', label: '圖片說明' },
  { key: 'displayOrder', label: '排序' },
  { key: 'enabled', label: '啟用狀態' }
] as const;

type ComparedKey = (typeof COMPARED_FIELDS)[number]['key'];

/**
 * 值的型別限定為 `Product[ComparedKey]`（string | number | boolean）而非 unknown，
 * 這樣 `String(value)` 才有意義 —— 若允許傳入物件，會靜默印出 `[object Object]`。
 */
function display(key: ComparedKey, value: Product[ComparedKey] | undefined): string {
  if (value === undefined || value === '') return '（空白）';
  if (key === 'price') return formatPrice(Number(value));
  if (key === 'durationMinutes') return formatDuration(Number(value));
  if (key === 'enabled') return value ? '啟用' : '停用';
  return String(value);
}

export interface ProductDiffProps {
  /** 畫面上原本顯示的值（可能只有部分欄位） */
  before: Partial<Product>;
  /** 後端回傳的當前值 */
  after: Product;
}

export function ProductDiff({ before, after }: ProductDiffProps) {
  const changes = COMPARED_FIELDS.filter(({ key }) => {
    // before 沒有這個欄位就無從比較，不能當成「有變動」——
    // 否則會列出一堆「（空白）→ 某值」的假差異
    if (before[key] === undefined) return false;
    return before[key] !== after[key];
  });

  if (changes.length === 0) {
    return (
      <p className="hint">
        比對不出具體差異，可能是其他欄位有變動。請確認下方的最新內容。
      </p>
    );
  }

  return (
    <table className="diff-table">
      <thead>
        <tr>
          <th>項目</th>
          <th>原本</th>
          <th>目前</th>
        </tr>
      </thead>
      <tbody>
        {changes.map(({ key, label }) => (
          <tr key={key}>
            <th scope="row">{label}</th>
            <td className="diff-before">{display(key, before[key])}</td>
            <td className="diff-after">{display(key, after[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
