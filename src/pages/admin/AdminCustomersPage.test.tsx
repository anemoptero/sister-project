import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCustomer } from '../../types/models';

/**
 * 搜尋必須是純前端的。
 *
 * 原本 `keyword` 直接綁在 input 的 onChange 上，輸入「王小明」會發出三次
 * API、每次 1～14 秒，而且每次都先清空清單讓表格閃回骨架。更糟的是沒有
 * 請求序號控制 —— 較早送出的慢請求可能晚回並覆蓋正確結果。
 *
 * 這裡斷言的重點是「打字時 callApi **沒有**被再次呼叫」。
 */

const callApi = vi.fn();

vi.mock('../../api/client', () => ({
  callApi: (...args: unknown[]) => callApi(...args),
  isApiError: () => false,
  validationField: () => ''
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'usr_admin' } })
}));

function customer(patch: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    uid: 'usr_1',
    role: 'customer',
    status: 'active',
    displayName: '王小明',
    phone: '0912345678',
    email: '',
    sourceChannel: 'LINE',
    note: '',
    totalOrderCount: 3,
    totalPaidAmount: 5400,
    lastOrderAt: '2026-07-20T10:00:00+08:00',
    lastAppointmentAt: '2026-07-20T10:00:00+08:00',
    createdAt: '2026-01-01T10:00:00+08:00',
    ...patch
  };
}

const CUSTOMERS: AdminCustomer[] = [
  customer({ uid: 'usr_1', displayName: '王小明', phone: '0912345678' }),
  customer({ uid: 'usr_2', displayName: '陳美麗', phone: '0922222222' }),
  customer({ uid: 'usr_3', displayName: '🌸🌸🌸', phone: '0933333333', note: '林太太' }),
  customer({ uid: 'usr_4', displayName: '李大同', phone: '0944444444' }),
  customer({ uid: 'usr_5', displayName: '張三', phone: '0955555555' })
];

// 頂層 await import 會在 vi.mock 提升之前解析，必須動態載入
async function renderPage() {
  const { default: AdminCustomersPage } = await import('./AdminCustomersPage');
  return render(<AdminCustomersPage />);
}

describe('AdminCustomersPage 的搜尋與排序', () => {
  beforeEach(() => {
    callApi.mockReset();
    callApi.mockResolvedValue({ customers: CUSTOMERS, nextCursor: null });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('載入時只打一次 API，且不帶 keyword 與 sortBy', async () => {
    await renderPage();

    await screen.findByText('王小明');

    expect(callApi).toHaveBeenCalledTimes(1);
    const [action, payload] = callApi.mock.calls[0] as [string, Record<string, unknown>];
    expect(action).toBe('adminListCustomers');
    expect(payload).not.toHaveProperty('keyword');
    expect(payload).not.toHaveProperty('sortBy');
  });

  it('打字搜尋不會再打 API，畫面只剩符合的筆數', async () => {
    await renderPage();
    await screen.findByText('王小明');
    callApi.mockClear();

    await userEvent.type(screen.getByLabelText('搜尋'), '陳美麗');

    await waitFor(() => {
      expect(screen.queryByText('王小明')).not.toBeInTheDocument();
    });
    expect(screen.getByText('陳美麗')).toBeInTheDocument();
    expect(callApi).not.toHaveBeenCalled();
  });

  it('搜尋也比對備註 —— LINE 名稱是表情符號時只能靠它認人', async () => {
    await renderPage();
    await screen.findByText('王小明');

    await userEvent.type(screen.getByLabelText('搜尋'), '林太太');

    await waitFor(() => {
      expect(screen.queryByText('王小明')).not.toBeInTheDocument();
    });
    expect(screen.getByText('🌸🌸🌸')).toBeInTheDocument();
  });

  it('切換排序不會重新載入', async () => {
    await renderPage();
    await screen.findByText('王小明');
    callApi.mockClear();

    await userEvent.selectOptions(screen.getByLabelText('排序'), 'totalPaidAmount');

    expect(callApi).not.toHaveBeenCalled();
  });

  it('搜尋不到時顯示提示而不是空白表格', async () => {
    await renderPage();
    await screen.findByText('王小明');

    await userEvent.type(screen.getByLabelText('搜尋'), '不存在的人');

    expect(await screen.findByText('沒有符合的會員')).toBeInTheDocument();
  });
});
