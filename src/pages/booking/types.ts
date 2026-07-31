import type { MyCoupon, Product } from '../../types/models';

/**
 * 預約流程中的一個服務品項。
 *
 * 保留整個 `product` 而不是只存 productId：`expectedProductVersion` 在下單時
 * 是必填的，而且 `PRODUCT_CHANGED` 發生時要拿畫面上的舊值與後端回傳的新值
 * 比對差異 —— 沒有舊值就比不出來。
 */
export interface BookingItem {
  product: Product;
  /** 品項券的 grantId，空字串表示未使用 */
  couponGrantId: string;
}

export function totalDurationOf(items: BookingItem[]): number {
  return items.reduce((sum, item) => sum + item.product.durationMinutes, 0);
}

export function originalAmountOf(items: BookingItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price, 0);
}

/**
 * 這張券是否適用於指定品項。
 *
 * 前端先過濾只是為了不讓顧客選到必定失敗的券 —— **正式判斷一律在後端**，
 * 這裡漏判或誤判都不會造成金額錯誤，只會多一次往返。
 */
export function isCouponEligibleForProduct(coupon: MyCoupon, product: Product): boolean {
  if (coupon.scope !== 'item') return false;
  // 空陣列表示不限產品
  if (coupon.eligibleProductIds.length === 0) return true;
  return coupon.eligibleProductIds.includes(product.productId);
}

/**
 * 這張整單券是否適用於目前的訂單。
 *
 * `minOrderAmount` 以**原價總額**判斷。因為品項券與整單券擇一使用，
 * 帶整單券時不存在品項折抵，原價總額即等於折抵前的小計，不會有歧義。
 */
export function isCartCouponEligible(coupon: MyCoupon, originalAmount: number): boolean {
  if (coupon.scope !== 'cart') return false;
  return originalAmount >= coupon.minOrderAmount;
}

/**
 * 券的星期限制是否符合預約時間。
 *
 * ⚠️ 依**預約開始時間**的星期判斷，不是下單當天 ——
 * 顧客週三預約週六的時段，適用的是週六的規則。
 */
export function matchesWeekday(coupon: MyCoupon, startAt: string): boolean {
  if (coupon.weekdays.length === 0) return true;
  if (!startAt) return true;

  const day = new Date(startAt).getDay();
  return coupon.weekdays.includes(day as MyCoupon['weekdays'][number]);
}
