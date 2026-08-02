import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { AdminAppointment, AdminOrder } from '../../types/models';
import { formatDateTime, formatPrice } from '../../utils/format';

export type CloseAction = 'paid' | 'unpaid' | 'noShow' | 'cancel';

interface Option {
  action: CloseAction;
  title: string;
  hint: string;
  /** 確認步驟的說明，講清楚按下去會發生什麼 */
  confirm: string;
  danger?: boolean;
}

const OPTIONS: Option[] = [
  {
    action: 'paid',
    title: '完成並收款',
    hint: '服務已完成，款項已收到。最常見的情況。',
    confirm: '這些預約會標記為已完成，訂單標記為已收款。完成之後無法退回未完成。'
  },
  {
    action: 'unpaid',
    title: '完成，稍後收款',
    hint: '服務已完成但還沒收到錢，之後可在列表補認列。',
    confirm: '這些預約會標記為已完成，但訂單維持未收款。完成之後無法退回未完成。'
  },
  {
    action: 'noShow',
    title: '客人未到',
    hint: '訂單作廢不計營收。時段不釋出，優惠券也不退回。',
    confirm: '訂單會作廢並排除在營收之外。時段不會釋出，顧客的優惠券也不會退回。',
    danger: true
  },
  {
    action: 'cancel',
    title: '取消預約',
    hint: '時段釋出、優惠券退回顧客。適合事先告知的情況。',
    confirm: '時段會釋出給其他客人，訂單作廢，使用的優惠券會退回顧客帳戶。無法復原。',
    danger: true
  }
];

interface Props {
  targets: AdminAppointment[];
  ordersById: Record<string, AdminOrder>;
  /** 未過預約時間的筆數。這些不可結案，只能取消 */
  futureCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (action: CloseAction) => void;
}

/**
 * 結案對話框，單筆與批次共用。
 *
 * **選了之後還要再確認一次。** 四個選項的後果差異很大 —— 未到與取消對
 * 優惠券的處理完全相反，而「完成」之後無法退回未完成。直接點下去就執行
 * 太容易誤按，尤其批次操作一次影響多筆。
 */
export function CloseAppointmentModal({
  targets,
  ordersById,
  futureCount,
  busy,
  onClose,
  onConfirm
}: Props) {
  const [selected, setSelected] = useState<Option | null>(null);

  const total = targets.length;
  const amount = targets.reduce(
    (sum, appointment) => sum + (ordersById[appointment.appointmentId]?.finalAmount ?? 0),
    0
  );

  // 尚未到預約時間的不可結案，只能取消
  const closingBlocked = futureCount > 0;

  if (selected) {
    const affected = selected.action === 'cancel' ? total : total - futureCount;

    return (
      <Modal title={`確定要「${selected.title}」嗎？`} busy={busy} onClose={() => setSelected(null)}>
        <p>
          將處理 <strong>{affected}</strong> 筆預約
          {amount > 0 && `，合計 ${formatPrice(amount)}`}。
        </p>
        <p className={selected.danger ? 'notice' : 'hint'}>{selected.confirm}</p>

        {selected.action !== 'cancel' && futureCount > 0 && (
          <p className="hint">
            其中 {futureCount} 筆尚未到預約時間，不會被結案。
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className={selected.danger ? 'danger' : ''}
            disabled={busy || affected === 0}
            onClick={() => onConfirm(selected.action)}
          >
            {busy ? '處理中…' : `確定${selected.title}`}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            返回
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={total === 1 ? '這筆預約要如何處理？' : `這 ${total} 筆預約要如何處理？`}
      busy={busy}
      onClose={onClose}
    >
      {total === 1 && (
        <>
          <p className="confirm-time">{formatDateTime(targets[0].startAt)}</p>
          <p className="hint">
            {targets[0].items.map((item) => item.productName).join('、')}
            {amount > 0 && ` · ${formatPrice(amount)}`}
          </p>
        </>
      )}

      {total > 1 && (
        <p className="hint">合計 {formatPrice(amount)}，將一次處理。</p>
      )}

      {closingBlocked && (
        <p className="notice">
          {total === 1
            ? '這筆預約的時間還沒到，只能取消，不能結案。'
            : `其中 ${futureCount} 筆尚未到預約時間，結案時會略過，取消則不受影響。`}
        </p>
      )}

      <div className="choice-list">
        {OPTIONS.map((option) => {
          // 只有取消不受「時間未到」限制 —— 讓營運人員能隨時清掉無效預約，
          // 否則忘了處理的預約會一直算在待收款裡
          const disabled = option.action !== 'cancel' && total - futureCount === 0;

          return (
            <button
              type="button"
              key={option.action}
              className={`choice${option.danger ? ' choice--danger' : ''}`}
              disabled={busy || disabled}
              onClick={() => setSelected(option)}
            >
              <strong>{option.title}</strong>
              <span className="hint">
                {disabled ? '尚未到預約時間，無法結案' : option.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          先不處理
        </button>
      </div>
    </Modal>
  );
}
