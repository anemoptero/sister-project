import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminAppointment, AdminOrder } from '../../types/models';
import { CloseAppointmentModal } from './CloseAppointmentModal';

/**
 * 結案的四種處理後果差異很大 —— 未到與取消對優惠券的處理**完全相反**，
 * 而「完成」之後無法退回未完成。誤按的代價高，所以兩段式確認與
 * 「未到時間不可結案」這兩道關卡都必須有測試守著。
 */

function appointment(patch: Partial<AdminAppointment> = {}): AdminAppointment {
  return {
    appointmentId: 'apt_1',
    uid: 'usr_1',
    orderId: 'ord_1',
    status: 'booked',
    startAt: '2026-08-01T14:00:00+08:00',
    endAt: '2026-08-01T15:00:00+08:00',
    occupiedEndAt: '2026-08-01T15:00:00+08:00',
    totalDurationMinutes: 60,
    items: [{ productId: 'prd_1', productName: '臉部保養', durationMinutes: 60 }],
    cancelledAt: '',
    cancelReason: '',
    createdAt: '2026-07-01T10:00:00+08:00',
    ...patch
  };
}

const orders: Record<string, AdminOrder> = {
  apt_1: {
    orderId: 'ord_1',
    appointmentId: 'apt_1',
    uid: 'usr_1',
    itemCount: 1,
    originalAmount: 1800,
    itemDiscountAmount: 0,
    cartDiscountAmount: 0,
    discountAmount: 0,
    finalAmount: 1800,
    cartCouponCode: '',
    status: 'created',
    createdAt: '2026-07-01T10:00:00+08:00',
    cancelledAt: '',
    items: []
  }
};

function renderModal(overrides: Partial<React.ComponentProps<typeof CloseAppointmentModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  render(
    <CloseAppointmentModal
      targets={[appointment()]}
      ordersById={orders}
      futureCount={0}
      busy={false}
      onClose={onClose}
      onConfirm={onConfirm}
      {...overrides}
    />
  );

  return { onConfirm, onClose };
}

describe('兩段式確認', () => {
  it('選了處理方式不會立刻執行，要再確認一次', async () => {
    const { onConfirm } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /完成並收款/ }));

    // 第一次點擊只是進入確認步驟
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/確定要「完成並收款」嗎/)).toBeInTheDocument();
  });

  it('確認之後才真的執行', async () => {
    const { onConfirm } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /完成並收款/ }));
    await userEvent.click(screen.getByRole('button', { name: '確定完成並收款' }));

    expect(onConfirm).toHaveBeenCalledWith('paid');
  });

  it('可以從確認步驟返回而不執行', async () => {
    const { onConfirm } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /客人未到/ }));
    await userEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/這筆預約要如何處理/)).toBeInTheDocument();
  });
});

describe('後果說明', () => {
  it('未到明講優惠券不退回', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: /客人未到/ }));
    expect(screen.getByText(/優惠券也不會退回/)).toBeInTheDocument();
  });

  it('取消明講優惠券會退回，與未到相反', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: /取消預約/ }));
    expect(screen.getByText(/優惠券會退回顧客帳戶/)).toBeInTheDocument();
  });

  it('完成明講按錯了可以退回', async () => {
    // 這裡原本斷言的是「完成之後無法退回未完成」，而那句話與實作不符 ——
    // 後端一直都允許從已完成退回，列表上也有那顆按鈕。文案錯了會讓
    // 管理員不敢按，或以為誤按無法挽回
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: /完成並收款/ }));
    expect(screen.getByText(/退回待結案/)).toBeInTheDocument();
  });

  it('沒有「完成，稍後收款」這個選項 —— 完成即收款', () => {
    // 它會產生「預約已完成、訂單卻待結案」這種兩份狀態對不起來的組合
    renderModal();

    expect(screen.queryByRole('button', { name: /稍後收款/ })).not.toBeInTheDocument();
  });
});

describe('未到預約時間的限制', () => {
  it('尚未開始的預約不可結案', () => {
    renderModal({ futureCount: 1 });

    const complete = screen.getByRole('button', { name: /完成並收款/ });
    expect(complete).toBeDisabled();
    expect(screen.getByText(/這筆預約的時間還沒到，只能取消/)).toBeInTheDocument();
  });

  it('但取消不受限制 —— 否則無效預約會一直算在待收款裡', () => {
    renderModal({ futureCount: 1 });

    expect(screen.getByRole('button', { name: /取消預約/ })).toBeEnabled();
  });

  it('批次時說明有幾筆會被略過', () => {
    renderModal({
      targets: [appointment(), appointment({ appointmentId: 'apt_2' })],
      futureCount: 1
    });

    expect(screen.getByText(/其中 1 筆尚未到預約時間/)).toBeInTheDocument();
  });
});

describe('批次', () => {
  it('標題顯示筆數', () => {
    renderModal({
      targets: [appointment(), appointment({ appointmentId: 'apt_2' })]
    });

    expect(screen.getByText(/這 2 筆預約要如何處理/)).toBeInTheDocument();
  });
});
