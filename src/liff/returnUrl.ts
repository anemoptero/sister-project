/**
 * 組出 LINE 登入完成後要回到的網址。
 *
 * 獨立成一個純函式是為了能測 —— 這段邏輯出錯的後果很隱晦：
 * 使用者登入成功卻回到首頁，或帶著壞掉的網址回來，
 * 而這只在真實 LINE 環境跳轉過一輪之後才看得出來。
 *
 * 兩個限制決定了寫法：
 *   1. 使用 HashRouter，路由在 `#` 之後
 *   2. `liff.login()` 是整頁跳轉，`location.state` 不會存活，
 *      目的地必須寫進網址本身
 */
export function buildReturnUrl(
  from: string,
  sourceChannel: string,
  location: { origin: string; pathname: string }
): string {
  const params = new URLSearchParams();

  // 首頁是預設值，不需要寫進網址徒增雜訊
  if (from && from !== '/') params.set('from', from);
  if (sourceChannel) params.set('src', sourceChannel);

  const query = params.toString();
  return `${location.origin}${location.pathname}#/login${query ? `?${query}` : ''}`;
}
