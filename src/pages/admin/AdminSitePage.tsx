import { useEffect, useRef, useState } from 'react';
import { callApi, isApiError, validationField } from '../../api/client';
import { useSite } from '../../site/useSite';
import type { SiteSettings } from '../../site/SiteProvider';
import {
  GRADIENT_PRESETS,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEME_NAMES
} from '../../theme/appearance';

/**
 * 網站設定：品牌、文案、聯絡方式、外觀。
 *
 * 所有變更**即時套用**到整個畫面 —— 配色與版面要看整頁的實際效果才判斷得準，
 * 縮在一個小方框裡預覽沒有意義。但要按下儲存才會寫進後端、才對顧客生效。
 */
export default function AdminSitePage() {
  const { savedSite, setSite, previewSite, reload } = useSite();
  const [draft, setDraft] = useState<SiteSettings>(savedSite);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');

  // 使用者是否動過表單。用 ref 而非 state：它只用來決定要不要接受背景
  // 取回的新值，本身不該觸發重繪
  const touched = useRef(false);

  /**
   * 改動即時套用到畫面，但尚未寫入後端。
   *
   * ⚠️ 走 previewSite 而非 setSite。曾經直接把 draft 灌進全域的 site，
   * 造成三個問題：dirty 永遠是 false（兩者永遠相等）、未儲存的值被寫進
   * localStorage 跟著跑到其他頁面、背景重新取回時會用舊值蓋掉別人剛存的設定。
   */
  function update(patch: Partial<SiteSettings>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    previewSite(next);
    touched.current = true;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedSite);

  // Apps Script 一次往返要一到十幾秒，背景取回很可能比本頁掛載還晚。
  // 使用者還沒動過表單就跟上新值，動過就不覆蓋他正在編輯的內容
  useEffect(() => {
    if (!touched.current) {
      setDraft(savedSite);
    }
  }, [savedSite]);

  // 離開頁面時取消預覽，否則未儲存的店名與配色會跟著使用者跑到其他頁面
  useEffect(() => () => previewSite(null), [previewSite]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    setError('');
    setErrorField('');

    try {
      const data = await callApi('adminUpdateSiteSettings', {
        siteName: draft.siteName,
        logoUrl: draft.logoUrl,
        tagline: draft.tagline,
        description: draft.description,
        contactPhone: draft.contactPhone,
        contactAddress: draft.contactAddress,
        lineUrl: draft.lineUrl,
        businessNote: draft.businessNote,
        theme: draft.theme,
        backgroundType: draft.backgroundType,
        backgroundImageUrl: draft.backgroundImageUrl,
        backgroundGradient: draft.backgroundGradient,
        backgroundOverlay: draft.backgroundOverlay
      });
      setDraft(data.site);
      setSite(data.site);
      touched.current = false;
      setMessage('已儲存，顧客端會立即看到新的設定。');
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

  async function handleDiscard() {
    // 從後端重新取回，把畫面上未儲存的改動丟掉。
    // 用 reload 的回傳值，不能用閉包裡的 savedSite —— 那是這次 render
    // 當下捕捉到的舊值，還原後又會變回未儲存的內容
    const fresh = await reload();
    setDraft(fresh);
    previewSite(null);
    touched.current = false;
    setMessage('');
    setError('');
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>網站設定</h1>
        <div className="actions" style={{ marginTop: 0 }}>
          {dirty && (
            <button type="button" className="secondary" onClick={() => void handleDiscard()}>
              放棄變更
            </button>
          )}
          <button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      {!savedSite.configured && (
        <p className="notice">
          尚未設定過，目前顯示的是預設值。<strong>按下儲存之後才會對顧客生效。</strong>
        </p>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {dirty && !message && (
        <p className="notice">
          畫面已即時套用你的變更，但<strong>尚未儲存</strong> —— 顧客看到的還是舊的設定。
        </p>
      )}

      <section className="card">
        <h2>品牌</h2>

        <div className="field">
          <label htmlFor="s-name">店名</label>
          <input
            id="s-name"
            value={draft.siteName}
            onChange={(e) => update({ siteName: e.target.value })}
            maxLength={60}
            aria-invalid={errorField === 'siteName'}
          />
          <p className="hint">顯示在導覽列與瀏覽器分頁標題。</p>
        </div>

        <div className="field">
          <label htmlFor="s-logo">Logo 網址</label>
          <input
            id="s-logo"
            type="url"
            value={draft.logoUrl}
            onChange={(e) => update({ logoUrl: e.target.value })}
            placeholder="https://..."
            aria-invalid={errorField === 'logoUrl'}
          />
          <p className="hint">
            必須是 https 開頭的公開網址。第一階段不使用 Firebase Storage，
            請先放外部圖床。可留空，留空時顯示店名文字。
          </p>
        </div>

        {draft.logoUrl.startsWith('https://') && (
          <div className="field">
            <img src={draft.logoUrl} alt="" className="image-preview" />
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>首頁文案</h2>

        <div className="field">
          <label htmlFor="s-tagline">標語</label>
          <input
            id="s-tagline"
            value={draft.tagline}
            onChange={(e) => update({ tagline: e.target.value })}
            maxLength={100}
            placeholder="讓皮膚回到最舒服的樣子"
          />
        </div>

        <div className="field">
          <label htmlFor="s-desc">介紹</label>
          <textarea
            id="s-desc"
            rows={4}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            maxLength={2000}
          />
        </div>

        <div className="field">
          <label htmlFor="s-note">營業說明</label>
          <textarea
            id="s-note"
            rows={3}
            value={draft.businessNote}
            onChange={(e) => update({ businessNote: e.target.value })}
            maxLength={2000}
            placeholder="採預約制，請提前一天預約"
          />
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>聯絡方式</h2>

        <div className="field">
          <label htmlFor="s-phone">電話</label>
          <input
            id="s-phone"
            value={draft.contactPhone}
            onChange={(e) => update({ contactPhone: e.target.value })}
            maxLength={50}
          />
          <p className="hint">自由填寫，可加註記，例如「02-1234-5678（週二公休）」。</p>
        </div>

        <div className="field">
          <label htmlFor="s-address">地址</label>
          <input
            id="s-address"
            value={draft.contactAddress}
            onChange={(e) => update({ contactAddress: e.target.value })}
            maxLength={200}
          />
        </div>

        <div className="field">
          <label htmlFor="s-line">LINE 官方帳號連結</label>
          <input
            id="s-line"
            type="url"
            value={draft.lineUrl}
            onChange={(e) => update({ lineUrl: e.target.value })}
            placeholder="https://lin.ee/..."
            aria-invalid={errorField === 'lineUrl'}
          />
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>配色主題</h2>
        <div className="theme-grid">
          {THEME_NAMES.map((name) => (
            <button
              type="button"
              key={name}
              className={`theme-card${draft.theme === name ? ' is-selected' : ''}`}
              onClick={() => update({ theme: name })}
              aria-pressed={draft.theme === name}
            >
              <span className={`theme-swatch theme-swatch--${name}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="theme-name">{THEME_LABELS[name]}</span>
              <span className="hint">{THEME_DESCRIPTIONS[name]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--space-5)' }}>
        <h2>頁面背景</h2>

        <div className="field">
          <label htmlFor="s-bg-type">背景類型</label>
          <select
            id="s-bg-type"
            value={draft.backgroundType}
            onChange={(e) =>
              update({ backgroundType: e.target.value as SiteSettings['backgroundType'] })
            }
          >
            <option value="none">純色（使用主題底色）</option>
            <option value="gradient">漸層</option>
            <option value="image">圖片</option>
          </select>
        </div>

        {draft.backgroundType === 'gradient' && (
          <div className="field">
            <label>漸層</label>
            <div className="gradient-grid">
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className={`gradient-card${
                    draft.backgroundGradient === preset.value ? ' is-selected' : ''
                  }`}
                  style={{ backgroundImage: preset.value }}
                  onClick={() => update({ backgroundGradient: preset.value })}
                  aria-pressed={draft.backgroundGradient === preset.value}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {draft.backgroundType === 'image' && (
          <div className="field">
            <label htmlFor="s-bg-url">背景圖網址</label>
            <input
              id="s-bg-url"
              type="url"
              value={draft.backgroundImageUrl}
              onChange={(e) => update({ backgroundImageUrl: e.target.value })}
              placeholder="https://..."
              aria-invalid={errorField === 'backgroundImageUrl'}
            />
            <p className="hint">
              必須是 https。http 圖片會被瀏覽器以混合內容擋掉，背景會變成空白而且沒有錯誤提示。
            </p>
          </div>
        )}

        {draft.backgroundType !== 'none' && (
          <div className="field">
            <label htmlFor="s-overlay">遮罩濃度：{draft.backgroundOverlay}%</label>
            <input
              id="s-overlay"
              type="range"
              min={0}
              max={100}
              value={draft.backgroundOverlay}
              onChange={(e) => update({ backgroundOverlay: Number(e.target.value) })}
            />
            <p className="hint">
              背景與文字之間的一層底色。數值越高背景越淡、文字越清楚。
              背景越花需要的濃度越高 —— 請確認正文在目前設定下仍讀得清楚。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
