import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import { BarChart } from '../../components/BarChart';
import type { ApiDataOf } from '../../types/api';
import type { StatsGroupBy } from '../../types/models';
import { formatPrice } from '../../utils/format';
import { DateRangeFilter, defaultRange, type DateRange } from './DateRangeFilter';
import { StatTile } from '../../components/StatTile';

type Stats = ApiDataOf<'adminGetSalesStats'>;

const GROUP_LABELS: Record<StatsGroupBy, string> = {
  day: '每日',
  week: '每週',
  month: '每月'
};

export default function AdminStatsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [groupBy, setGroupBy] = useState<StatsGroupBy>('day');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setStats(null);
    try {
      const data = await callApi('adminGetSalesStats', {
        from: range.from,
        to: range.to,
        groupBy
      });
      setStats(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入統計失敗。');
    }
  }, [range, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <h1>銷售統計</h1>

      <DateRangeFilter value={range} onChange={setRange}>
        <div className="field">
          <label htmlFor="stats-group">分組</label>
          <select
            id="stats-group"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as StatsGroupBy)}
          >
            {(Object.keys(GROUP_LABELS) as StatsGroupBy[]).map((value) => (
              <option key={value} value={value}>
                {GROUP_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </DateRangeFilter>

      {error && <p className="error">{error}</p>}

      {stats === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {stats && (
        <>
          {/* 掃描量觸頂代表數字不完整，必須讓管理員知道，
              而不是默默回一個看起來正常但少算的總額 */}
          {stats.truncated && (
            <p className="notice">
              ⚠️ 這個區間的資料量超過單次查詢上限，<strong>以下數字並不完整</strong>。
              請縮小日期範圍後再看。
            </p>
          )}

          {/* 三個金額並列，關係一眼看得出來，不需要另外解釋公式 */}
          <div className="money-row">
            <StatTile
              label="未收"
              value={formatPrice(stats.summary.unpaidSales)}
              hint="已預約，尚未收款"
            />
            <span className="money-op" aria-hidden="true">
              +
            </span>
            <StatTile
              label="已收"
              value={formatPrice(stats.summary.paidSales)}
              hint="已完成並收款"
            />
            <span className="money-op" aria-hidden="true">
              =
            </span>
            <StatTile
              label="應收"
              value={formatPrice(stats.summary.totalSales)}
              hint="不含取消與未到"
              tone="strong"
            />
          </div>

          <div className="stat-row">
            <StatTile label="訂單數" value={String(stats.summary.orderCount)} />
            <StatTile label="預約數" value={String(stats.summary.appointmentCount)} />
            <StatTile label="新客數" value={String(stats.summary.newCustomerCount)} />
          </div>

          <section className="card">
            <h2>{GROUP_LABELS[groupBy]}應收金額</h2>
            <BarChart
              data={stats.items.map((item) => ({
                label: item.label,
                value: item.totalSales,
                detail: `已收 ${formatPrice(item.paidSales)}，${item.orderCount} 筆訂單`
              }))}
              format={formatPrice}
              caption={`${GROUP_LABELS[groupBy]}應收金額，已排除取消與未到的訂單`}
            />
          </section>

          <section className="card">
            <h2>明細</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>期間</th>
                    <th>未收</th>
                    <th>已收</th>
                    <th>應收</th>
                    <th>訂單數</th>
                    <th>預約數</th>
                    <th>新客數</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.items.map((item) => (
                    <tr key={item.label}>
                      <td>{item.label}</td>
                      <td>{formatPrice(item.unpaidSales)}</td>
                      <td>{formatPrice(item.paidSales)}</td>
                      <td>{formatPrice(item.totalSales)}</td>
                      <td>{item.orderCount}</td>
                      <td>{item.appointmentCount}</td>
                      <td>{item.newCustomerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>各療程銷售</h2>

            {stats.byProduct.length === 0 ? (
              <p className="hint">這個區間沒有銷售紀錄。</p>
            ) : (
              <div className="hbar-list">
                {stats.byProduct.map((product) => {
                  const max = Math.max(...stats.byProduct.map((p) => p.totalSales), 1);
                  return (
                    <div className="hbar-row" key={product.productId}>
                      <span className="hbar-label">{product.productName}</span>
                      <span className="hbar-track">
                        <span
                          className="hbar-fill"
                          style={{ width: `${(product.totalSales / max) * 100}%` }}
                        />
                      </span>
                      <span className="hbar-value">
                        {formatPrice(product.totalSales)}
                        <span className="hint"> · {product.quantity} 次</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="hint">
              產品維度的數字來自訂單品項，加總後<strong>不會等於上方的銷售額</strong> ——
              整筆訂單的折抵沒有攤到個別品項上。
            </p>
          </section>

          <p className="hint">
            新客數以「帳號建立時間」落在區間內計算，不是「該區間第一次消費的人」。
            已取消與標記未到的訂單不計入任何一項金額。
          </p>
        </>
      )}
    </div>
  );
}
