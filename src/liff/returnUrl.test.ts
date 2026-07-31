import { describe, expect, it } from 'vitest';
import { buildReturnUrl } from './returnUrl';

// GitHub Pages 部署在 /<repo-name>/ 子路徑下，pathname 不是根目錄
const pages = { origin: 'https://anemoptero.github.io', pathname: '/sister-project/' };

describe('buildReturnUrl', () => {
  it('保留 GitHub Pages 的子路徑', () => {
    expect(buildReturnUrl('/', '', pages)).toBe(
      'https://anemoptero.github.io/sister-project/#/login'
    );
  });

  it('把目的地寫進網址，讓它跨過整頁跳轉存活', () => {
    expect(buildReturnUrl('/booking', '', pages)).toBe(
      'https://anemoptero.github.io/sister-project/#/login?from=%2Fbooking'
    );
  });

  it('目的地為首頁時不寫進網址', () => {
    expect(buildReturnUrl('/', '', pages)).not.toContain('from=');
  });

  it('帶上來源渠道供首次登入記錄', () => {
    const url = buildReturnUrl('/products', 'LINE官方帳號', pages);
    expect(url).toContain('from=%2Fproducts');
    expect(url).toContain('src=LINE');
  });

  it('目的地含查詢字串時完整編碼，不會截斷', () => {
    // 沒編碼的話 `?` 與 `&` 會被當成外層網址的分隔符，
    // 回來時 from 只剩前半段
    const url = buildReturnUrl('/products?category=face&sort=price', '', pages);

    expect(url).toContain('from=%2Fproducts%3Fcategory%3Dface%26sort%3Dprice');

    const returned = new URLSearchParams(url.split('?')[1]);
    expect(returned.get('from')).toBe('/products?category=face&sort=price');
  });

  it('在根目錄部署時也正確', () => {
    expect(buildReturnUrl('/my/orders', '', { origin: 'https://example.com', pathname: '/' })).toBe(
      'https://example.com/#/login?from=%2Fmy%2Forders'
    );
  });
});
