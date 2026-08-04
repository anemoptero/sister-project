import { useCallback, useEffect, useMemo, useState } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import { PAGE_SIZE, fetchAll, pageSlice } from '../../api/fetchAll';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import type { ApiDataOf } from '../../types/api';
import type { AdminCustomer, UserRole, UserStatus } from '../../types/models';
import { useAuth } from '../../auth/useAuth';
import { formatDateTime, formatPrice } from '../../utils/format';

type SortBy = 'createdAt' | 'totalPaidAmount' | 'totalOrderCount' | 'lastOrderAt';

const SORT_LABELS: Record<SortBy, string> = {
  createdAt: '加入時間',
  totalPaidAmount: '累積消費',
  totalOrderCount: '消費次數',
  lastOrderAt: '最近消費'
};

/**
 * 搜尋比對的欄位，與後端 `adminListCustomers` 的 `keyword` 過濾一致
 * （名稱、電話、Email）。另外多比對備註 —— 備註存的常常就是本名，
 * 而管理員想找的正是那個。
 */
function matches(customer: AdminCustomer, keyword: string): boolean {
  const lower = keyword.toLowerCase();
  return (
    customer.displayName.toLowerCase().includes(lower) ||
    customer.phone.includes(keyword) ||
    customer.email.toLowerCase().includes(lower) ||
    customer.note.toLowerCase().includes(lower)
  );
}

