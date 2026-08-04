/**
 * API 信封格式與 action 對應表。
 *
 * 對應文件：
 *   docs/API_SPEC.md §3 Request Schema、§4 Response Schema、§5 Error Code、§12 權限表
 *
 * `ApiActionMap` 是本檔的核心：把每個 action 對應到它的 payload 與 data 型別，
 * `callApi('listProducts', {})` 就能自動推導出回傳是 `{ products: Product[] }`。
 * 打錯 action 名稱、payload 缺欄位、把回傳當成別的形狀用，都會在 `tsc` 階段擋下。
 *
 * ⚠️ 新增 API 時必須同步四個地方：`src/router.js` 的 `getRoutes_()`、
 * `API_SPEC.md` §12 權限表、本檔的 `ApiActionMap`，以及對應的 handler。
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
  /** 保留未使用：額滿一律回 SLOT_UNAVAILABLE + details.reason = 'SLOT_TAKEN' */
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

/**
 * `SLOT_UNAVAILABLE` 在「還原已取消預約」時的 details。
 *
 * 與 `SlotUnavailableDetails` 是同一個錯誤碼的另一種形狀：這裡沒有
 * `conflictSlotStartAt`，改帶 `conflicts` 指出被誰擋住，管理員才能去協調改期。
 */
export interface ReopenConflictDetails {
  reason: string;
  requestedStartAt: string;
  occupiedEndAt: string;
  /** 當前設定值，不是預約成立當時的值 */
  resourceCount: number;
  conflicts: {
    appointmentId: string;
    uid: string;
    startAt: string;
    endAt: string;
    /** 姓名（電話），查不到時退回 uid */
    customer: string;
  }[];
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
  /**
   * 上一頁回傳的 `nextCursor`，原樣送回即可。
   *
   * 後端實際上是 offset（`adminOffsetOf_`），但**不要自己算** ——
   * 它的型別與語意都可能改變，呼叫端只該把拿到的值傳回去。
   */
  cursor?: string | number | null;
}

export interface PagedData {
  /** `null` 表示沒有下一頁。是字串，不是數字 —— 後端以 `String(offset)` 回傳 */
  nextCursor: string | null;
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

