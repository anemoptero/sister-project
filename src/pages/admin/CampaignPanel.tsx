import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callApi, isApiError, validationField } from '../../api/client';
import { Modal } from '../../components/Modal';
import type { ApiActionMap } from '../../types/api';
import type { AdminCustomer, Campaign, Coupon, CouponGrantType, Grant } from '../../types/models';
import { isoToLocalInput, localInputToIso } from '../../utils/datetime';
import { formatDateTime } from '../../utils/format';
import { parseIntStrict } from '../../utils/number';
import { MemberPicker } from './MemberPicker';
import { isMockUid, makeMockCustomers } from './mockCustomers';

type CreatePayload = ApiActionMap['adminCreateCampaign']['payload'];

const GRANT_TYPE_LABELS: Record<CouponGrantType, string> = {
  admin: '後台主動發放',
  auto: '符合條件自動發放',
  claim: '顧客憑連結領取'
};

/** 後端上限 400（Firestore 單次 commit 500 個寫入，留給活動計數與餘裕） */
const MAX_BATCH = 400;

export function CampaignPanel({ coupons }: { coupons: Coupon[] }) {
  const [searchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [realCustomers, setRealCustomers] = useState<AdminCustomer[]>([]);

  /**
   * 版面預覽：網址加上 `?mock=30` 就會混入 30 位假會員，用來檢查人多時
   * 選單的捲動與搜尋。假資料只存在於瀏覽器，送出前會被過濾掉。
   */
  const mockCount = Number(searchParams.get('mock') ?? 0);
  const mocks = mockCount > 0 ? makeMockCustomers(mockCount) : [];
  const customers = mocks.length ? [...realCustomers, ...mocks] : realCustomers;
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');

    // 兩者互不相依，其中一支失敗時另一支的結果仍然有用
    const [campaignResult, customerResult] = await Promise.allSettled([
      callApi('adminListCampaigns', {}),
      callApi('adminListCustomers', { limit: 200 })
    ]);

    if (campaignResult.status === 'fulfilled') {
      setCampaigns(campaignResult.value.campaigns);
    } else {
      setCampaigns([]);
      setError(
        `發放活動載入失敗：${
          isApiError(campaignResult.reason) ? campaignResult.reason.message : '請稍後再試'
        }`
      );
    }

    if (customerResult.status === 'fulfilled') {
      setRealCustomers(customerResult.value.customers);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const couponName = (couponId: string) =>
    coupons.find((c) => c.couponId === couponId)?.name ?? couponId;

  if (editing) {
    return (
      <CampaignForm
        key={editing === 'new' ? 'new' : editing.campaignId}
        initial={editing === 'new' ? undefined : editing}
        coupons={coupons}
        customers={customers}
        mockCount={mocks.length}
        onCancel={() => setEditing(null)}
        onSaved={(text) => {
          setEditing(null);
          setMessage(text);
          void load();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>發放活動</h2>
        <button
          type="button"
          onClick={() => {
            setMessage('');
            setEditing('new');
          }}
          disabled={coupons.length === 0}
        >
          新增活動
        </button>
      </div>

      {coupons.length === 0 && (
        <p className="notice">請先建立至少一張優惠券，活動才知道要發什麼。</p>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {campaigns === null && !error && <div className="skeleton" />}

      {campaigns?.length === 0 && !error && (
        <div className="empty-state">
          <h2>還沒有發放活動</h2>
          <p>券要先透過活動發給會員，顧客才拿得到 —— 沒有活動就沒有人有券可用。</p>
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>活動</th>
                <th>券</th>
                <th>發放方式</th>
                <th>已發 / 上限</th>
                <th>已用 / 上限</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.campaignId} className={campaign.enabled ? '' : 'row-disabled'}>
                  <td>
                    {campaign.name}
                    {campaign.claimToken && (
                      <div className="hint cell-sub">領取碼：{campaign.claimToken}</div>
                    )}
                  </td>
                  <td>{couponName(campaign.couponId)}</td>
                  <td>{GRANT_TYPE_LABELS[campaign.grantType]}</td>
                  <td>
                    {campaign.grantedCount} / {campaign.maxGrants || '不限'}
                  </td>
                  <td>
                    {campaign.usedCount} / {campaign.maxTotalUsage || '不限'}
                  </td>
                  <td>
                    <span className={`tag ${campaign.enabled ? 'tag--on' : 'tag--off'}`}>
                      {campaign.enabled ? '進行中' : '已停用'}
                    </span>
                    {campaign.endAt && (
                      <div className="hint cell-sub">至 {formatDateTime(campaign.endAt)}</div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => {
                        setMessage('');
                        setEditing(campaign);
                      }}
                    >
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        「已發」與「已用」是兩道獨立的閘門：前者限制最多發出幾張，後者限制最多核銷幾次。
        兩者都是併發控制的鎖點，不只是統計數字。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 活動表單
// ---------------------------------------------------------------------------

/**
 * 建立與編輯共用。
 *
 * **哪些欄位在編輯時鎖死，是由後端決定的，不是設計偏好。**
 * `adminUpdateCampaign` 只接受 name / startAt / endAt / maxGrants /
 * maxTotalUsage / enabled 六個欄位，其餘傳了會被靜默忽略。與其讓管理員
 * 改了以為有效，不如直接停用並說明原因。
 *
 * 其中 `claimToken` 特別要緊：領取連結一旦發出去就永遠指向這個活動，
 * 改了會讓所有已發布的連結失效，而那些連結可能已經貼在官方帳號的訊息裡。
 */
function CampaignForm({
  initial,
  coupons,
  customers,
  mockCount,
  onCancel,
  onSaved
}: {
  initial?: Campaign;
  coupons: Coupon[];
  customers: AdminCustomer[];
  mockCount: number;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = Boolean(initial);

  const [couponId, setCouponId] = useState(initial?.couponId ?? coupons[0]?.couponId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [grantType, setGrantType] = useState<CouponGrantType>(initial?.grantType ?? 'admin');
  const [startAt, setStartAt] = useState(isoToLocalInput(initial?.startAt ?? ''));
  const [endAt, setEndAt] = useState(isoToLocalInput(initial?.endAt ?? ''));
  const [maxGrants, setMaxGrants] = useState(String(initial?.maxGrants ?? 0));
  const [maxTotalUsage, setMaxTotalUsage] = useState(String(initial?.maxTotalUsage ?? 0));
  const [claimToken, setClaimToken] = useState(initial?.claimToken ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  /** 尚未送出的發放對象 */
  const [pending, setPending] = useState<string[]>([]);
  const [grants, setGrants] = useState<Grant[] | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [notice, setNotice] = useState('');
  /** 待確認收回的持有紀錄。收回不可逆，不該點一下就執行 */
  const [confirmRevoke, setConfirmRevoke] = useState<Grant | null>(null);
  const [revoking, setRevoking] = useState('');

  const loadGrants = useCallback(async (campaignId: string) => {
    try {
      const data = await callApi('adminListGrants', { campaignId, limit: 200 });
      setGrants(data.grants);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入領取紀錄失敗。');
      setGrants([]);
    }
  }, []);

  useEffect(() => {
    if (initial) void loadGrants(initial.campaignId);
    else setGrants([]);
  }, [initial, loadGrants]);

  // 已收回的不算持有者，因此回收之後該會員會自動從「已發放」消失，
  // 也就能再次被加入發放對象
  const activeGrants = (grants ?? []).filter((g) => !g.revokedAt);
  const grantedUids = activeGrants.map((g) => g.uid);

  const customerName = (uid: string) =>
    customers.find((c) => c.uid === uid)?.displayName || uid;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setErrorField('');
    setNotice('');

    if (!couponId) return setError('請選擇要發放的券。');
    if (!name.trim()) return setError('請填寫活動名稱。');
    if (grantType === 'claim' && !claimToken.trim()) {
      return setError('領取連結需要領取碼，且全系統唯一。');
    }

    const grantsLimit = parseIntStrict(maxGrants);
    const usageLimit = parseIntStrict(maxTotalUsage);
    if (grantsLimit === null || grantsLimit < 0) return setError('發放上限必須是 0 以上的整數。');
    if (usageLimit === null || usageLimit < 0) return setError('核銷上限必須是 0 以上的整數。');

    if (startAt && endAt && new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return setError('開始時間必須早於結束時間。');
    }

    setSubmitting(true);
    try {
      let campaignId = initial?.campaignId ?? '';

      if (initial) {
        // 只送後端接受的六個欄位。其餘傳了也會被忽略，
        // 不送才能讓行為與畫面上的鎖定一致
        await callApi('adminUpdateCampaign', {
          campaignId: initial.campaignId,
          name: name.trim(),
          startAt: startAt ? localInputToIso(startAt) : '',
          endAt: endAt ? localInputToIso(endAt) : '',
          maxGrants: grantsLimit,
          maxTotalUsage: usageLimit,
          enabled
        });
      } else {
        const values: CreatePayload = {
          couponId,
          name: name.trim(),
          grantType,
          maxGrants: grantsLimit,
          maxTotalUsage: usageLimit,
          enabled
        };
        if (startAt) values.startAt = localInputToIso(startAt);
        values.endAt = endAt ? localInputToIso(endAt) : null;
        if (grantType === 'claim') values.claimToken = claimToken.trim();
        if (grantType === 'auto') values.autoTrigger = 'signup';

        const created = await callApi('adminCreateCampaign', values);
        campaignId = created.campaignId;
      }

      /**
       * 過濾掉版面預覽用的假會員。
       *
       * 後端不會驗證 uid 是否真的存在，假 uid 送過去會產生指向不存在使用者的
       * 孤兒 grant，而且會佔用活動的發放額度 —— 那正是我們刻意避免寫進
       * Firestore 的東西，不能在這裡漏出去。
       */
      const realPending = pending.filter((uid) => !isMockUid(uid));
      const mockSkipped = pending.length - realPending.length;

      if (realPending.length > 0) {
        try {
          const result = await callApi('adminGrantCoupon', { campaignId, uids: realPending });

          /**
           * 兩種略過原因的解法完全不同，必須分開講：
           *   活動額度用完 → 調高「最多發出幾張」就能繼續
           *   個人持有上限 → 要改的是券的設定，或先收回對方手上的
           *
           * 混為一談的話管理員會往錯的方向找原因。
           */
          const exhausted = result.skipped.filter((s) => s.reason === 'CAMPAIGN_EXHAUSTED');
          const perUser = result.skipped.filter((s) => s.reason === 'MAX_PER_USER');

          const notes: string[] = [];
          if (exhausted.length) {
            notes.push(`${exhausted.length} 位因活動發放額度已用完而略過`);
          }
          if (perUser.length) {
            notes.push(`${perUser.length} 位因已持有足夠張數而略過`);
          }

          if (mockSkipped > 0) notes.push(`${mockSkipped} 位預覽用假資料未發放`);

          onSaved(
            `已儲存「${name.trim()}」並發放 ${result.granted} 張` +
              (notes.length ? `，${notes.join('、')}` : '') +
              '。'
          );
        } catch (grantErr) {
          /**
           * 活動已經建立/更新成功，只有發放失敗。
           *
           * 這裡**不能**回報整體失敗 —— 管理員會以為活動沒建成功而重新
           * 建立一次，結果多出一個重複的活動。必須明確區分兩者。
           */
          setNotice(
            `活動已儲存，但發放未完成：${
              isApiError(grantErr) ? grantErr.message : '請稍後再試'
            }。請重新整理後於編輯畫面再次加入這些會員。`
          );
          setPending([]);
          if (campaignId) await loadGrants(campaignId);
          setSubmitting(false);
          return;
        }
      } else {
        onSaved(
          mockSkipped > 0
            ? `已儲存「${name.trim()}」。選取的 ${mockSkipped} 位是預覽用假資料，未實際發放。`
            : `已儲存「${name.trim()}」。`
        );
      }
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        setErrorField(validationField(err));
      } else {
        setError('儲存失敗，請稍後再試。');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(grant: Grant) {
    setRevoking(grant.grantId);
    setError('');
    try {
      await callApi('adminRevokeGrant', { grantId: grant.grantId });
      if (initial) await loadGrants(initial.campaignId);
      setConfirmRevoke(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : '收回失敗。');
    } finally {
      setRevoking('');
    }
  }

  const showMembers = grantType === 'admin';
  const grantedCount = initial?.grantedCount ?? 0;

  /**
   * 活動額度是否已用完。
   *
   * 以**表單上當前填的值**判斷而非 `initial.maxGrants`，這樣管理員把上限
   * 調高之後提示會立刻消失，不必先儲存才知道有沒有解決。
   */
  const limitInForm = parseIntStrict(maxGrants) ?? 0;
  const exhausted = limitInForm > 0 && grantedCount >= limitInForm;

  return (
    <form className="stack" onSubmit={(e) => void handleSubmit(e)}>
      <section className="card">
        <h2>{isEdit ? '編輯發放活動' : '新增發放活動'}</h2>

        <div className="field-row">
          <div className="field">
            <label htmlFor="cp-coupon">發放哪張券</label>
            <select
              id="cp-coupon"
              value={couponId}
              onChange={(e) => setCouponId(e.target.value)}
              disabled={isEdit}
            >
              {coupons.map((coupon) => (
                <option key={coupon.couponId} value={coupon.couponId}>
                  {coupon.name}（{coupon.code}）
                </option>
              ))}
            </select>
            {isEdit && <p className="hint">建立後不可更換 —— 已發出的券已經綁定這張。</p>}
          </div>

          <div className="field">
            <label htmlFor="cp-name">活動名稱</label>
            <input
              id="cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errorField === 'name'}
            />
          </div>

          <div className="field">
            <label htmlFor="cp-type">發放方式</label>
            <select
              id="cp-type"
              value={grantType}
              onChange={(e) => setGrantType(e.target.value as CouponGrantType)}
              disabled={isEdit}
            >
              {(Object.keys(GRANT_TYPE_LABELS) as CouponGrantType[]).map((value) => (
                <option key={value} value={value}>
                  {GRANT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            {isEdit && <p className="hint">建立後不可更改。</p>}
          </div>
        </div>

        {grantType === 'claim' && (
          <div className="field">
            <label htmlFor="cp-token">領取碼</label>
            <input
              id="cp-token"
              value={claimToken}
              onChange={(e) => setClaimToken(e.target.value)}
              placeholder="SUMMER2026"
              disabled={isEdit}
              aria-invalid={errorField === 'claimToken'}
            />
            {isEdit ? (
              <p className="hint">
                建立後不可更改 —— 已發布的領取連結永遠指向這個領取碼，
                改了會讓所有發出去的連結失效。
              </p>
            ) : (
              <p className="notice">
                ⚠️ 領取連結<strong>可以被轉傳</strong>。綁定發生在領取的當下，
                所以「用」不能轉讓，但「領」可以。務必搭配發放上限或活動期間。
              </p>
            )}
          </div>
        )}

        {grantType === 'auto' && !isEdit && (
          <p className="hint">第一階段只支援「首次註冊時自動發放」。</p>
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor="cp-start">開始時間</label>
            <input
              id="cp-start"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
            <p className="hint">留空表示立即開始。</p>
          </div>

          <div className="field">
            <label htmlFor="cp-end">結束時間</label>
            <input
              id="cp-end"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
            <p className="hint">留空表示長期活動。</p>
          </div>

          <div />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="cp-max-grants">最多發出幾張</label>
            <input
              id="cp-max-grants"
              type="number"
              min={grantedCount}
              step={1}
              value={maxGrants}
              onChange={(e) => setMaxGrants(e.target.value)}
              aria-invalid={errorField === 'maxGrants'}
            />
            <p className="hint">
              0 表示不限。這是<strong>累計發出過幾張</strong>的上限 ——
              <strong>收回不會退還額度</strong>，因為它記錄的是「發出過幾張」而不是
              「目前有效幾張」。
              {grantedCount > 0 && `目前已發出 ${grantedCount} 張，不可設定得比它小。`}
            </p>
          </div>

          <div className="field">
            <label htmlFor="cp-max-usage">最多核銷幾次</label>
            <input
              id="cp-max-usage"
              type="number"
              min={initial?.usedCount ?? 0}
              step={1}
              value={maxTotalUsage}
              onChange={(e) => setMaxTotalUsage(e.target.value)}
              aria-invalid={errorField === 'maxTotalUsage'}
            />
            <p className="hint">
              成本端閘門。0 表示不限。
              {(initial?.usedCount ?? 0) > 0 && `不可小於已核銷的 ${initial?.usedCount} 次。`}
            </p>
          </div>

          <div />
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            啟用
          </label>
        </div>
      </section>

      {showMembers && (
        <section className="card">
          <h2>發放對象</h2>
          <p className="hint">
            {isEdit
              ? '加入的會員會在儲存時收到券。已發放的無法從這裡移除，要收回請用下方的領取紀錄。'
              : '選擇的會員會在活動建立後立即收到券。也可以先不選，之後再編輯加入。'}
          </p>

          {mockCount > 0 && (
            <p className="notice">
              🔍 <strong>版面預覽模式</strong>：清單中混入了 {mockCount} 位假會員，
              用來檢視人數多時的操作手感。這些資料<strong>只存在於瀏覽器</strong>，
              選取後也不會實際發放。移除網址結尾的 <code>?mock=…</code> 即可關閉。
            </p>
          )}

          {/* 額度用完時先講清楚，否則按了發放才被略過，而略過訊息容易被當成雜訊 */}
          {exhausted && (
            <p className="notice">
              這個活動已經發出 {grantedCount} 張，達到上限 {limitInForm} 張，
              <strong>再加入會員也不會發出</strong>。
              <br />
              收回不會退還額度 —— 上限記錄的是「累計發出過幾張」。
              要繼續發放，請把上方的「最多發出幾張」調高，或設為 0（不限）。
            </p>
          )}

          <MemberPicker
            customers={customers}
            pending={pending}
            granted={grantedUids}
            max={MAX_BATCH}
            onAdd={(uid) => setPending((prev) => [...prev, uid])}
            onRemove={(uid) => setPending((prev) => prev.filter((id) => id !== uid))}
          />
        </section>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : pending.length > 0 ? `儲存並發放 ${pending.length} 張` : '儲存'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          {isEdit ? '返回列表' : '取消'}
        </button>
      </div>

      {isEdit && (
        <section className="card">
          <h2>領取紀錄</h2>

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
                      <tr key={grant.grantId} className={grant.revokedAt ? 'row-disabled' : ''}>
                        <td>{customerName(grant.uid)}</td>
                        <td>{formatDateTime(grant.grantedAt)}</td>
                        <td>{formatDateTime(grant.expiresAt)}</td>
                        <td>
                          <span className={`tag ${status === '可使用' ? 'tag--on' : 'tag--off'}`}>
                            {status}
                          </span>
                        </td>
                        <td>
                          {/* 已使用的不可收回 —— 那要走訂單取消才能正確還原金額與時段 */}
                          {status === '可使用' && (
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => setConfirmRevoke(grant)}
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
            收回之後該會員會從上方的「已發放」消失，可以再次被加入發放對象。
            已使用的券要透過取消訂單才能還原 —— 那個流程會同時復原金額、時段與券。
          </p>
        </section>
      )}

      {confirmRevoke && (
        <Modal
          title="確定要收回這張券嗎？"
          busy={Boolean(revoking)}
          onClose={() => setConfirmRevoke(null)}
        >
          <p>
            將收回 <strong>{customerName(confirmRevoke.uid)}</strong> 持有的這張券，
            對方將無法再使用它。
          </p>
          <p className="hint">
            收回後該會員可以再次被加入發放對象。但<strong>活動的發放額度不會退還</strong> ——
            上限記錄的是累計發出過幾張。
          </p>
          <div className="actions">
            <button
              type="button"
              className="danger"
              onClick={() => void handleRevoke(confirmRevoke)}
              disabled={Boolean(revoking)}
            >
              {revoking ? '收回中…' : '確定收回'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmRevoke(null)}
              disabled={Boolean(revoking)}
            >
              保留
            </button>
          </div>
        </Modal>
      )}
    </form>
  );
}
