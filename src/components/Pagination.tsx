import { pageCount } from '../api/fetchAll';

interface Props {
  /** **完整資料**的筆數，不是當頁的 */
  total: number;
  /** 從 1 起算 */
  page: number;
  onChange: (page: number) => void;
  pageSize: number;
  /** 「共 120 筆會員」裡的「會員」。省略時只顯示筆數 */
  unit?: string;
}

/**
 * 前端分頁列。
 *
 * ⚠️ **這個元件只管渲染哪一段，不影響資料範圍。**
 * 統計、搜尋、排序一律在完整資料上做 —— 這是刻意的分工，見
 * `src/api/fetchAll.ts` 開頭關於「後端分頁會讓統計靜默算錯」的說明。
 *
 * 只有一頁時完全不渲染：一個永遠按不動的分頁列只是雜訊。
 */
export function Pagination({ total, page, onChange, pageSize, unit = '' }: Props) {
  const pages = pageCount(total, pageSize);
  if (pages <= 1) {
    return null;
  }

  const current = Math.min(Math.max(page, 1), pages);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  return (
    <nav className="pagination" aria-label="分頁">
      <p className="pagination-summary">
        第 {first}–{last} 筆，共 {total} 筆{unit}
      </p>

      <div className="pagination-controls">
        <button
          type="button"
          className="secondary small"
          disabled={current <= 1}
          onClick={() => onChange(current - 1)}
        >
          上一頁
        </button>

        {/* 頁碼用 select 而非一整排按鈕：頁數多時一排按鈕會撐爆手機版面，
            而這個系統的後台本來就是在手機上看的 */}
        <label className="pagination-page">
          <span className="sr-only">頁碼</span>
          <select
            value={current}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="跳到指定頁"
          >
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                第 {n} 頁
              </option>
            ))}
          </select>
        </label>

        <span className="pagination-total">／ 共 {pages} 頁</span>

        <button
          type="button"
          className="secondary small"
          disabled={current >= pages}
          onClick={() => onChange(current + 1)}
        >
          下一頁
        </button>
      </div>
    </nav>
  );
}
