// Tooltip — floating, portal-rendered, JSX-content tooltip.
//
// Why a custom component instead of native `title`:
//   * native title only supports plain strings — we want diagrams, icons, formatted copy
//   * native title has a ~500ms browser-owned delay and no keyboard focus trigger
//   * we need to position above/below/right/left depending on viewport edge
//
// Usage:
//   <Tooltip content={<div>Rich content</div>}>
//     <span>hover me</span>
//   </Tooltip>
//
// Behaviour:
//   * opens 300ms after hover start (mouseenter) or instantly on focus
//   * closes on mouseleave / blur / Escape
//   * positioned via getBoundingClientRect() of the anchor, prefers 'top';
//     falls back to 'bottom' if it would clip above, then to 'right' if
//     content is taller than the row. No floating-ui dependency.
//   * renders via React portal into document.body so overflow:hidden
//     parents (sidebars) can't clip it.

import React, {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const OPEN_DELAY_MS = 300;
const EDGE_PAD = 8;

export default function Tooltip({
  content,
  children,
  placement = 'top',
  delayMs = OPEN_DELAY_MS,
  disabled = false,
}) {
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const timerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, actualPlacement: placement });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (immediate = false) => {
      if (disabled || !content) return;
      clearTimer();
      if (immediate) {
        setOpen(true);
      } else {
        timerRef.current = setTimeout(() => setOpen(true), delayMs);
      }
    },
    [disabled, content, clearTimer, delayMs]
  );

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let actual = placement;
    // Preferred placement calculation, then fall back to the first edge
    // that fits. Order: requested → opposite → right → left.
    const fits = {
      top: a.top - t.height - EDGE_PAD >= 0,
      bottom: a.bottom + t.height + EDGE_PAD <= vh,
      right: a.right + t.width + EDGE_PAD <= vw,
      left: a.left - t.width - EDGE_PAD >= 0,
    };
    if (!fits[actual]) {
      const order = ['top', 'bottom', 'right', 'left'];
      actual = order.find((p) => fits[p]) || placement;
    }

    let top = 0;
    let left = 0;
    switch (actual) {
      case 'top':
        top = a.top - t.height - 6;
        left = a.left + a.width / 2 - t.width / 2;
        break;
      case 'bottom':
        top = a.bottom + 6;
        left = a.left + a.width / 2 - t.width / 2;
        break;
      case 'right':
        top = a.top + a.height / 2 - t.height / 2;
        left = a.right + 6;
        break;
      case 'left':
        top = a.top + a.height / 2 - t.height / 2;
        left = a.left - t.width - 6;
        break;
      default:
        top = a.top;
        left = a.left;
    }
    // Clamp into viewport.
    left = Math.max(EDGE_PAD, Math.min(left, vw - t.width - EDGE_PAD));
    top = Math.max(EDGE_PAD, Math.min(top, vh - t.height - EDGE_PAD));
    setPos({ top, left, actualPlacement: actual });
  }, [open, placement, content]);

  const anchorProps = useMemo(
    () => ({
      ref: (node) => {
        anchorRef.current = node;
        const childRef = children?.ref;
        if (typeof childRef === 'function') childRef(node);
        else if (childRef && typeof childRef === 'object') childRef.current = node;
      },
      onMouseEnter: (e) => {
        show(false);
        children?.props?.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        hide();
        children?.props?.onMouseLeave?.(e);
      },
      onFocus: (e) => {
        show(true);
        children?.props?.onFocus?.(e);
      },
      onBlur: (e) => {
        hide();
        children?.props?.onBlur?.(e);
      },
    }),
    [children, show, hide]
  );

  const anchor = children
    ? cloneElement(children, anchorProps)
    : null;

  if (!content || disabled) return anchor;

  return (
    <>
      {anchor}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="z-[9999] fixed pointer-events-none max-w-[320px] rounded-md border border-outline-variant/40 bg-surface-container-high/95 backdrop-blur-md px-2.5 py-2 text-xs text-on-surface shadow-[0_6px_22px_rgba(0,0,0,0.45)]"
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
