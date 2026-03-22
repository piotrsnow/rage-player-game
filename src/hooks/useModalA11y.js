import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(onClose) {
  const containerRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const prev = document.activeElement;
    if (containerRef.current) {
      const first = containerRef.current.querySelector(FOCUSABLE_SELECTOR);
      first?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [onClose]);

  return containerRef;
}
