import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import type { ApiActionMap } from '../../types/api';
import type { Campaign, Coupon, CouponGrantType } from '../../types/models';
import { isoToLocalInput, localInputToIso } from '../../utils/datetime';
import { formatDateTime } from '../../utils/format';
import { parseIntStrict } from '../../utils/number';

type CreatePayload = ApiActionMap['adminCreateCampaign']['payload'];

const GRANT_TYPE_LABELS: Record<CouponGrantType, string> = {
  admin: '後台主動發放',
  auto: '符合條件自動發放',
  claim: '顧客憑連結領取'
};

/**
 * 發放活動：怎麼發、發多少、發多久。
 *
 * 與券分開是因為生命週期不同 —— 同一張券可以被多個活動發放，
 * 券的有效期、活動的期間、個人持有的到期日三者互不相同。
 */
export function CampaignPanel({ coupons }: { coupons: Coupon[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callApi('adminListCampaigns', {});
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入發放活動失敗。');
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
        initial={editing === 'new' ? undefined : editing}
        coupons={coupons}
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
        <button type="button" onClick={() => { setMessage(''); setEditing('new'); }}>
          新增活動
        </button>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {campaigns === null && !error && <div className="skeleton" />}

      {campaigns?.length === 0 && (
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
                      onClick={() => { setMessage(''); setEditing(campaign); }}
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

function CampaignForm({
  initial,
  coupons,
  onCancel,
  onSaved
}: {
  initial?: Campaign;
  coupons: Coupon[];
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setErrorField('');

    if (!couponId) return setError('請選擇要發放的券。');
    if (!name.trim()) return setError('請填寫活動名稱。');
    if (grantType === 'claim' && !claimToken.trim()) {
      return setError('領取連結需要領取碼，且全系統唯一。');
    }

    const grants = parseIntStrict(maxGrants);
    const usage = parseIntStrict(maxTotalUsage);
    if (grants === null || grants < 0) return setError('發放上限必須是 0 以上的整數。');
    if (usage === null || usage < 0) return setError('核銷上限必須是 0 以上的整數。');

    const values: CreatePayload = {
      couponId,
      name: name.trim(),
      grantType,
      maxGrants: grants,
      maxTotalUsage: usage,
      enabled
    };

    if (startAt) values.startAt = localInputToIso(startAt);
    // 空字串代表「不設結束時間」，也就是長期活動。
    // 送 null 明確表示清除，而不是省略欄位 —— 編輯時省略會維持原值
    values.endAt = endAt ? localInputToIso(endAt) : null;

    if (grantType === 'claim') values.claimToken = claimToken.trim();
    if (grantType === 'auto') values.autoTrigger = 'signup';

    setSubmitting(true);
    try {
      if (initial) {
        await callApi('adminUpdateCampaign', { campaignId: initial.campaignId, ...values });
        onSaved(`已更新「${values.name}」。`);
      } else {
        await callApi('adminCreateCampaign', values);
        onSaved(`已新增「${values.name}」。`);
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

  return (
    <form className="card" onSubmit={(e) => void handleSubmit(e)}>
      <h2>{isEdit ? '編輯發放活動' : '新增發放活動'}</h2>

      <div className="field-row">
        <div className="field">
          <label htmlFor="cp-coupon">發放哪張券</label>
          <select id="cp-coupon" value={couponId} onChange={(e) => setCouponId(e.target.value)}>
            {coupons.length === 0 && <option value="">尚未建立任何券</option>}
            {coupons.map((coupon) => (
              <option key={coupon.couponId} value={coupon.couponId}>
                {coupon.name}（{coupon.code}）
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cp-name">活動名稱</label>
          <input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="cp-type">發放方式</label>
          <select
            id="cp-type"
            value={grantType}
            onChange={(e) => setGrantType(e.target.value as CouponGrantType)}
          >
            {(Object.keys(GRANT_TYPE_LABELS) as CouponGrantType[]).map((value) => (
              <option key={value} value={value}>
                {GRANT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
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
            aria-invalid={errorField === 'claimToken'}
          />
          <p className="notice">
            ⚠️ 領取連結<strong>可以被轉傳</strong>。綁定是在領取的當下發生，
            所以「用」不能轉讓，但「領」可以。務必搭配發放上限、每人持有上限或活動期間，
            否則會重蹈代碼制被外流的覆轍。
          </p>
        </div>
      )}

      {grantType === 'auto' && (
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
            min={0}
            step={1}
            value={maxGrants}
            onChange={(e) => setMaxGrants(e.target.value)}
          />
          <p className="hint">發放端閘門。0 表示不限。</p>
        </div>

        <div className="field">
          <label htmlFor="cp-max-usage">最多核銷幾次</label>
          <input
            id="cp-max-usage"
            type="number"
            min={0}
            step={1}
            value={maxTotalUsage}
            onChange={(e) => setMaxTotalUsage(e.target.value)}
          />
          <p className="hint">成本端閘門。0 表示不限。</p>
        </div>

        <div />
      </div>

      <div className="field">
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          啟用
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          取消
        </button>
      </div>
    </form>
  );
}
