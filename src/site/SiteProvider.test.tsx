import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteProvider, type SiteSettings } from './SiteProvider';
import { useSite } from './useSite';

/**
 * 網站設定的預覽與已儲存值必須分開。
 *
 * 曾經只有 site 一個值，後台編輯時就地覆蓋它，造成三個連鎖問題：
 * dirty 永遠是 false（比較的兩邊是同一個物件）、未儲存的設定被寫進
 * localStorage 跟著使用者跑到其他頁面、背景重新取回時會用舊值覆蓋掉
 * 另一位管理員剛儲存的內容。這些用純函式測不到 —— 它們是 Provider 的
 * 狀態機。
 */

const mockCallApi = vi.hoisted(() => vi.fn());

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, callApi: mockCallApi };
});

const CACHE_KEY = 'sister.site';

function serverSite(patch: Partial<SiteSettings> = {}): SiteSettings {
  return {
    siteName: '後端存的店名',
    logoUrl: '',
    tagline: '',
    description: '',
    contactPhone: '',
    contactAddress: '',
    lineUrl: '',
    businessNote: '',
    theme: 'sand',
    backgroundType: 'none',
    backgroundImageUrl: '',
    backgroundGradient: '',
    backgroundOverlay: 82,
    configured: true,
    ...patch
  };
}

/** 把 context 攤平成畫面上可讀的文字，並提供觸發預覽的按鈕 */
function Probe() {
  const { site, savedSite, previewSite, setSite } = useSite();
  return (
    <div>
      <span data-testid="site">{site.siteName}</span>
      <span data-testid="saved">{savedSite.siteName}</span>
      <button type="button" onClick={() => previewSite({ ...savedSite, siteName: '編輯中' })}>
        預覽
      </button>
      <button type="button" onClick={() => previewSite(null)}>
        取消預覽
      </button>
      <button type="button" onClick={() => setSite({ ...savedSite, siteName: '已儲存' })}>
        儲存
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <SiteProvider>
      <Probe />
    </SiteProvider>
  );
}

describe('SiteProvider 的預覽與已儲存值', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCallApi.mockReset();
    mockCallApi.mockResolvedValue({ site: serverSite() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('預覽只改變畫面套用的值，不動已儲存值', async () => {
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('saved')).toHaveTextContent('後端存的店名'));

    await user.click(screen.getByRole('button', { name: '預覽' }));

    expect(screen.getByTestId('site')).toHaveTextContent('編輯中');
    // 這一項是關鍵：savedSite 若跟著變，dirty 就永遠算不出來
    expect(screen.getByTestId('saved')).toHaveTextContent('後端存的店名');
  });

  it('預覽不寫入 localStorage —— 否則未儲存的設定會跟著跑到其他頁面', async () => {
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('saved')).toHaveTextContent('後端存的店名'));

    const cachedBefore = window.localStorage.getItem(CACHE_KEY);
    await user.click(screen.getByRole('button', { name: '預覽' }));

    expect(window.localStorage.getItem(CACHE_KEY)).toBe(cachedBefore);
    expect(window.localStorage.getItem(CACHE_KEY) ?? '').not.toContain('編輯中');
  });

  it('取消預覽會退回已儲存值', async () => {
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('saved')).toHaveTextContent('後端存的店名'));

    await user.click(screen.getByRole('button', { name: '預覽' }));
    await user.click(screen.getByRole('button', { name: '取消預覽' }));

    expect(screen.getByTestId('site')).toHaveTextContent('後端存的店名');
  });

  it('儲存會寫入快取、更新已儲存值，並清掉預覽', async () => {
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('saved')).toHaveTextContent('後端存的店名'));

    await user.click(screen.getByRole('button', { name: '預覽' }));
    await user.click(screen.getByRole('button', { name: '儲存' }));

    expect(screen.getByTestId('saved')).toHaveTextContent('已儲存');
    // 預覽沒清掉的話，畫面會停在「編輯中」而不是剛存進去的值
    expect(screen.getByTestId('site')).toHaveTextContent('已儲存');
    expect(window.localStorage.getItem(CACHE_KEY) ?? '').toContain('已儲存');
  });
});
