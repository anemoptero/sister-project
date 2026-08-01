import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import { Modal } from '../../components/Modal';
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

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detailUid, setDetailUid] = useState('');

  const load = useCallback(async () => {
    setError('');
    setCustomers(null);
    try {
      const data = await callApi('adminListCustomers', {
        ...(keyword ? { keyword } : {}),
        sortBy,
        limit: 200
      });
      setCustomers(data.customers);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入會員失敗。');
    }
  }, [keyword, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

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
              placeholder="名稱或電話"
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

      {customers?.length === 0 && (
        <div className="empty-state">
          <h2>沒有符合的會員</h2>
          <p>會員要先用 LINE 登入過一次，系統才會建立帳號。</p>
        </div>
      )}

      {customers && customers.length > 0 && (
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
              {customers.map((customer) => (
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

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setError('');
    setErrorField('');

    try {
      await callApi('adminUpdateCustomer', {
        uid,
        phone,
        note,
        sourceChannel,
        status
      });

      // 角色是另一支 API，只在真的變動時才呼叫
      if (role !== detail.user.role) {
        await callApi('adminSetUserRole', { uid, role });
      }

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
