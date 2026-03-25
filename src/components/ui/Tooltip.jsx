import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ children, content, className = '' }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const pointerRef = useRef(null);

  const updatePosition = useCallback((pointer) => {
    if (!tooltipRef.current) return;
    const tip = tooltipRef.current.getBoundingClientRect();
    const pad = 12;
    const cursorOffset = 18;

    let top;
    let left;

    if (pointer?.clientX != null && pointer?.clientY != null) {
      top = pointer.clientY - tip.height - cursorOffset;
      left = pointer.clientX - tip.width / 2;

      if (top < pad) top = pointer.clientY + cursorOffset;
    } else {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      top = rect.top - tip.height - pad;
      left = rect.left + rect.width / 2 - tip.width / 2;

      if (top < pad) top = rect.bottom + pad;
    }

    if (left < pad) left = pad;
    if (left + tip.width > window.innerWidth - pad) left = window.innerWidth - tip.width - pad;
    if (top + tip.height > window.innerHeight - pad) top = window.innerHeight - tip.height - pad;
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (visible) updatePosition(pointerRef.current);
  }, [visible, updatePosition]);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const handleMouseMove = (event) => {
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (visible) updatePosition(pointerRef.current);
  };

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseMove={handleMouseMove}
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
            className="fixed z-[9999] max-w-sm px-4 py-3 text-sm leading-relaxed text-on-surface bg-surface-container-highest border border-outline-variant/20 rounded-sm shadow-xl backdrop-blur-xl animate-fade-in pointer-events-none"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
