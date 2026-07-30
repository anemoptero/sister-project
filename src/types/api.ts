/**
 * API 信封格式與 action 對應表。
 *
 * 對應文件：
 *   docs/API_SPEC.md §3 Request Schema、§4 Response Schema、§5 Error Code、§11 權限表
 *
 * `ApiActionMap` 是本檔的核心：把每個 action 對應到它的 payload 與 data 型別，
 * `callApi('listProducts', {})` 就能自動推導出回傳是 `{ products: Product[] }`。
 * 打錯 action 名稱、payload 缺欄位、把回傳當成別的形狀用，都會在 `tsc` 階段擋下。
 *
 * ⚠️ 新增 API 時必須同步四個地方：`src/router.js` 的 `getRoutes_()`、
 * `API_SPEC.md` §11 權限表、本檔的 `ApiActionMap`，以及對應的 handler。
 */

import type {
  AdminAppointment,
  AdminCustomer,
  AdminOrder,
  Appointment,
  AvailableDay,
  BusinessHours,
  Campaign,
  Coupon,
  CouponGrantType,
  CouponScope,
  CouponType,
  CouponValidityType,
  CustomerStats,
  Grant,
  MyCoupon,
  Order,
  OrderPricing,
  PreviewOrderItem,
  Product,
  ProductStats,
  PublicUser,
  SalesStatsBucket,
  StatsGroupBy,
  UserRole,
  UserStatus,
  Weekday,
  WeeklyBusinessHour
} from './models';

// ---------------------------------------------------------------------------
// 信封
// ---------------------------------------------------------------------------

export interface ApiRequest<P = unknown> {
  action: string;
  requestId: string;
  sessionToken?: string;
  payload: P;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId?: string;
}

export interface ApiFailure {
  ok: false;
  errorCode: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// Error Code
// ---------------------------------------------------------------------------

/**
 * 與 `src/utils.js` 的 `ERROR_CODES` 一一對應。
 *
 * ⚠️ Apps Script 以 `ContentService` 回應時**無法自訂 HTTP status**，
 * 一律回 200。成敗只能看 body 的 `ok`，絕不可依賴 `response.ok`。
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PRODUCT_DISABLED: 'PRODUCT_DISABLED',
  PRODUCT_CHANGED: 'PRODUCT_CHANGED',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  SLOT_FULL: 'SLOT_FULL',
  APPOINTMENT_INVALID: 'APPOINTMENT_INVALID',
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_DISABLED: 'COUPON_DISABLED',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_NOT_ELIGIBLE: 'COUPON_NOT_ELIGIBLE',
  COUPON_USAGE_EXCEEDED: 'COUPON_USAGE_EXCEEDED',
  ORDER_INVALID: 'ORDER_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 網路層失敗時由 client 自行產生的錯誤碼。
 * 後端不會回傳這個 —— 它代表請求根本沒送達或回應無法解析。
 */
export const NETWORK_ERROR = 'NETWORK_ERROR';

// ---------------------------------------------------------------------------
// 特定錯誤碼的 details
// ---------------------------------------------------------------------------

/**
 * `PRODUCT_CHANGED` 的 details。
 *
 * 後端只回傳**當前完整產品**，不提供變動欄位清單 —— 那需要保存產品歷史。
 * 前端本來就持有舊資料，由前端比對最省。
 *
 * 見 `docs/API_SPEC.md` §5.1。
 */
export interface ProductChangedDetails {
  expectedVersion: number;
  currentVersion: number;
  product: Product;
}

/** `SLOT_UNAVAILABLE` 的 details。`message` 本身已含時間，可直接顯示 */
export interface SlotUnavailableDetails {
  reason: string;
  requestedStartAt: string;
  requestedEndAt: string;
  occupiedEndAt: string;
  /** 是哪一格衝突 */
  conflictSlotStartAt: string;
}

/** `VALIDATION_ERROR` 的 details，指出是哪個欄位 */
export interface ValidationErrorDetails {
  field?: string;
}

// ---------------------------------------------------------------------------
// 共用 payload 片段
// ---------------------------------------------------------------------------

export interface PagedPayload {
  limit?: number;
  cursor?: number | null;
}

export interface PagedData {
  nextCursor: number | null;
}

export interface DateRangePayload {
  from: string;
  to: string;
}

/** 下單品項。`expectedProductVersion` 在 createOrder 為必填 */
export interface OrderItemInput {
  productId: string;
  expectedProductVersion?: number;
  /** 品項券。與 `cartCouponGrantId` **擇一**，同時帶會被擋下 */
  couponGrantId?: string;
}

// ---------------------------------------------------------------------------
// Action 對應表
// ---------------------------------------------------------------------------

export interface ApiActionMap {
  // --- 公開 ---
  ping: {
    payload: Record<string, never>;
    data: { message: string; serverTime: string };
  };
  loginWithLine: {
    payload: {
      lineIdToken: string;
      sourceChannel?: string;
      profile?: { displayName?: string; pictureUrl?: string };
    };
    data: {
      sessionToken: string;
      expiresAt: string;
      user: PublicUser;
      /** false 時需導向補資料流程，否則下單會被擋 */
      profileComplete: boolean;
      isNewAccount: boolean;
    };
  };
  listAvailableTimes: {
    payload: {
      /** 必須先算好服務組合的總時長，所以流程是「先選服務 → 再看時間」 */
      totalDurationMinutes: number;
      fromDate?: string;
      days?: number;
    };
    data: {
      resourceCount: number;
      bufferMinutes: number;
      slotStepMinutes: number;
      days: AvailableDay[];
    };
  };

