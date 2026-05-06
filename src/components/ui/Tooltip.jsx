import { useState, useRef, useEffect, useCallback, cloneElement, isValidElement, Children } from 'react';
import { createPortal } from 'react-dom';

const VARIANT_CLASSES = {
  default:
    'max-w-sm px-4 py-3 text-sm leading-relaxed rounded-sm shadow-xl',
  compact:
    'px-2.5 py-1.5 text-xs rounded-sm shadow-lg whitespace-nowrap',
};

const VARIANT_DEFAULTS = {
  default: { delay: 300, hideOnClick: false },
  compact: { delay: 200, hideOnClick: true },
};

const ARROW_SIZE = 6;
const VIEWPORT_PAD = 8;

function computePlacement(triggerRect, tipRect, preferred, offset) {
  const gap = offset;
  const placements = {
    top: {
      top: triggerRect.top - tipRect.height - gap,
      left: triggerRect.left + triggerRect.width / 2 - tipRect.width / 2,
    },
    bottom: {
      top: triggerRect.bottom + gap,
      left: triggerRect.left + triggerRect.width / 2 - tipRect.width / 2,
    },
    left: {
      top: triggerRect.top + triggerRect.height / 2 - tipRect.height / 2,
      left: triggerRect.left - tipRect.width - gap,
    },
    right: {
      top: triggerRect.top + triggerRect.height / 2 - tipRect.height / 2,
      left: triggerRect.right + gap,
    },
  };

  const flipOrder = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom'],
  };

  for (const side of flipOrder[preferred]) {
    const pos = placements[side];
    if (
      pos.top >= VIEWPORT_PAD &&
      pos.left >= VIEWPORT_PAD &&
      pos.top + tipRect.height <= window.innerHeight - VIEWPORT_PAD &&
      pos.left + tipRect.width <= window.innerWidth - VIEWPORT_PAD
    ) {
      return { ...pos, side };
    }
  }

  const fallback = placements[preferred];
  let { top, left } = fallback;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left + tipRect.width > window.innerWidth - VIEWPORT_PAD)
    left = window.innerWidth - tipRect.width - VIEWPORT_PAD;
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
  if (top + tipRect.height > window.innerHeight - VIEWPORT_PAD)
    top = window.innerHeight - tipRect.height - VIEWPORT_PAD;
  return { top, left, side: preferred };
}

function computeCursorPlacement(pointer, tipRect) {
  const pad = 12;
  const cursorOffset = 18;

  let top = pointer.clientY - tipRect.height - cursorOffset;
  let left = pointer.clientX - tipRect.width / 2;
  if (top < pad) top = pointer.clientY + cursorOffset;
  if (left < pad) left = pad;
  if (left + tipRect.width > window.innerWidth - pad)
    left = window.innerWidth - tipRect.width - pad;
  if (top + tipRect.height > window.innerHeight - pad)
    top = window.innerHeight - tipRect.height - pad;
  if (top < pad) top = pad;

  return { top, left, side: 'top' };
}

function mergeRefs(...refs) {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref != null) ref.current = node;
    }
  };
}

const ARROW_STYLES = {
  top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-t-surface-container-highest border-x-transparent border-b-transparent',
  bottom: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full border-b-surface-container-highest border-x-transparent border-t-transparent',
  left: 'right-0 top-1/2 -translate-y-1/2 translate-x-full border-l-surface-container-highest border-y-transparent border-r-transparent',
  right: 'left-0 top-1/2 -translate-y-1/2 -translate-x-full border-r-surface-container-highest border-y-transparent border-l-transparent',
};

export default function Tooltip({
  children,
  content,
  className = '',
  tooltipClassName = '',
  placement = 'top',
  variant = 'default',
  asChild = false,
  hideOnClick,
  arrow = false,
  offset = 8,
  delay,
  disabled = false,
}) {
  const defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.default;
  const resolvedDelay = delay ?? defaults.delay;
  const resolvedHideOnClick = hideOnClick ?? defaults.hideOnClick;

  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [resolvedSide, setResolvedSide] = useState(placement);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const pointerRef = useRef(null);

  const updatePosition = useCallback(
    (pointer) => {
      if (!tooltipRef.current) return;
      const tipRect = tooltipRef.current.getBoundingClientRect();

      if (!asChild && pointer?.clientX != null && pointer?.clientY != null) {
        const result = computeCursorPlacement(pointer, tipRect);
        setCoords({ top: result.top, left: result.left });
        setResolvedSide(result.side);
        return;
      }

      if (!triggerRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const result = computePlacement(triggerRect, tipRect, placement, offset);
      setCoords({ top: result.top, left: result.left });
      setResolvedSide(result.side);
    },
    [placement, offset, asChild],
  );

  useEffect(() => {
    if (visible) updatePosition(pointerRef.current);
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!visible) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        clearTimeout(timeoutRef.current);
        setVisible(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [visible]);

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), resolvedDelay);
  }, [resolvedDelay]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const handleMouseMove = useCallback(
    (event) => {
      pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (visible) updatePosition(pointerRef.current);
    },
    [visible, updatePosition],
  );

  const handleClick = useCallback(
    (event) => {
      if (resolvedHideOnClick) {
        clearTimeout(timeoutRef.current);
        setVisible(false);
      }
      if (asChild && isValidElement(children)) {
        children.props.onClick?.(event);
      }
    },
    [resolvedHideOnClick, asChild, children],
  );

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  if (!content || disabled) return asChild ? children : <>{children}</>;

  const tooltipNode = visible
    ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{ top: coords.top, left: coords.left }}
          className={`fixed z-[9999] text-on-surface bg-surface-container-highest border border-outline-variant/20 backdrop-blur-xl animate-fade-in pointer-events-none ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.default} ${tooltipClassName}`.trim()}
        >
          {content}
          {arrow && (
            <span
              className={`absolute w-0 h-0 border-solid ${ARROW_STYLES[resolvedSide]}`}
              style={{ borderWidth: ARROW_SIZE }}
            />
          )}
        </div>,
        document.body,
      )
    : null;

  if (asChild) {
    const child = Children.only(children);
    const cloned = cloneElement(child, {
      ref: mergeRefs(triggerRef, child.ref),
      onMouseEnter: (e) => {
        show();
        child.props.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        hide();
        child.props.onMouseLeave?.(e);
      },
      onFocus: (e) => {
        show();
        child.props.onFocus?.(e);
      },
      onBlur: (e) => {
        hide();
        child.props.onBlur?.(e);
      },
      onClick: handleClick,
    });

    return (
      <>
        {cloned}
        {tooltipNode}
      </>
    );
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseMove={handleMouseMove}
        onFocus={show}
        onBlur={hide}
        onClick={resolvedHideOnClick ? hide : undefined}
        className={`cursor-help ${className}`}
        tabIndex={0}
      >
        {children}
      </span>
      {tooltipNode}
    </>
  );
}
