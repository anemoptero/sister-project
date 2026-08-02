/**
 * 單一數字的呈現。
 *
 * 數字用 tabular-nums（見 components.css），切換區間時位數變動不會讓版面左右跳。
 */
export function StatTile({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: string;
  hint?: string;
  /** `strong` 用於該區塊的主要數字，讓視線先落在它上面 */
  tone?: 'strong' | 'muted';
}) {
  return (
    <div className={`stat-tile${tone ? ` stat-tile--${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
