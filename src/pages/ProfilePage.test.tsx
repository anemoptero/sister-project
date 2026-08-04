import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '../types/models';

/**
 * 清空欄位被誤判成「沒有任何變更」是實際踩過的坑。
 *
 * 原本的判斷是 `!payload.phone && !payload.displayName` —— 清空後的值是
 * 空字串，falsy，於是被當成「沒填」而中止。使用者確實改了，畫面卻說他
 * 什麼都沒做，從他的角度看就是按鈕壞了。
 */

const callApi = vi.fn();
const updateUser = vi.fn();

vi.mock('../api/client', () => ({
  callApi: (...args: unknown[]) => callApi(...args),
  isApiError: () => false,
  validationField: () => ''
}));

const user: PublicUser = {
  uid: 'usr_1',
  role: 'customer',
  status: 'active',
  displayName: '王小明',
  photoUrl: '',
  phone: '0912345678',
  email: '',
  sourceChannel: 'LINE'
};

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user, profileComplete: true, updateUser })
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()]
}));

async function renderPage() {
  const { default: ProfilePage } = await import('./ProfilePage');
  return render(<ProfilePage />);
}

describe('ProfilePage', () => {
  beforeEach(() => {
    callApi.mockReset();
    callApi.mockResolvedValue({ user, profileComplete: true });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('改了稱呼會送出，且只送有變動的欄位', async () => {
    await renderPage();

    const name = screen.getByLabelText(/稱呼/);
    await userEvent.clear(name);
    await userEvent.type(name, '小明');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(callApi).toHaveBeenCalledWith('updateMyProfile', { displayName: '小明' });
  });

  it('清空稱呼不會被當成「沒有任何變更」', async () => {
    await renderPage();

    await userEvent.clear(screen.getByLabelText(/稱呼/));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    // 關鍵：不可出現「沒有任何變更」—— 使用者確實動了欄位
    expect(screen.queryByText('沒有任何變更。')).not.toBeInTheDocument();
    expect(screen.getByText(/稱呼不能空白/)).toBeInTheDocument();
  });

  it('清空電話顯示「必填」而不是「格式不正確」', async () => {
    await renderPage();

    await userEvent.clear(screen.getByLabelText('聯絡電話'));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(screen.getByText(/電話為必填/)).toBeInTheDocument();
    expect(screen.queryByText(/格式不正確/)).not.toBeInTheDocument();
    // 前端就擋下來了，不必浪費一次 1～14 秒的往返
    expect(callApi).not.toHaveBeenCalled();
  });

  it('什麼都沒改才顯示「沒有任何變更」', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(screen.getByText('沒有任何變更。')).toBeInTheDocument();
    expect(callApi).not.toHaveBeenCalled();
  });
});
