import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyCoupon, Product } from '../../types/models';
import type { BookingItem } from './types';
import { StepConfirm } from './StepConfirm';

/**
 * 確認頁是整個系統風險最高的畫面：金額、優惠券擇一、療程變更確認、
 * 送出前的把關全部集中在這裡。任何一項判斷寫錯都會直接產生客訴，
 * 而這些邏輯用純函式測不到 —— 它們是元件的狀態機。
 */

const mockCallApi = vi.hoisted(() => vi.fn());

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return { ...actual, callApi: mockCallApi };
});

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
    grantId: 'grt_item',
    couponId: 'cpn_1',
    name: '體驗券',
    type: 'experience',
    scope: 'item',
    discountAmount: 0,
    eligibleProductIds: [],
    minOrderAmount: 0,
    weekdays: [],
    firstPurchaseOnly: false,
    expiresAt: '2099-01-01T00:00:00+08:00',
    usedAt: '',
    revokedAt: '',
    validityState: 'ok',
    usable: true,
    ...patch
  };
}

const START_AT = '2099-08-01T14:00:00+08:00';

const defaultPreview = {
  startAt: START_AT,
  totalDurationMinutes: 90,
  pricing: {
    originalAmount: 1800,
    itemDiscountAmount: 0,
    cartDiscountAmount: 0,
    discountAmount: 0,
    finalAmount: 1800
  },
  items: [
    {
      productId: 'prd_1',
      productName: '臉部保養',
      productPrice: 1800,
      couponGrantId: '',
      couponName: '',
      discountAmount: 0,
      lineFinalAmount: 1800
    }
  ],
  cartCouponGrantId: '',
  cartCouponName: ''
};

interface Options {
  items?: BookingItem[];
  cartCouponGrantId?: string;
  coupons?: MyCoupon[];
  changes?: React.ComponentProps<typeof StepConfirm>['changes'];
  previewError?: Error;
}

function renderConfirm(options: Options = {}) {
  const items = options.items ?? [{ product: product(), couponGrantId: '' }];
  const handlers = {
    onSetItemCoupon: vi.fn(),
    onSetCartCoupon: vi.fn(),
    onAcknowledgeChanges: vi.fn(),
    onChangeTime: vi.fn(),
    onChangeServices: vi.fn(),
    onProductUpdated: vi.fn(),
    onDone: vi.fn()
  };

  mockCallApi.mockImplementation((action: string) => {
    if (action === 'listMyCoupons') {
      return Promise.resolve({ coupons: options.coupons ?? [] });
    }
    if (action === 'previewOrder') {
      return options.previewError
        ? Promise.reject(options.previewError)
        : Promise.resolve(defaultPreview);
    }
    return Promise.resolve({});
  });

  render(
    <StepConfirm
      items={items}
      startAt={START_AT}
      cartCouponGrantId={options.cartCouponGrantId ?? ''}
      changes={options.changes ?? []}
      {...handlers}
    />
  );

  return handlers;
}

beforeEach(() => {
  mockCallApi.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('金額呈現', () => {
  it('試算完成後顯示應付金額', async () => {
    renderConfirm();

    await waitFor(() => {
      expect(screen.getAllByText('NT$ 1,800').length).toBeGreaterThan(0);
    });
  });

  it('試算失敗時顯示「—」而不是永遠停在計算中', async () => {
    // 曾經把「沒有結果」當成「計算中」，導致選到不適用的券之後金額永遠轉圈
    const err = Object.assign(new Error('此優惠券限首次消費使用'), {
      name: 'ApiError',
      errorCode: 'COUPON_NOT_ELIGIBLE'
    });
    renderConfirm({ previewError: err });

    await waitFor(() => {
      expect(screen.getByText('請先調整優惠券')).toBeInTheDocument();
    });
    expect(screen.queryByText('計算中…')).not.toBeInTheDocument();
  });
});

describe('優惠券擇一規則', () => {
  it('選了整單券之後品項券選單被停用', async () => {
    renderConfirm({
      cartCouponGrantId: 'grt_cart',
      coupons: [
        coupon({ grantId: 'grt_item', scope: 'item' }),
        coupon({ grantId: 'grt_cart', scope: 'cart', name: '折 300', type: 'discount', discountAmount: 300 })
      ]
    });

    const itemSelect = await screen.findByLabelText('臉部保養的優惠券');
    expect(itemSelect).toBeDisabled();
  });

  it('選了品項券之後整單券選單被停用', async () => {
    renderConfirm({
      items: [{ product: product(), couponGrantId: 'grt_item' }],
      coupons: [
        coupon({ grantId: 'grt_item', scope: 'item' }),
        coupon({ grantId: 'grt_cart', scope: 'cart', name: '折 300', type: 'discount', discountAmount: 300 })
      ]
    });

    await waitFor(() => {
      expect(screen.getByLabelText('整筆訂單折抵')).toBeDisabled();
    });
  });

  it('同一張券不會同時出現在兩個品項的選單裡', async () => {
    renderConfirm({
      items: [
        { product: product({ productId: 'prd_1', name: 'A' }), couponGrantId: 'grt_item' },
        { product: product({ productId: 'prd_2', name: 'B' }), couponGrantId: '' }
      ],
      coupons: [coupon({ grantId: 'grt_item' })]
    });

    const second = await screen.findByLabelText('B的優惠券');
    // 已被 A 選走，B 的選單裡不該還有它
    expect(second.querySelectorAll('option')).toHaveLength(1);
  });

  it('星期限定的券在不符的預約日不會出現', async () => {
    // 2099-08-01 是週六（getDay 6），這張券只限週一
    renderConfirm({ coupons: [coupon({ weekdays: [1] })] });

    const select = await screen.findByLabelText('臉部保養的優惠券');
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });
});

describe('療程變更的把關', () => {
  const changes = [
    { before: product({ price: 1800, durationMinutes: 90 }), after: product({ price: 2200, durationMinutes: 120, version: 2 }) }
  ];

  it('未確認變更前不可送出', async () => {
    renderConfirm({ changes });

    const submit = await screen.findByRole('button', { name: '請先確認上方變更' });
    expect(submit).toBeDisabled();
  });

  it('列出實際變動的欄位，而不是只說「已更新」', async () => {
    renderConfirm({ changes });

    // 限定在差異表內查詢：金額也會出現在下方的試算區，
    // 不限定範圍就分不出「差異表有列出來」與「頁面某處剛好有這個數字」
    const diff = within(await screen.findByRole('table'));

    expect(diff.getByText('NT$ 1,800')).toBeInTheDocument();
    expect(diff.getByText('NT$ 2,200')).toBeInTheDocument();
    expect(diff.getByText('1 小時 30 分')).toBeInTheDocument();
    expect(diff.getByText('2 小時')).toBeInTheDocument();
  });

  it('按下確認後通知上層清除變更', async () => {
    const handlers = renderConfirm({ changes });

    await userEvent.click(await screen.findByRole('button', { name: '我已確認以上變更' }));
    expect(handlers.onAcknowledgeChanges).toHaveBeenCalledOnce();
  });
});

describe('送出', () => {
  it('帶上每個品項的 expectedProductVersion —— 沒有它會產生金額爭議', async () => {
    renderConfirm({ items: [{ product: product({ version: 7 }), couponGrantId: '' }] });

    await waitFor(() => expect(screen.getByRole('button', { name: '確認預約' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '確認預約' }));

    await waitFor(() => {
      const call = mockCallApi.mock.calls.find((c) => c[0] === 'createOrder');
      expect(call?.[1].items[0].expectedProductVersion).toBe(7);
    });
  });
});
