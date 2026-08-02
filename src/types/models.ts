/**
 * 業務模型型別。
 *
 * 這裡定義的是 **API 實際回傳的形狀**，不是 Firestore 文件的形狀。
 * 兩者刻意不同：後端以白名單輸出（`toPublicUser_`、`toPublicProduct_` 等），
 * 不會回傳 `createdBy`、`totalPaidAmount` 這類內部欄位。
 *
 * 對應文件：
 *   docs/DATA_MODEL.md  §3 Enum、§4 Collection
 *   docs/API_SPEC.md    各 API 的 Response
 *
 * ⚠️ 後端所有字串欄位在沒有值時回傳**空字串而非 null**（`x || ''`），
 * 所以這裡一律標成 `string` 而非 `string | null`。判斷有無請用 falsy
 * 檢查，不要用 `!== null`。
 */

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

export type UserRole = 'customer' | 'admin';
export type UserStatus = 'active' | 'disabled';

export type AppointmentStatus = 'booked' | 'cancelled' | 'completed' | 'no_show';
export type OrderStatus = 'created' | 'free' | 'paid' | 'cancelled' | 'void';

/** `experience` 為體驗券，全額折抵；`discount` 依 `discountAmount` 折抵 */
export type CouponType = 'discount' | 'experience';

/** 套用層級。`item` 為單一品項，`cart` 為整筆訂單，**兩者擇一** */
export type CouponScope = 'item' | 'cart';

/**
 * 有效期型別。**沒有「永久有效」的選項** ——
 * 欄位留空被誤判成永久有效的 bug 實際發生過且騙過了全部測試。
 */
export type CouponValidityType = 'absolute' | 'relative';

/** 發放方式。`claim` 為領取連結，`auto` 目前只支援註冊時發放 */
export type CouponGrantType = 'admin' | 'auto' | 'claim';

/** 0 = 週日，6 = 週六。與 JS `Date.getDay()` 一致 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------------------------------------------------------------------------
// 使用者
// ---------------------------------------------------------------------------

/** `toPublicUser_` 的白名單輸出，固定八個欄位 */
export interface PublicUser {
  uid: string;
  role: UserRole;
  status: UserStatus;
  displayName: string;
  photoUrl: string;
  phone: string;
  email: string;
  sourceChannel: string;
}

// ---------------------------------------------------------------------------
// 產品
// ---------------------------------------------------------------------------

export interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  imageUrl: string;
  imageAlt: string;
  enabled: boolean;
  displayOrder: number;
  /**
   * 樂觀鎖版本號，任何欄位變更都會遞增。
   *
   * **下單時必須原封不動帶回** `expectedProductVersion`。不符會回
   * `PRODUCT_CHANGED`，代表顧客看到的價格已經不是現價。
   */
  version: number;
}

// ---------------------------------------------------------------------------
// 營業時間
// ---------------------------------------------------------------------------

export interface WeeklyBusinessHour {
  weekday: Weekday;
  enabled: boolean;
  /** `HH:mm` */
  openTime: string;
  /** `HH:mm` */
  closeTime: string;
}

export interface BusinessHours {
  /** 恰好 7 筆，weekday 0～6 各一次 */
  weekly: WeeklyBusinessHour[];
  /** 同時段可容納的預約數上限 */
  resourceCount: number;
  bufferMinutes: number;
  /** 格線間隔，必須能整除 60 */
  slotStepMinutes: number;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  /** `false` 表示管理員尚未設定，回傳的是預設值 */
  configured: boolean;
}

// ---------------------------------------------------------------------------
// 可預約時間
// ---------------------------------------------------------------------------

export interface AvailableTime {
  startAt: string;
  /**
   * 實際服務結束時間。**顯示給顧客看的是這個**，
   * 不是取整後的 `occupiedEndAt`。
   */
  endAt: string;
  /** 向上取整到格線後實際佔用到的時間，僅供除錯理解 */
  occupiedEndAt: string;
}

export interface AvailableDay {
  /** `YYYY-MM-DD` */
  date: string;
  closed: boolean;
  occupiedMinutes?: number;
  times: AvailableTime[];
}

// ---------------------------------------------------------------------------
// 預約
// ---------------------------------------------------------------------------

export interface AppointmentItemSummary {
  productId: string;
  productName: string;
  durationMinutes: number;
}

export interface Appointment {
  appointmentId: string;
  orderId: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  occupiedEndAt: string;
  totalDurationMinutes: number;
  items: AppointmentItemSummary[];
  cancelledAt: string;
  cancelReason: string;
  createdAt: string;
}

/** `adminListAppointments` 會額外帶上是誰的預約 */
export interface AdminAppointment extends Appointment {
  uid: string;
}

// ---------------------------------------------------------------------------
// 訂單
// ---------------------------------------------------------------------------

/**
 * 品項一律使用**下單當下的產品快照**，不即時查產品 ——
 * 產品日後調價或改名，歷史訂單顯示的內容必須維持不變。
 */
export interface OrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  productPrice: number;
  productDurationMinutes: number;
  /** 券的代碼快照，僅供顯示；核銷依據是 grant */
  couponCode: string;
  discountAmount: number;
  lineFinalAmount: number;
}

export interface Order {
  orderId: string;
  appointmentId: string;
  itemCount: number;
  originalAmount: number;
  /** 品項券的折抵總額。與 `cartDiscountAmount` 必有一者為 0 */
  itemDiscountAmount: number;
  cartDiscountAmount: number;
  discountAmount: number;
  finalAmount: number;
  cartCouponCode: string;
  status: OrderStatus;
  createdAt: string;
  cancelledAt: string;
  /** 列表 API 為節省查詢不展開品項，會是空陣列 */
  items: OrderItem[];
}

