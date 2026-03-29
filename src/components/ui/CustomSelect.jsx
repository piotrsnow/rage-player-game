import { useEffect, useMemo, useRef, useState } from 'react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = '',
  disabled = false,
  className = '',
  buttonClassName = '',
  menuClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const normalized = useMemo(
    () => (Array.isArray(options) ? options.filter((opt) => opt && Object.prototype.hasOwnProperty.call(opt, 'value')) : []),
    [options]
  );
  const selected = normalized.find((opt) => opt.value === value) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative ${open ? 'z-[80]' : 'z-0'} ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-surface-container-high/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-left text-sm text-on-surface disabled:opacity-50 ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label || placeholder || ''}</span>
        <span className="material-symbols-outlined text-sm text-outline">{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 w-full max-h-64 overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/25 bg-surface-container-highest/95 backdrop-blur-md shadow-2xl ${menuClassName}`}
          role="listbox"
        >
          {normalized.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={`${opt.value}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (opt.value !== value) onChange?.(opt.value);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary/20 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                }`}
                role="option"
                aria-selected={isSelected}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
