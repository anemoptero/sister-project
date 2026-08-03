import { useState } from 'react';

export interface BarDatum {
  /** 完整期間。走 aria-label，讓讀螢幕的人拿到的資訊不比看得見的人少 */
  label: string;
  /** 軸上顯示的短格式（例如 07/31）。省略時用 label */
  shortLabel?: string;
  value: number;
  /** 滑過時額外顯示的說明，例如訂單數 */
  detail?: string;
}

interface Props {
  data: BarDatum[];
  format: (value: number) => string;
  /** 圖表本身的說明。單一數列不需要圖例 —— 標題已經指明了它是什麼 */
  caption: string;
}

/**
 * 軸標籤最多顯示幾個。超過就等距取樣，其餘留白。
 *
 * 每根長條都標日期在 30 天檢視下會擠成一團，斜放也只是把「擠在一起」
 * 換成「難以閱讀」。完整日期仍在長條的 aria-label 與下方明細表裡，
 * 沒有任何數值只存在於圖上。
 */
const MAX_LABELS = 12;

/**
 * 單一數列的直條圖。
 *
 * 設計取捨：
 * - **只有一個數列，因此不放圖例** —— 標題已經說明這些長條代表什麼
 * - 顏色用主題的主色（單一色相），不是類別配色。類別配色是用來區分身分的，
 *   這裡每根長條都是同一個量測值在不同時間點，沒有身分之別
 * - 長條不填滿欄位（CSS 限 24px），留白是刻意的 —— 填滿會讓資料點少的時候
 *   看起來像一塊色塊而不是圖表
 * - 只在最大值直接標數字，其餘滑過才顯示 —— 每根都標數字會讓圖變成一張醜表格
 * - 首尾的 tooltip 與軸標籤靠邊對齊，置中會超出繪圖區被裁掉
 * - 長條可用鍵盤聚焦，數值也寫進 aria-label，不是只有滑鼠使用者讀得到
 * - 下方一定附上表格檢視，圖表不是唯一的取得途徑
 */
export function BarChart({ data, format, caption }: Props) {
  const [hovered, setHovered] = useState(-1);

  const max = Math.max(...data.map((d) => d.value), 0);
  const peakIndex = data.findIndex((d) => d.value === max && max > 0);

  if (data.length === 0) {
    return <p className="hint">這個區間沒有資料。</p>;
  }

  const labelStep = Math.ceil(data.length / MAX_LABELS);

  return (
    <figure className="chart">
      <div className="chart-plot" role="img" aria-label={caption}>
        {data.map((datum, index) => {
          // 全部為 0 時不要除以 0，讓長條維持在基線
          const heightPct = max > 0 ? (datum.value / max) * 100 : 0;
          const isPeak = index === peakIndex;
          const isHovered = index === hovered;
          const showLabel = index % labelStep === 0;

          // 繪圖區有 overflow-x: auto，超出左右邊界的浮動內容會被裁掉，
          // 所以首尾改為靠邊對齊而不是以長條為中心
          const edge =
            index === 0 ? ' is-start' : index === data.length - 1 ? ' is-end' : '';

          return (
            <div className="chart-col" key={`${datum.label}-${index}`}>
              {(isHovered || (isPeak && hovered === -1)) && (
                <span className={`chart-tip${isHovered ? ' is-hovered' : ''}${edge}`}>
                  <strong>{format(datum.value)}</strong>
                  {isHovered && datum.detail && (
                    <span className="chart-tip-detail">{datum.detail}</span>
                  )}
                </span>
              )}

              <button
                type="button"
                className={`chart-bar${isPeak ? ' is-peak' : ''}`}
                style={{ height: `${heightPct}%` }}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(-1)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(-1)}
                aria-label={`${datum.label}：${format(datum.value)}${
                  datum.detail ? `，${datum.detail}` : ''
                }`}
              />

              {showLabel && (
                <span className={`chart-label${edge}`} aria-hidden="true">
                  {datum.shortLabel ?? datum.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <figcaption className="hint">{caption}</figcaption>
    </figure>
  );
}