  // --- 公開，但行為隨身分改變 ---
  listProducts: {
    /** 非 admin 傳 includeDisabled 會被靜默忽略，不報錯 */
    payload: { includeDisabled?: boolean };
    data: { products: Product[] };
  };

  // --- 需登入 ---
  logout: {
    payload: Record<string, never>;
    data: { loggedOut: boolean };
  };
  getCurrentUser: {
    payload: Record<string, never>;
    data: { user: PublicUser; profileComplete: boolean };
  };
  updateMyProfile: {
    /** 兩者皆選填，但至少要有一個 */
    payload: { phone?: string; displayName?: string };
    data: { user: PublicUser; profileComplete: boolean };
  };
  createAppointment: {
    payload: { startAt: string; items: OrderItemInput[]; sourceChannel?: string };
    data: { appointmentId: string; appointment: Appointment };
  };
  cancelAppointment: {
    payload: { appointmentId: string; reason?: string };
    data: { appointmentId: string; status: 'cancelled' };
  };
  listMyAppointments: {
    payload: { status?: string };
    data: { appointments: Appointment[] };
  };
  previewOrder: {
    payload: {
      startAt: string;
      items: OrderItemInput[];
      /** 整單券。與 items[].couponGrantId **擇一** */
      cartCouponGrantId?: string;
    };
    data: {
      startAt: string;
      totalDurationMinutes: number;
      pricing: OrderPricing;
      items: PreviewOrderItem[];
      cartCouponGrantId: string;
      cartCouponName: string;
    };
  };
  createOrder: {
    payload: {
      startAt: string;
      /** 此處 expectedProductVersion **每項必填** —— 涉及金額 */
      items: OrderItemInput[];
      cartCouponGrantId?: string;
      sourceChannel?: string;
    };
    data: { appointment: Appointment; order: Order };
  };
  listMyOrders: {
    payload: Record<string, never>;
    data: { orders: Order[] };
  };
  listMyCoupons: {
    payload: { includeUsed?: boolean; includeExpired?: boolean };
    data: { coupons: MyCoupon[] };
  };
  claimCoupon: {
    payload: { claimToken: string };
    data: { grantId: string; name: string; expiresAt: string };
  };

