/**
 * 只接受純整數字串，其餘一律回 null。
 *
 * **不可用 `parseInt`** —— 它會把 `'1800.5'` 悄悄變成 1800、把 `'18abc'`
 * 變成 18。金額或時長被無聲截斷，比直接報錯危險得多：使用者以為存成 1800.5，
 * 系統記 1800，帳目對不起來時也查不到原因。
 *
 * 後端的 `coerceInt_` 是同樣的規則，兩邊必須一致，否則會出現
 * 「前端擋不下但後端擋下」或反過來的落差。
 *
 * 表單的數字欄位一律以字串保存再用這個函式轉換：`<input type="number">`
 * 清空時值是空字串，直接 `Number('')` 會得到 0 而不是錯誤。
 */
export function parseIntStrict(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  // 超出安全整數範圍時 Number() 會失真，這種值不該被當成有效輸入
  return Number.isSafeInteger(parsed) ? parsed : null;
}
