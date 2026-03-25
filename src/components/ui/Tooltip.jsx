import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ children, content, className = '' }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    const pad = 8;

    let top = rect.top - tip.height - pad;
    let left = rect.left + rect.width / 2 - tip.width / 2;

    if (top < pad) top = rect.bottom + pad;
    if (left < pad) left = pad;
    if (left + tip.width > window.innerWidth - pad) left = window.innerWidth - tip.width - pad;

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (visible) updatePosition();
  }, [visible, updatePosition]);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`cursor-help ${className}`}
        tabIndex={0}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[9999] max-w-xs px-3 py-2 text-xs text-on-surface bg-surface-container-highest border border-outline-variant/20 rounded-sm shadow-xl backdrop-blur-xl animate-fade-in pointer-events-none"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
