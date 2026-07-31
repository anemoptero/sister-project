import { useAppearance } from '../../theme/useAppearance';
import {
  GRADIENT_PRESETS,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEME_NAMES,
  type BackgroundType
} from '../../theme/appearance';

const BACKGROUND_LABELS: Record<BackgroundType, string> = {
  none: '純色（使用主題底色）',
  gradient: '漸層',
  image: '圖片'
};

/**
 * 外觀設定。
 *
 * 所有變更**即時套用**到整個畫面，不需要按預覽 —— 配色這種東西看整頁的
 * 實際效果才判斷得準，縮在一個小方框裡預覽沒有意義。
 */
export default function AdminAppearancePage() {
  const { appearance, setAppearance, reset } = useAppearance();
  const { background } = appearance;

  function updateBackground(patch: Partial<typeof background>) {
    setAppearance({ ...appearance, background: { ...background, ...patch } });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>外觀設定</h1>
        <button type="button" className="secondary" onClick={reset}>
          回復預設
        </button>
      </div>

      <p className="notice">
        目前設定只保存在<strong>這台裝置</strong>，顧客看到的仍是預設外觀。
        要讓所有訪客都看到，設定需要存進後端 —— 見下方說明。
      </p>

      <section className="card stack">
        <h2>配色主題</h2>
        <div className="theme-grid">
          {THEME_NAMES.map((name) => (
            <button
              type="button"
              key={name}
              className={`theme-card${appearance.theme === name ? ' is-selected' : ''}`}
              onClick={() => setAppearance({ ...appearance, theme: name })}
              aria-pressed={appearance.theme === name}
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

      <section className="card stack" style={{ marginTop: 'var(--space-5)' }}>
        <h2>頁面背景</h2>

        <div className="field">
          <label htmlFor="bg-type">背景類型</label>
          <select
            id="bg-type"
            value={background.type}
            onChange={(e) => updateBackground({ type: e.target.value as BackgroundType })}
          >
            {(Object.keys(BACKGROUND_LABELS) as BackgroundType[]).map((type) => (
              <option key={type} value={type}>
                {BACKGROUND_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {background.type === 'gradient' && (
          <div className="field">
            <label>漸層</label>
            <div className="gradient-grid">
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className={`gradient-card${
                    background.gradient === preset.value ? ' is-selected' : ''
                  }`}
                  style={{ backgroundImage: preset.value }}
                  onClick={() => updateBackground({ gradient: preset.value })}
                  aria-pressed={background.gradient === preset.value}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {background.type === 'image' && (
          <div className="field">
            <label htmlFor="bg-url">圖片網址</label>
            <input
              id="bg-url"
              type="url"
              value={background.imageUrl}
              onChange={(e) => updateBackground({ imageUrl: e.target.value })}
              placeholder="https://..."
            />
            <p className="hint">
              必須是 https 開頭的公開網址。http 圖片會被瀏覽器以混合內容擋掉，
              背景會變成空白而且沒有任何錯誤提示。
            </p>
          </div>
        )}

        {background.type !== 'none' && (
          <div className="field">
            <label htmlFor="bg-overlay">遮罩濃度：{background.overlay}%</label>
            <input
              id="bg-overlay"
              type="range"
              min={0}
              max={100}
              step={1}
              value={background.overlay}
              onChange={(e) => updateBackground({ overlay: Number(e.target.value) })}
            />
            <p className="hint">
              背景與文字之間的一層底色。數值越高背景越淡、文字越清楚。
              背景圖案越花，需要的濃度越高 —— 請確認正文在目前設定下仍讀得清楚。
            </p>
          </div>
        )}
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-5)' }}>
        <h2>為什麼顧客看不到我的設定</h2>
        <p>
          外觀設定目前存在瀏覽器的 localStorage，換一台裝置或換一個瀏覽器就會回到預設值，
          顧客當然也看不到。
        </p>
        <p>
          要讓設定對所有人生效，必須存進 Firestore 並新增兩支 API（一支給管理員寫入、
          一支公開讀取）。這牽涉後端改動與重新部署，需要另外評估。
        </p>
        <p className="hint">
          目前這個頁面的價值在於：主題與背景的資料形狀、套用方式、操作介面都已經定案並實際可用，
          日後接上後端只是換一個設定來源，畫面程式不需要改。
        </p>
      </section>
    </div>
  );
}