  /**
   * 網站設定的公開讀取。訪客也要看得到店名與介紹。
   *
   * ⚠️ 後端走白名單輸出，不是整份文件 —— 新增欄位時後端也要同步加進白名單，
   * 否則這裡宣告了也拿不到值。
   */
  getSiteSettings: {
    payload: Record<string, never>;
    data: {
      site: {
        siteName: string;
        logoUrl: string;
        tagline: string;
        description: string;
        contactPhone: string;
        contactAddress: string;
        lineUrl: string;
        businessNote: string;
        theme: 'sand' | 'mono' | 'sage' | 'night';
        backgroundType: 'none' | 'image' | 'gradient';
        backgroundImageUrl: string;
        backgroundGradient: string;
        backgroundOverlay: number;
        /** false 表示從未設定過，回傳的是預設值 */
        configured: boolean;
      };
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
  /**
   * 列出預約。**權限決定看得到誰的資料。**
   *
   * 取代了原本的 `listMyAppointments` 與 `adminListAppointments` ——
   * 兩者的查詢條件、排序、狀態篩選完全相同，差別只在「查誰的」，
   * 而那正是權限該決定的事。
   *
   * ```text
   * 非 admin：一律強制查自己，傳入的 uid 被**靜默忽略**（不報錯）
   * admin   ：可指定 uid 查某人，或不指定配合日期區間查全部
   * ```
   *
   * 日期區間只在「查全部」時有預設值（近 30 天）。指定 uid 又不帶
   * `from`/`to` 時查全部歷史 —— 顧客要看得到自己所有的預約。
   */
  listAppointments: {
    payload: Partial<DateRangePayload> &
      PagedPayload & { uid?: string; status?: string };
    data: PagedData & {
      appointments: AdminAppointment[];
      /** 實際採用的區間。未套用區間（查單人全部歷史）時為 `null` */
      range: { from: string; to: string } | null;
    };
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
  /**
   * 列出訂單。**權限決定看得到誰的資料**，規則與 `listAppointments` 相同。
   *
   * 取代了原本的 `listMyOrders` 與 `adminListOrders`。
   *
   * `includeItems` 預設 `true`：展開品項只是**多一次查詢**，不是 N+1 ——
   * 後端用 `orderItems (uid, createdAt)` 一次撈完再於記憶體分組。
   * 後台清單不需要明細，傳 `false` 可省下那一次。
   */
  listOrders: {
    payload: Partial<DateRangePayload> &
      PagedPayload & { uid?: string; status?: string; includeItems?: boolean };
    data: PagedData & {
      orders: AdminOrder[];
      /** 實際採用的區間。未套用區間（查單人全部歷史）時為 `null` */
      range: { from: string; to: string } | null;
      /** true 表示品項掃描量觸頂，部分訂單的明細不完整，**必須提示** */
      truncated: boolean;
    };
  };
  listMyCoupons: {
    payload: {
      includeUsed?: boolean;
      includeExpired?: boolean;
      /** 未指定時沿用 `includeExpired`。「已過期」與「券被停用」是兩件事 */
      includeDisabled?: boolean;
    };
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
  /**
   * 切換啟用狀態。
   *
   * `expectedVersion` 選填但**應該要帶**：它是「我看到的是版本 N」的宣告，
   * 不符時後端回 `PRODUCT_CHANGED` 並附上當前產品，避免管理員根據已經
   * 過期的畫面做決定（例如以為在停用一個 1800 元的產品，其實別人剛改成
   * 2200）。少了它，那道防呆就等於沒接上電。
   */
  adminSetProductEnabled: {
    payload: { productId: string; enabled: boolean; expectedVersion?: number };
    data: { productId: string; enabled: boolean; version?: number };
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
    /**
     * 改成公休**不會**自動取消既有預約，只回報筆數供人工處理。
     *
     * `existingAppointmentCount` 是**真的落在新營業區間之外**的筆數，
     * 不是當天的總筆數 —— 縮短半小時營業時間時，兩者差很多。
     * 當天總筆數看 `dayAppointmentCount`。
     */
    data: {
      date: string;
      closed?: boolean;
      existingAppointmentCount?: number;
      dayAppointmentCount?: number;
    };
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
    data: {
      granted: number;
      /**
       * 被跳過的使用者**與原因**。跳過而非讓整批失敗。
       *
       * 兩種原因的處理方式完全不同，因此必須分開顯示：
       *   CAMPAIGN_EXHAUSTED  活動的 maxGrants 已用完 → 調高上限即可
       *   MAX_PER_USER        該會員已持有達 coupon.maxGrantsPerUser 張
       *
       * ⚠️ 曾經把這裡誤寫成 `string[]` 並一律顯示成「已達持有上限」，
       * 導致管理員找不到真正的原因（其實是活動額度用完）。
       *
       * 刻意收斂成這兩個字面值而不加 `| string`：後端日後若新增原因，
       * 比對處會出現型別錯誤，逼我們回來補上對應的說明文字 ——
       * 總比靜默顯示成一個沒人看得懂的代碼好。
       */
      skipped: { uid: string; reason: 'CAMPAIGN_EXHAUSTED' | 'MAX_PER_USER' }[];
      grantIds: string[];
    };
  };
  adminListGrants: {
    /**
     * **`campaignId` 與 `uid` 至少要有一項**，兩者皆缺會回 `VALIDATION_ERROR`。
     *
     * 後端刻意不支援「列出全部發放紀錄」—— 那需要掃描整個 collection，
     * 隨著發放量成長會越來越慢，而實務上的查詢一定是針對某個活動或某位會員。
     *
     * 用聯集型別表達這個約束，漏帶時 tsc 就會擋下來，不必等到執行期才發現。
     */
    payload: PagedPayload &
      ({ campaignId: string; uid?: string } | { campaignId?: string; uid: string });
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
        /** 應收：待付款 + 免付款 + 已付款 */
        totalSales: number;
        /** 已收：狀態為 paid */
        paidSales: number;
        /** 未收：狀態為 created */
        unpaidSales: number;
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
  /**
   * 標記完成並認列收款。**完成即收款** —— 沒有金流，錢是現場收的，
   * 服務做完卻沒收到錢在實務上就是還沒結案，那筆預約留在待結案即可。
   *
   * 只能從待結案出發。已結案／未完成／已取消要先 `adminReopenAppointment`。
   */
  adminCompleteAppointment: {
    payload: { appointmentId: string };
    data: { appointmentId: string; status: 'completed'; orderStatus: string };
  };

  /**
   * 標記未到。與取消是刻意區分的兩種處理：
   * 取消會釋出時段並歸還優惠券，未到兩者都不做，訂單改為「未完成」。
   *
   * 同樣只能從待結案出發。
   */
  adminSetAppointmentNoShow: {
    payload: { appointmentId: string };
    data: { appointmentId: string; status: 'no_show'; orderStatus: string };
  };

  /**
   * 取消結案，把預約退回未完成。人為操作必然有失誤，需要復原路徑。
   *
   * **這是唯一的復原路徑。** 結案狀態之間不可直接互轉，改按別的結案方式
   * 之前一定要先退回。
   *
   * 完成、未到、已取消三種都可退回。前兩者不釋放時段，直接改狀態；
   * 已取消的時段已經釋出，後端會重新確認沒被佔走並把優惠券扣回，
   * 佔用中則回 `SLOT_UNAVAILABLE`，details 帶 `conflicts` 指出被誰擋住。
   *
   * `restoredCoupons` 只在還原已取消的預約時有值。
   */
  adminReopenAppointment: {
    payload: { appointmentId: string };
    data: {
      appointmentId: string;
      status: 'booked';
      orderStatus: string;
      restoredCoupons?: string[];
    };
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
  /**
   * 維護會員資料，**含角色**。
   *
   * 角色原本是獨立的 `adminSetUserRole`，已併入這裡。拆成兩支只有一個
   * 呼叫端、卻多了「只成功一半」的風險：第二支失敗時前一支已經寫進
   * Firestore，畫面卻顯示儲存失敗。合併後全部欄位在同一個 commit 內生效。
   *
   * 兩道自我保護：不可停用自己（`status`）、不可變更自己的角色（`role`）。
   * 後者**只在 role 真的有變動時**才觸發，否則管理員連自己的電話都改不了。
   */
  adminUpdateCustomer: {
    payload: {
      uid: string;
      phone?: string;
      note?: string;
      sourceChannel?: string;
      status?: UserStatus;
      role?: UserRole;
    };
    /** `roleChanged` 為 true 時後端另外寫了一筆 `update_user_role` 稽核紀錄 */
    data: { uid: string; updated: boolean; roleChanged: boolean };
  };
  /**
   * 部分更新。圖片與連結允許空字串（清除），有值則必須是 https。
   *
   * `backgroundGradient` 同樣有驗證：只接受 `linear-gradient(...)` 這類
   * 漸層函式，且不可含 `url(` —— 否則管理員可以讓網站對所有訪客載入
   * 第三方資源，那台主機因此拿得到每位訪客的 IP。
   */
  adminUpdateSiteSettings: {
    payload: Partial<Omit<ApiActionMap['getSiteSettings']['data']['site'], 'configured'>>;
    data: ApiActionMap['getSiteSettings']['data'];
  };
}

export type ApiAction = keyof ApiActionMap;
export type ApiPayloadOf<A extends ApiAction> = ApiActionMap[A]['payload'];
export type ApiDataOf<A extends ApiAction> = ApiActionMap[A]['data'];
