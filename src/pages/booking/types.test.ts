import { describe, expect, it } from 'vitest';
import type { MyCoupon, Product } from '../../types/models';
import {
  isCartCouponEligible,
  isCouponEligibleForProduct,
  matchesWeekday,
  originalAmountOf,
  totalDurationOf,
  type BookingItem
} from './types';

function product(patch: Partial<Product> = {}): Product {
  return {
    productId: 'prd_1',
    name: '臉部保養',
    description: '',
    price: 1800,
    durationMinutes: 90,
    imageUrl: '',
    imageAlt: '',
    enabled: true,
    displayOrder: 0,
    version: 1,
    ...patch
  };
}

function coupon(patch: Partial<MyCoupon> = {}): MyCoupon {
  return {
    grantId: 'grt_1',
    couponId: 'cpn_1',
    name: '體驗券',
    type: 'experience',
    scope: 'item',
    discountAmount: 0,
    eligibleProductIds: [],
    minOrderAmount: 0,
    weekdays: [],
    firstPurchaseOnly: false,
    expiresAt: '',
    usedAt: '',
    revokedAt: '',
    validityState: 'ok',
    usable: true,
    ...patch
  };
}

const items: BookingItem[] = [
  { product: product({ productId: 'prd_1', price: 1800, durationMinutes: 90 }), couponGrantId: '' },
  { product: product({ productId: 'prd_2', price: 1200, durationMinutes: 60 }), couponGrantId: '' }
];

describe('總時長與原價', () => {
  it('加總所有品項', () => {
    expect(totalDurationOf(items)).toBe(150);
    expect(originalAmountOf(items)).toBe(3000);
  });

  it('沒有品項時為 0，不會是 NaN', () => {
    expect(totalDurationOf([])).toBe(0);
    expect(originalAmountOf([])).toBe(0);
  });
});

describe('品項券適用判斷', () => {
  it('空的適用清單表示不限產品', () => {
    expect(isCouponEligibleForProduct(coupon({ eligibleProductIds: [] }), product())).toBe(true);
  });

  it('清單有列到才適用', () => {
    const c = coupon({ eligibleProductIds: ['prd_2'] });

    expect(isCouponEligibleForProduct(c, product({ productId: 'prd_1' }))).toBe(false);
    expect(isCouponEligibleForProduct(c, product({ productId: 'prd_2' }))).toBe(true);
  });

  it('整單券不會出現在品項券的候選中', () => {
    expect(isCouponEligibleForProduct(coupon({ scope: 'cart' }), product())).toBe(false);
  });
});

describe('整單券適用判斷', () => {
  it('未達滿額門檻不適用', () => {
    const c = coupon({ scope: 'cart', minOrderAmount: 3000 });

    expect(isCartCouponEligible(c, 2999)).toBe(false);
    expect(isCartCouponEligible(c, 3000)).toBe(true);
  });

  it('品項券不會出現在整單券的候選中', () => {
    expect(isCartCouponEligible(coupon({ scope: 'item' }), 99_999)).toBe(false);
  });
});

describe('星期限制', () => {
  // 2026-08-01 是週六（getDay 6）
  const saturday = '2026-08-01T14:00:00+08:00';
  const monday = '2026-08-03T14:00:00+08:00';

  it('空陣列表示不限', () => {
    expect(matchesWeekday(coupon({ weekdays: [] }), monday)).toBe(true);
  });

  it('依預約時間的星期判斷，不是下單當天', () => {
    const weekendOnly = coupon({ weekdays: [0, 6] });

    expect(matchesWeekday(weekendOnly, saturday)).toBe(true);
    expect(matchesWeekday(weekendOnly, monday)).toBe(false);
  });

  it('尚未選時間時不預先排除 —— 否則顧客會以為自己沒有券', () => {
    expect(matchesWeekday(coupon({ weekdays: [0] }), '')).toBe(true);
  });
});
