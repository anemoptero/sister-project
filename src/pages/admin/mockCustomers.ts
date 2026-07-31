import type { AdminCustomer } from '../../types/models';

/**
 * 版面預覽用的假會員。
 *
 * 用途只有一個：檢查會員多的時候選單長什麼樣、捲不捲得動、搜尋好不好用。
 *
 * **刻意不寫進 Firestore。** 假帳號一旦建立就會永久留在 `adminListCustomers`，
 * 而且 `adminGetSalesStats` 的新客數是以 `users.createdAt` 落在區間內計算的 ——
 * 假資料會直接汙染第一階段要交付的客戶統計，事後還得逐筆手動清除。
 *
 * 為了確保它們絕不會被送到後端，uid 一律加上 `mock_` 前綴，
 * 發放前會被過濾掉（見 `MOCK_UID_PREFIX` 的使用處）。
 */

export const MOCK_UID_PREFIX = 'mock_';

const SURNAMES = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭'];
const GIVEN_NAMES = [
  '雅婷', '怡君', '淑芬', '美玲', '佳穎', '思妤', '欣怡', '詩涵',
  '志明', '俊傑', '建宏', '家豪', '冠廷', '柏翰', '宗翰', '承恩'
];

export function isMockUid(uid: string): boolean {
  return uid.startsWith(MOCK_UID_PREFIX);
}

/**
 * 產生指定筆數的假會員。
 *
 * 以索引決定內容而非亂數 —— 每次重繪都要得到相同的清單，
 * 否則捲到一半重繪就換了一批人，根本沒辦法看版面。
 */
export function makeMockCustomers(count: number): AdminCustomer[] {
  const safeCount = Math.max(0, Math.min(500, Math.floor(count)));

  return Array.from({ length: safeCount }, (_, i) => {
    const name = `${SURNAMES[i % SURNAMES.length]}${GIVEN_NAMES[(i * 7) % GIVEN_NAMES.length]}`;
    const phone = `09${String(10_000_000 + i * 137_911).slice(0, 8)}`;

    return {
      uid: `${MOCK_UID_PREFIX}${i + 1}`,
      role: 'customer',
      status: 'active',
      // 同名時補上編號，才分得出是不同的人
      displayName: `${name}${i >= SURNAMES.length * GIVEN_NAMES.length ? ` ${i}` : ''}`,
      phone,
      email: '',
      sourceChannel: i % 3 === 0 ? 'LINE官方帳號' : '',
      note: '',
      totalOrderCount: 0,
      totalPaidAmount: 0,
      lastOrderAt: '',
      lastAppointmentAt: '',
      createdAt: ''
    } satisfies AdminCustomer;
  });
}