  // --- 管理員：產品 ---
  adminCreateProduct: {
    payload: {
      name: string;
      description?: string;
      price: number;
      durationMinutes: number;
      /** 必須是 https —— http 圖片會被瀏覽器以混合內容擋掉 */
      imageUrl?: string;
      imageAlt?: string;
      enabled?: boolean;
      displayOrder?: number;
    };
    data: { productId: string };
  };
  adminUpdateProduct: {
    /** 部分更新。`expectedVersion` 必填，是樂觀鎖的依據 */
    payload: {
      productId: string;
      expectedVersion: number;
      name?: string;
      description?: string;
      price?: number;
      durationMinutes?: number;
      imageUrl?: string;
      imageAlt?: string;
      enabled?: boolean;
      displayOrder?: number;
    };
    data: { productId: string; updated: boolean; version?: number };
  };
  adminSetProductEnabled: {
    payload: { productId: string; enabled: boolean };
    data: { productId: string; enabled: boolean };
  };

  // --- 管理員：營業時間 ---
  adminGetBusinessHours: {
    payload: Record<string, never>;
    data: { businessHours: BusinessHours };
  };
  adminSetBusinessHours: {
    payload: {
      /** 必須恰好 7 筆 */
      weekly: WeeklyBusinessHour[];
      resourceCount?: number;
      bufferMinutes?: number;
      slotStepMinutes?: number;
      minAdvanceHours?: number;
      maxAdvanceDays?: number;
    };
    data: { updated: boolean; businessHours: BusinessHours };
  };
  adminSetDayOverride: {
    payload: {
      /** `YYYY-MM-DD` */
      date: string;
      closed?: boolean;
      openTime?: string;
      closeTime?: string;
      note?: string;
      /** 清除例外，恢復週循環 */
      clear?: boolean;
    };
    /** 改成公休**不會**自動取消既有預約，只回報筆數供人工處理 */
    data: { date: string; closed?: boolean; existingAppointmentCount?: number };
  };

  // --- 管理員：優惠券定義 ---
  adminCreateCoupon: {
    payload: {
      code: string;
      name: string;
      type: CouponType;
      scope?: CouponScope;
      /** 必填，沒有「永久有效」的選項 */
      validityType: CouponValidityType;
      /** validityType = absolute 時必填 */
      validFrom?: string;
      validTo?: string;
      /** validityType = relative 時必填 */
      validityDays?: number;
      /** type = discount 時必填，>= 1 */
      discountAmount?: number;
      /** 只對 scope = item 生效 */
      eligibleProductIds?: string[];
      /** 只對 scope = cart 生效 */
      minOrderAmount?: number;
      weekdays?: Weekday[];
      firstPurchaseOnly?: boolean;
      maxGrantsPerUser?: number;
      enabled?: boolean;
    };
    data: { couponId: string };
  };
  adminUpdateCoupon: {
    /** 不可修改 code / type / scope —— 改了會讓歷史帳目失去意義 */
    payload: { couponId: string } & Partial<
      Omit<ApiActionMap['adminCreateCoupon']['payload'], 'code' | 'type' | 'scope'>
    >;
    data: { couponId: string; updated: boolean };
  };
  adminSetCouponEnabled: {
    payload: { couponId: string; enabled: boolean };
    data: { couponId: string; enabled: boolean };
  };
  adminListCoupons: {
    payload: PagedPayload & { enabled?: boolean };
    data: PagedData & { coupons: (Coupon & { campaignCount?: number })[] };
  };

