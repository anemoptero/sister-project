/**
 * 尚未實作的頁面。
 *
 * 路由表在 A 段就完整建立，好讓導覽、守衛與 RWD 外框能一次驗證到位；
 * 各頁的實際內容依 DEV_PLAN Phase 9 的 D / E / F 順序陸續替換。
 *
 * 刻意標示所屬階段，避免日後看到空頁面時分不清是「還沒做」還是「壞了」。
 */
export default function PlaceholderPage({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="hint">此頁面尚未實作，預計於 {stage} 完成。</p>
    </div>
  );
}
