import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 操作進行中時不允許關閉，避免中途關掉造成狀態不明 */
  busy?: boolean;
}

/**
 * 對話框。
 *
 * **不使用原生 `<dialog>`。** 它的 `showModal()` 需要 Safari 15.4 以上，
 * 而 LINE 內建瀏覽器跟隨系統 WebView，舊 iOS 上會直接無法開啟 ——
 * 那是完全沒有替代路徑的失敗。改用固定定位的覆蓋層自行實作，
 * 焦點管理與鍵盤操作也一併補上。
 *
 * 透過 portal 掛到 body：頁首是 `position: sticky` 且有 z-index，
 * 對話框若渲染在頁面內容裡會被它蓋住一角。
 */
export function Modal({ title, onClose, children, busy = false }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // 記住開啟前的焦點，關閉時還回去 —— 否則鍵盤使用者會被丟回頁面最上方
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }

    document.addEventListener('keydown', onKeyDown);

    // 背景不該跟著捲動，否則在手機上會出現「對話框沒動但底下在滑」的錯亂
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [busy, onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      // 點背景關閉，但只在真的點到背景時 —— 不加這個判斷的話，
      // 在對話框內按下滑鼠、放開時滑到外面也會誤觸關閉
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <h3 id={titleId} className="modal-title">
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body
  );
}