export interface AdminOrder extends Order {
  uid: string;
}

// ---------------------------------------------------------------------------
// 訂單試算
// ---------------------------------------------------------------------------

export interface OrderPricing {
  originalAmount: number;
  itemDiscountAmount: number;
  cartDiscountAmount: number;
  discountAmount: number;
  /** 不會小於 0；為 0 時訂單 status 是 `free` */
  finalAmount: number;
}

export interface PreviewOrderItem {
  productId: string;
  productName: string;
  productPrice: number;
  couponGrantId: string;
  couponName: string;
  discountAmount: number;
  lineFinalAmount: number;
}

// ---------------------------------------------------------------------------
// 優惠券
// ---------------------------------------------------------------------------

/**
 * 顧客持有的券（`listMyCoupons` 的輸出）。
 *
 * `eligibleProductIds` 與 `minOrderAmount` 會回傳，前端才能判斷
 * 哪些券適用當前的服務組合。不含 `campaignId` 與營運配額。
 */
export interface MyCoupon {
  /** 下單時要傳的就是這個，不是 couponId */
  grantId: string;
  couponId: string;
  name: string;
  type: CouponType;
  scope: CouponScope;
  /** 體驗券為 0（全額折抵），折價券為固定金額 */
  discountAmount: number;
  /** 空陣列表示不限產品。**只對 scope = item 有意義** */
  eligibleProductIds: string[];
  /** **只對 scope = cart 有意義** */
  minOrderAmount: number;
  /** 空陣列表示不限。依**預約開始時間**的星期判斷，不是下單當下 */
  weekdays: Weekday[];
  firstPurchaseOnly: boolean;
  expiresAt: string;
  usedAt: string;
  revokedAt: string;
  /** 後端算好的綜合可用性，前端不需自行判斷 */
  usable: boolean;
}

/** 管理端的券定義 */
export interface Coupon {
  couponId: string;
  code: string;
  name: string;
  type: CouponType;
  scope: CouponScope;
  validityType: CouponValidityType;
  discountAmount: number;
  /** validityType = absolute 時有值 */
  validFrom: string;
  validTo: string;
  /** validityType = relative 時有值，領取後 N 天到期 */
  validityDays: number;
  eligibleProductIds: string[];
  minOrderAmount: number;
  weekdays: Weekday[];
  firstPurchaseOnly: boolean;
  /** 同一人最多可持有幾張，0 表示不限 */
  maxGrantsPerUser: number;
  enabled: boolean;
}

/** 發放活動：怎麼發、發多少、發多久 */
export interface Campaign {
  campaignId: string;
  couponId: string;
  name: string;
  grantType: CouponGrantType;
  /** 皆選填。未設 endAt 即為長期活動 */
  startAt: string;
  endAt: string;
  /** 發放端閘門，0 表示不限。併發鎖點為 grantedCount */
  maxGrants: number;
  grantedCount: number;
  /** 成本端閘門，0 表示不限。併發鎖點為 usedCount */
  maxTotalUsage: number;
  usedCount: number;
  /** grantType = claim 時必填且全系統唯一 */
  claimToken: string;
  /** grantType = auto 時必填，第一階段只支援 'signup' */
  autoTrigger: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 發放紀錄（管理端視角） */
export interface Grant {
  grantId: string;
  couponId: string;
  campaignId: string;
  uid: string;
  grantedAt: string;
  grantedBy: string;
  expiresAt: string;
  usedAt: string;
  usedOrderId: string;
  revokedAt: string;
}

// ---------------------------------------------------------------------------
// 後台統計與會員
// ---------------------------------------------------------------------------

export type StatsGroupBy = 'day' | 'week' | 'month';

/**
 * 營收拆成三個數字，讓「未收 + 已收 = 應收」的關係在畫面上自明。
 *
 * `free`（全額折抵）金額必為 0，只計入應收而不分配到未收或已收，
 * 等式仍然成立。已取消與已作廢都不計入任何一項。
 */
export interface SalesStatsBucket {
  /** 應收：待付款 + 免付款 + 已付款 */
  totalSales: number;
  /** 已收：狀態為 paid */
  paidSales: number;
  /** 未收：狀態為 created */
  unpaidSales: number;
  label: string;
  orderCount: number;
  appointmentCount: number;
  newCustomerCount: number;
}

export interface ProductStats {
  productId: string;
  productName: string;
  quantity: number;
  totalSales: number;
}

export interface AdminCustomer {
  uid: string;
  role: UserRole;
  status: UserStatus;
  displayName: string;
  phone: string;
  email: string;
  sourceChannel: string;
  note: string;
  /**
   * 以下四個是 best-effort 更新的**去正規化欄位**，可能落後於實際訂單。
   * 僅供列表排序與快速瀏覽；正式數字看 `adminGetCustomerDetail` 的
   * `stats`，那是從 orders 實算的。
   */
  totalOrderCount: number;
  totalPaidAmount: number;
  lastOrderAt: string;
  lastAppointmentAt: string;
  createdAt: string;
}

/** 從 orders 實算的權威數字 */
export interface CustomerStats {
  orderCount: number;
  cancelledOrderCount: number;
  totalPaidAmount: number;
  lastOrderAt: string;
  appointmentCount: number;
}
