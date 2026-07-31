import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError } from '../../api/client';
import type { AdminCustomer, Campaign, Grant } from '../../types/models';
import { formatDateTime } from '../../utils/format';

/** 後端上限 400（Firestore 單次 commit 500 個寫入，留一個給活動計數與餘裕） */
const MAX_BATCH = 400;

/** 指出是哪一份資料載入失敗，而不是籠統的「載入失敗」 */
function describe(reason: unknown, what: string): string {
  return `${what}載入失敗：${isApiError(reason) ? reason.message : '請稍後再試'}`;
}

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

  /**
   * 載入活動與會員。
   *
   * 用 `allSettled` 而非 `all`：兩者互不相依，其中一支失敗時另一支的結果
   * 仍然有用。`all` 會讓任一失敗就整批丟棄，畫面變成完全空白，
   * 而使用者看到的是「什麼都沒有」而不是「有一部分載入失敗」。
   */
  const load = useCallback(async () => {
    setError('');

    const [campaignResult, customerResult] = await Promise.allSettled([
      callApi('adminListCampaigns', {}),
      callApi('adminListCustomers', { limit: 100 })
    ]);

    const problems: string[] = [];

    if (campaignResult.status === 'fulfilled') {
      const adminCampaigns = campaignResult.value.campaigns.filter(
        (c) => c.grantType === 'admin' && c.enabled
      );
      setCampaigns(adminCampaigns);
      setCampaignId((prev) => prev || adminCampaigns[0]?.campaignId || '');
    } else {
      problems.push(describe(campaignResult.reason, '發放活動'));
    }

    if (customerResult.status === 'fulfilled') {
      setCustomers(customerResult.value.customers);
    } else {
      problems.push(describe(customerResult.reason, '會員清單'));
    }

    if (problems.length) setError(problems.join('　'));
  }, []);

  /**
   * 載入某個活動的發放紀錄。
   *
   * 後端要求必須指定 `campaignId` 或 `uid` —— 它不支援「列出全部」，
   * 那需要掃描整個 collection。因此紀錄的載入必須等活動選定之後。
   */
  const loadGrants = useCallback(async (id: string) => {
    if (!id) {
      setGrants([]);
      return;
    }
    try {
      const data = await callApi('adminListGrants', { campaignId: id, limit: 50 });
      setGrants(data.grants);
    } catch (err) {
      setGrants([]);
      setError(isApiError(err) ? err.message : '載入發放紀錄失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadGrants(campaignId);
  }, [campaignId, loadGrants]);

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
      // 活動的 grantedCount 與發放紀錄都變了，兩邊都要重載
      await Promise.all([load(), loadGrants(campaignId)]);
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
      await loadGrants(campaignId);
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

  const selectedCampaign = campaigns.find((c) => c.campaignId === campaignId);

  return (
    <div className="stack">
      <section className="card">
        <h2>發放優惠券</h2>

        {error && <p className="error">{error}</p>}

        {campaigns.length === 0 ? (
          <div className="empty-state">
            <h2>沒有可用的發放活動</h2>
            <p>
              這裡只列出<strong>發放方式為「後台主動發放」且已啟用</strong>的活動。
            </p>
            <p className="hint">
              「顧客憑連結領取」與「符合條件自動發放」的活動不會出現在這裡 ——
              前者由顧客自己領、後者由系統發，從後台插隊會讓兩者的配額失去意義。
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

            {/* 錯誤已在區塊頂端統一顯示，這裡只放成功訊息，避免同一則訊息出現兩次 */}
            {message && <p className="success">{message}</p>}

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
        <p className="hint">
          {selectedCampaign
            ? `顯示「${selectedCampaign.name}」的發放紀錄。切換上方的活動可查看其他活動。`
            : '選擇上方的發放活動後才會顯示紀錄。'}
        </p>

        {grants === null && <div className="skeleton" />}
        {grants?.length === 0 && <p className="hint">這個活動尚未發出任何券。</p>}

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