  // --- 管理員：發放活動 ---
  adminCreateCampaign: {
    payload: {
      couponId: string;
      name: string;
      grantType: CouponGrantType;
      startAt?: string | null;
      /** 未設即為長期活動 */
      endAt?: string | null;
      /** 0 表示不限 */
      maxGrants?: number;
      maxTotalUsage?: number;
      /** grantType = claim 時必填且全系統唯一 */
      claimToken?: string;
      /** grantType = auto 時必填，第一階段只支援 'signup' */
      autoTrigger?: string;
      enabled?: boolean;
    };
    data: { campaignId: string };
  };
  adminUpdateCampaign: {
    payload: { campaignId: string } & Partial<
      ApiActionMap['adminCreateCampaign']['payload']
    >;
    data: { campaignId: string; updated: boolean };
  };
  adminListCampaigns: {
    payload: PagedPayload & { couponId?: string; enabled?: boolean };
    data: PagedData & { campaigns: Campaign[] };
  };
  adminGrantCoupon: {
    /** uids 最多 400 筆 —— Firestore 單次 commit 上限 500，留餘裕給活動計數 */
    payload: { campaignId: string; uids: string[]; note?: string };
    /** 已達 maxGrantsPerUser 的使用者會被**跳過而非整批失敗** */
    data: { granted: number; skipped: string[]; grantIds: string[] };
  };
  adminListGrants: {
    payload: PagedPayload & { campaignId?: string; uid?: string };
    data: PagedData & { grants: Grant[] };
  };
  adminRevokeGrant: {
    /** 已使用的 grant 不可收回，那要走訂單取消流程 */
    payload: { grantId: string };
    data: { grantId: string; revoked: boolean; changed: boolean };
  };

  // --- 管理員：統計與會員 ---
  adminGetSalesStats: {
    payload: DateRangePayload & { groupBy?: StatsGroupBy };
    data: {
      range: { from: string; to: string };
      groupBy: StatsGroupBy;
      summary: {
        totalSales: number;
        orderCount: number;
        appointmentCount: number;
        newCustomerCount: number;
      };
      items: SalesStatsBucket[];
      byProduct: ProductStats[];
      /** true 表示掃描量觸頂、數字不完整，**必須提示管理員** */
      truncated: boolean;
    };
  };
  adminListOrders: {
    payload: Partial<DateRangePayload> & PagedPayload & { status?: string };
    data: PagedData & { orders: AdminOrder[] };
  };
  adminListAppointments: {
    payload: Partial<DateRangePayload> & PagedPayload & { status?: string };
    data: PagedData & { appointments: AdminAppointment[] };
  };
  adminListCustomers: {
    payload: PagedPayload & {
      keyword?: string;
      sourceChannel?: string;
      /** 受白名單限制，任意欄位排序會需要對應索引 */
      sortBy?: 'createdAt' | 'totalPaidAmount' | 'totalOrderCount' | 'lastOrderAt';
    };
    data: PagedData & { customers: AdminCustomer[] };
  };
  adminGetCustomerDetail: {
    payload: { uid: string };
    data: {
      user: AdminCustomer;
      /** 從 orders 實算的權威數字 */
      stats: CustomerStats;
      /** users 上的去正規化欄位。與 stats 不一致代表統計更新曾失敗 */
      denormalized: {
        totalOrderCount: number;
        totalPaidAmount: number;
        lastOrderAt: string;
      };
      orders: Order[];
      appointments: Appointment[];
      /** 持有券，含已使用與已過期 */
      coupons: (Grant & { name?: string; status?: string })[];
    };
  };
  adminUpdateCustomer: {
    /** 不可停用自己 */
    payload: {
      uid: string;
      phone?: string;
      note?: string;
      sourceChannel?: string;
      status?: UserStatus;
    };
    data: { uid: string; updated: boolean };
  };
  adminSetUserRole: {
    payload: { uid: string; role: UserRole };
    data: { uid: string; role: UserRole; changed: boolean };
  };
}

export type ApiAction = keyof ApiActionMap;
export type ApiPayloadOf<A extends ApiAction> = ApiActionMap[A]['payload'];
export type ApiDataOf<A extends ApiAction> = ApiActionMap[A]['data'];
