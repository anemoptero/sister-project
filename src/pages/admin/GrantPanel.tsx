import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import type { AdminCustomer, Campaign, Grant } from '../../types/models';
import { formatDateTime } from '../../utils/format';

/** 後端上限 400（Firestore 單次 commit 500 個寫入，留一個給活動計數與餘裕） */
const MAX_BATCH = 400;

/**
 * 發券與發放紀錄。
 *
 * 只有 `grantType = admin` 的活動能從這裡發 —— `claim` 由顧客自行領取、
 * `auto` 由系統在符合條件時發放，從後台手動插隊會讓兩者的配額失去意義。
 */
export function GrantPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [grants, setGrants] = useState<Grant[] | null>(null);

  const [campaignId, setCampaignId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // 三份資料互不相依，平行取回。Apps Script 每次往返都要一兩秒，
      // 串行的話這頁要等五六秒才看得到東西
      const [campaignData, customerData, grantData] = await Promise.all([
        callApi('adminListCampaigns', {}),
        callApi('adminListCustomers', { limit: 100 }),
        callApi('adminListGrants', { limit: 50 })
      ]);

      const adminCampaigns = campaignData.campaigns.filter(
        (c) => c.grantType === 'admin' && c.enabled
      );
      setCampaigns(adminCampaigns);
      setCampaignId((prev) => prev || adminCampaigns[0]?.campaignId || '');
      setCustomers(customerData.customers);
      setGrants(grantData.grants);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入資料失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(uid: string) {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  }

  async function handleGrant() {
    setMessage('');
    setError('');

    if (!campaignId) return setError('請選擇發放活動。');
    if (selected.length === 0) return setError('請至少選擇一位會員。');
    if (selected.length > MAX_BATCH) {
      return setError(`一次最多發給 ${MAX_BATCH} 位，請分批進行。`);
    }

    setSubmitting(true);
    try {
      const data = await callApi('adminGrantCoupon', {
        campaignId,
        uids: selected,
        ...(note ? { note } : {})
      });

      // 已達持有上限的人會被跳過而非整批失敗，必須說清楚誰沒發到，
      // 否則管理員會以為全部都發成功了
      setMessage(
        data.skipped.length > 0
          ? `已發放 ${data.granted} 張，${data.skipped.length} 位因已達持有上限而略過。`
          : `已發放 ${data.granted} 張。`
      );
      setSelected([]);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '發放失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(grantId: string) {
    setMessage('');
    setError('');
    try {
      await callApi('adminRevokeGrant', { grantId });
      setMessage('已收回該張券。');
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '收回失敗。');
    }
  }

  const visible = keyword
    ? customers.filter(
        (c) => c.displayName.includes(keyword) || c.phone.includes(keyword)
      )
    : customers;

  const customerName = (uid: string) =>
    customers.find((c) => c.uid === uid)?.displayName ?? uid;

  return (
    <div className="stack">
      <section className="card">
        <h2>發放優惠券</h2>

        {campaigns.length === 0 ? (
          <div className="empty-state">
            <h2>沒有可用的發放活動</h2>
            <p>
              請先在「發放活動」建立一個<strong>發放方式為「後台主動發放」</strong>且已啟用的活動。
            </p>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="g-campaign">發放活動</label>
              <select
                id="g-campaign"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.campaignId} value={campaign.campaignId}>
                    {campaign.name}（已發 {campaign.grantedCount}
                    {campaign.maxGrants ? ` / ${campaign.maxGrants}` : ''}）
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="g-search">搜尋會員</label>
              <input
                id="g-search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="名稱或電話"
              />
            </div>

            <div className="field">
              <label>選擇會員（已選 {selected.length} 位）</label>
              <div className="chip-group">
                {visible.length === 0 && <p className="hint">沒有符合的會員。</p>}
                {visible.map((customer) => (
                  <button
                    type="button"
                    key={customer.uid}
                    className={`chip${selected.includes(customer.uid) ? ' is-on' : ''}`}
                    onClick={() => toggle(customer.uid)}
                    aria-pressed={selected.includes(customer.uid)}
                  >
                    {customer.displayName || '（未命名）'}
                  </button>
                ))}
              </div>
              <p className="hint">一次最多 {MAX_BATCH} 位。重複選取會自動去除。</p>
            </div>

            <div className="field">
              <label htmlFor="g-note">備註</label>
              <input
                id="g-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：客訴補償"
                maxLength={200}
              />
            </div>

            {message && <p className="success">{message}</p>}
            {error && <p className="error">{error}</p>}

            <div className="actions">
              <button type="button" onClick={() => void handleGrant()} disabled={submitting}>
                {submitting ? '發放中…' : `發放給 ${selected.length} 位會員`}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>發放紀錄</h2>

        {grants === null && <div className="skeleton" />}
        {grants?.length === 0 && <p className="hint">尚無發放紀錄。</p>}

        {grants && grants.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>會員</th>
                  <th>發放時間</th>
                  <th>到期</th>
                  <th>狀態</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => {
                  const status = grant.revokedAt
                    ? '已收回'
                    : grant.usedAt
                      ? '已使用'
                      : new Date(grant.expiresAt).getTime() < Date.now()
                        ? '已過期'
                        : '可使用';

                  return (
                    <tr key={grant.grantId}>
                      <td>{customerName(grant.uid)}</td>
                      <td>{formatDateTime(grant.grantedAt)}</td>
                      <td>{formatDateTime(grant.expiresAt)}</td>
                      <td>
                        <span className={`tag ${status === '可使用' ? 'tag--on' : 'tag--off'}`}>
                          {status}
                        </span>
                      </td>
                      <td>
                        {/* 已使用的不可收回 —— 那要走訂單取消流程才能正確還原金額 */}
                        {status === '可使用' && (
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => void handleRevoke(grant.grantId)}
                          >
                            收回
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="hint">
          只有尚未使用的券可以收回。已使用的要透過取消訂單才能還原 ——
          那個流程會同時把金額、時段與券一起復原。
        </p>
      </section>
    </div>
  );
}