function compare(a: AdminCustomer, b: AdminCustomer, sortBy: SortBy): number {
  if (sortBy === 'totalPaidAmount') return b.totalPaidAmount - a.totalPaidAmount;
  if (sortBy === 'totalOrderCount') return b.totalOrderCount - a.totalOrderCount;
  // 時間欄位是已正規化為 +08:00 的 ISO 字串，字典序即時間先後。
  // 空字串（從未消費）自然排到最後，這正是想要的
  if (sortBy === 'lastOrderAt') return b.lastOrderAt.localeCompare(a.lastOrderAt);
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * 會員管理。
 *
 * ## 搜尋與排序都在前端做
 *
 * 資料一次整批抓回（`fetchAll`），搜尋與排序都是對已載入的陣列操作，
 * **打字不會打 API**。原本是把 `keyword` 直接綁在 input 的 onChange 上，
 * 輸入「王小明」會發出三次請求、每次 1～14 秒，而且每次都先
 * `setCustomers(null)` 讓表格閃回骨架。更糟的是沒有請求序號控制 ——
 * 較早送出的慢請求可能晚回並覆蓋正確結果，畫面清單與搜尋框內容對不上。
 *
 * 改成前端過濾之後，這三個問題是從源頭消失，不是被緩解。
 *
 * 後端的 `keyword` 與 `sortBy` 參數刻意保留不移除 —— 那是資料量成長到
 * 需要後端分頁時的回頭路。
 */
export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detailUid, setDetailUid] = useState('');

  /**
   * 只在掛載與儲存後執行。
   *
   * 相依陣列刻意是空的：`keyword` 與 `sortBy` 不再影響請求，
   * 把它們加進來只會讓每次打字都重新載入。
   */
  const load = useCallback(async () => {
    setError('');
    setCustomers(null);
    try {
      const all = await fetchAll<AdminCustomer>(async (cursor) => {
        const data = await callApi('adminListCustomers', {
          limit: 1000,
          ...(cursor ? { cursor } : {})
        });
        return { items: data.customers, nextCursor: data.nextCursor };
      });
      setCustomers(all);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入會員失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const all = customers ?? [];
    const filtered = keyword.trim() ? all.filter((c) => matches(c, keyword.trim())) : all;
    return [...filtered].sort((a, b) => compare(a, b, sortBy));
  }, [customers, keyword, sortBy]);

  // 篩選條件變動後停在第 5 頁會看到空白。回到第一頁是唯一合理的行為
  useEffect(() => {
    setPage(1);
  }, [keyword, sortBy]);

  const rows = pageSlice(visible, page);

  return (
    <div className="page">
      <h1>會員管理</h1>

      <div className="filter-bar">
        <div className="filter-fields">
          <div className="field">
            <label htmlFor="cust-keyword">搜尋</label>
            <input
              id="cust-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="名稱、電話或備註"
            />
          </div>

          <div className="field">
            <label htmlFor="cust-sort">排序</label>
            <select
              id="cust-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              {(Object.keys(SORT_LABELS) as SortBy[]).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {customers === null && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {customers && visible.length === 0 && (
        <div className="empty-state">
          <h2>沒有符合的會員</h2>
          <p>
            {keyword.trim()
              ? '換個關鍵字試試，搜尋會比對名稱、電話與備註。'
              : '會員要先用 LINE 登入過一次，系統才會建立帳號。'}
          </p>
        </div>
      )}

      {customers && visible.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>會員</th>
                  <th>電話</th>
                  <th>來源</th>
                  <th>消費次數</th>
                  <th>累積消費</th>
                  <th>最近消費</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr
                    key={customer.uid}
                    className={customer.status === 'active' ? '' : 'row-disabled'}
                  >
                    <td>
                      {customer.displayName || '（未命名）'}
                      {customer.role === 'admin' && <span className="tag">管理員</span>}
                      {customer.note && <div className="hint cell-sub">{customer.note}</div>}
                    </td>
                    <td>{customer.phone || '—'}</td>
                    <td>{customer.sourceChannel || '—'}</td>
                    <td>{customer.totalOrderCount}</td>
                    <td>{formatPrice(customer.totalPaidAmount)}</td>
                    <td>{customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => {
                          setMessage('');
                          setDetailUid(customer.uid);
                        }}
                      >
                        詳情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            total={visible.length}
            page={page}
            onChange={setPage}
            pageSize={PAGE_SIZE}
            unit="位會員"
          />
        </>
      )}

      <p className="hint">
        列表的消費次數與累積消費是<strong>去正規化欄位</strong>，由系統在下單後另外更新，
        可能略微落後。詳情頁的數字是從訂單實算的，以那邊為準。
      </p>

      {detailUid && (
        <CustomerDetail
          uid={detailUid}
          onClose={() => setDetailUid('')}
          onSaved={(text) => {
            setMessage(text);
            setDetailUid('');
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 會員詳情
// ---------------------------------------------------------------------------

type Detail = ApiDataOf<'adminGetCustomerDetail'>;

function CustomerDetail({
  uid,
  onClose,
  onSaved
}: {
  uid: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { user: me } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [saving, setSaving] = useState(false);

  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sourceChannel, setSourceChannel] = useState('');
  const [status, setStatus] = useState<UserStatus>('active');
  const [role, setRole] = useState<UserRole>('customer');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callApi('adminGetCustomerDetail', { uid });
      setDetail(data);
      setPhone(data.user.phone);
      setNote(data.user.note);
      setSourceChannel(data.user.sourceChannel);
      setStatus(data.user.status);
      setRole(data.user.role);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入會員詳情失敗。');
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSelf = me?.uid === uid;

  /**
   * `deleted` 目前沒有任何流程會產生，但真的出現時**不可讓下拉選單改掉它**。
   * 下拉沒有對應的 option 會落到 selectedIndex = -1 顯示空白，管理員一碰
   * 就把 deleted 悄悄變成 active，而且畫面上完全看不出發生過什麼事。
   */
  const isDeleted = status === 'deleted';

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setError('');
    setErrorField('');

    try {
      // 一支 API 一次寫完，含角色。
      // 原本角色是另一支 adminSetUserRole，第二支失敗時前面的欄位
      // 已經寫進 Firestore，畫面卻顯示「儲存失敗」—— 管理員重試時
      // 會以為前面的也沒存。合併後中途失敗在結構上不可能發生。
      await callApi('adminUpdateCustomer', {
        uid,
        phone,
        note,
        sourceChannel,
        // deleted 不可經由這個表單改動
        ...(isDeleted ? {} : { status }),
        role
      });

      onSaved(`已更新「${detail.user.displayName || uid}」的資料。`);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        setErrorField(validationField(err));
      } else {
        setError('儲存失敗，請稍後再試。');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={detail?.user.displayName || '會員詳情'} busy={saving} onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {!detail && !error && <div className="skeleton" />}

      {detail && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">消費次數</span>
              <strong className="stat-value">{detail.stats.orderCount}</strong>
            </div>
            <div className="stat-tile">
              <span className="stat-label">累積消費</span>
              <strong className="stat-value">{formatPrice(detail.stats.totalPaidAmount)}</strong>
            </div>
            <div className="stat-tile">
              <span className="stat-label">取消次數</span>
              <strong className="stat-value">{detail.stats.cancelledOrderCount}</strong>
            </div>
          </div>

          <p className="hint">
            以上為從訂單實算的數字。
            {detail.denormalized.totalPaidAmount !== detail.stats.totalPaidAmount && (
              <>
                {' '}
                列表顯示的是 {formatPrice(detail.denormalized.totalPaidAmount)}，
                兩者不一致代表某次統計更新失敗過，以這裡為準。
              </>
            )}
          </p>

          <div className="field">
            <label htmlFor="cd-phone">聯絡電話</label>
            <input
              id="cd-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={errorField === 'phone'}
            />
          </div>

          <div className="field">
            <label htmlFor="cd-note">備註</label>
            <input
              id="cd-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如本名，方便辨識"
              maxLength={500}
            />
            <p className="hint">只有後台看得到。LINE 名稱常是暱稱或表情符號，不易辨識。</p>
          </div>

          <div className="field">
            <label htmlFor="cd-source">來源渠道</label>
            <input
              id="cd-source"
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="cd-status">帳號狀態</label>
            {isDeleted ? (
              <>
                <input id="cd-status" value="已刪除" readOnly disabled />
                <p className="hint">
                  已刪除的帳號不可由此變更。這個狀態目前只會在帳戶合併時產生。
                </p>
              </>
            ) : (
              <>
                <select
                  id="cd-status"
                  value={status}
                  disabled={isSelf}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                >
                  <option value="active">正常</option>
                  <option value="disabled">停用</option>
                </select>
                {isSelf && <p className="hint">不能停用自己的帳號。</p>}
              </>
            )}
          </div>

          <div className="field">
            <label htmlFor="cd-role">角色</label>
            <select
              id="cd-role"
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="customer">一般會員</option>
              <option value="admin">管理員</option>
            </select>
            {isSelf && <p className="hint">不能調整自己的角色，避免把自己鎖在門外。</p>}
          </div>

          {detail.coupons.length > 0 && (
            <div className="field">
              <label>持有的優惠券</label>
              <ul className="coupon-terms">
                {detail.coupons.map((grant) => (
                  <li key={grant.grantId}>
                    {grant.name || grant.couponId}
                    {grant.usedAt ? '（已使用）' : grant.revokedAt ? '（已收回）' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="actions">
            <button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              關閉
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
