import { useCallback, useEffect, useState } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import { fetchAll } from '../../api/fetchAll';
import type { ApiActionMap } from '../../types/api';
import type { Coupon, Product } from '../../types/models';
import { formatPrice } from '../../utils/format';
import { CampaignPanel } from './CampaignPanel';
import { CouponForm } from './CouponForm';

type Tab = 'coupons' | 'campaigns';

const TAB_LABELS: Record<Tab, string> = {
  coupons: '優惠券',
  campaigns: '發放活動'
};

/**
 * 優惠券營運。三個分頁對應三層資料結構：
 *
 * ```text
 * coupons           折抵怎麼算、有效期怎麼算
 * couponCampaigns   怎麼發、發多少、發多久
 * couponGrants      誰持有、什麼時候到期、用掉了沒
 * ```
 *
 * 顧客拿到券的唯一途徑是「活動發放」——「建了券」不等於「有人有券」，
 * 這是發放制與舊的代碼輸入制最大的差別，分頁順序刻意照這個流程排。
 */
export default function AdminCouponsPage() {
  const [tab, setTab] = useState<Tab>('coupons');
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // 券與產品互不相依，平行取回省一次往返。
      // 券整批抓回 —— 分頁少掉的那幾張在畫面上完全看不出來，
      // 而管理員會以為那張券不存在而重複建立一張同名的
      const [couponList, productData] = await Promise.all([
        fetchAll<Coupon>(async (cursor) => {
          const data = await callApi('adminListCoupons', {
            limit: 1000,
            ...(cursor ? { cursor } : {})
          });
          return { items: data.coupons, nextCursor: data.nextCursor };
        }),
        callApi('listProducts', { includeDisabled: true })
      ]);
      setCoupons(couponList);
      setProducts(productData.products);
    } catch (err) {
      setError(isApiError(err) ? err.message : '載入優惠券失敗。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(values: ApiActionMap['adminCreateCoupon']['payload']) {
    setSubmitting(true);
    setError('');
    setErrorField('');
    try {
      if (editing && editing !== 'new') {
        // code / type / scope 不可修改，後端會拒絕，這裡先拆掉不送
        const { code: _code, type: _type, scope: _scope, ...updatable } = values;
        await callApi('adminUpdateCoupon', { couponId: editing.couponId, ...updatable });
        setMessage(`已更新「${values.name}」。`);
      } else {
        await callApi('adminCreateCoupon', values);
        setMessage(`已新增「${values.name}」。券還需要透過發放活動發給會員才有人能用。`);
      }
      setEditing(null);
      await load();
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

  async function handleToggle(coupon: Coupon) {
    setError('');
    try {
      await callApi('adminSetCouponEnabled', {
        couponId: coupon.couponId,
        enabled: !coupon.enabled
      });
      setMessage(`已${coupon.enabled ? '停用' : '啟用'}「${coupon.name}」。`);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : '操作失敗。');
    }
  }

  if (editing) {
    return (
      <div className="page">
        {error && <p className="error">{error}</p>}
        <CouponForm
          key={editing === 'new' ? 'new' : editing.couponId}
          initial={editing === 'new' ? undefined : editing}
          products={products}
          submitting={submitting}
          errorField={errorField}
          onCancel={() => { setError(''); setEditing(null); }}
          onSubmit={(values) => void handleSubmit(values)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <h1>優惠券</h1>

      <div className="tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as Tab[]).map((value) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={`tab${tab === value ? ' is-active' : ''}`}
            onClick={() => { setMessage(''); setError(''); setTab(value); }}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {tab === 'coupons' && (
        <div className="stack">
          <div className="page-head">
            <h2>優惠券定義</h2>
            <button type="button" onClick={() => { setMessage(''); setEditing('new'); }}>
              新增優惠券
            </button>
          </div>

          {coupons === null && !error && <div className="skeleton" />}

          {coupons?.length === 0 && (
            <div className="empty-state">
              <h2>還沒有優惠券</h2>
              <p>建立券之後，還要在「發放活動」設定怎麼發，顧客才拿得到。</p>
            </div>
          )}

          {coupons && coupons.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>名稱</th>
                    <th>折抵</th>
                    <th>套用</th>
                    <th>有效期</th>
                    <th>狀態</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.couponId} className={coupon.enabled ? '' : 'row-disabled'}>
                      <td>
                        {coupon.name}
                        <div className="hint cell-sub">{coupon.code}</div>
                      </td>
                      <td>
                        {coupon.type === 'experience'
                          ? '全額折抵'
                          : formatPrice(coupon.discountAmount)}
                      </td>
                      <td>{coupon.scope === 'item' ? '單一品項' : '整筆訂單'}</td>
                      <td>
                        {coupon.validityType === 'relative'
                          ? `領取後 ${coupon.validityDays} 天`
                          : '固定期間'}
                      </td>
                      <td>
                        <span className={`tag ${coupon.enabled ? 'tag--on' : 'tag--off'}`}>
                          {coupon.enabled ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => { setMessage(''); setEditing(coupon); }}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => void handleToggle(coupon)}
                          >
                            {coupon.enabled ? '停用' : '啟用'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="hint">
            建立券只是定義「折抵怎麼算」。<strong>顧客要拿到券，必須透過發放活動</strong> ——
            顧客沒有輸入代碼的地方，結帳時只能從自己持有的券裡挑。
          </p>
        </div>
      )}

      {tab === 'campaigns' && <CampaignPanel coupons={coupons ?? []} />}
    </div>
  );
}
