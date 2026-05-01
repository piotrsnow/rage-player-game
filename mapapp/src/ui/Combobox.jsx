// Combobox — single field that combines <input> + chevron + filtered
// dropdown. Replaces the `Input list=… + <datalist> + row-of-chips` pattern
// used across studio inspectors where a trait/tag key has a per-pack
// vocabulary but callers also need to accept free-form values.
//
// Why custom instead of <datalist>:
//   - native <datalist> has inconsistent styling / no chevron affordance
//     across browsers, and can't drive hover callbacks for preview UX
//     (TileInspector highlights matching tiles on option hover).
//   - chip rows duplicate the list and eat vertical space.
//
// API:
//   <Combobox
//     value={string}
//     onChange={(value: string) => void}
//     options={string[]}
//     placeholder={string}
//     allowCustom={boolean}   // default true — Enter accepts value outside list
//     mixed={boolean}          // italic + placeholder override
//     size="md"                // matches Input sizes
//     className={string}
//     onOptionHover={(value: string | null) => void}
//   />
//
// Keyboard:
//   - ArrowDown/ArrowUp — move highlight through filtered options.
//   - Enter — if an option is highlighted, pick it. Otherwise (and if
//     `allowCustom`), accept the raw input text as the value.
//   - Escape — close dropdown without changing value.
//   - Tab / click-outside / blur (with a click-swallowing delay) — close.
//
// Option selection uses `onMouseDown` (preventDefault) so the pick fires
// before the input's blur/close race condition kicks in. The outside-click
// listener is scoped to `mousedown` at document level.

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

const BASE =
  'w-full box-border font-body text-on-surface ' +
  'bg-surface-container/70 backdrop-blur border border-outline-variant/30 ' +
  'rounded-sm ' +
  'placeholder:text-on-surface-variant/50 ' +
  'focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150';

const SIZES = {
  sm: 'text-xs px-2 py-1 pr-7',
  md: 'text-sm px-3 py-1.5 pr-8',
  lg: 'text-base px-4 py-2 pr-9',
};

const CHEVRON_POS = {
  sm: 'right-1.5',
  md: 'right-2',
  lg: 'right-2.5',
};

const Combobox = forwardRef(function Combobox(
  {
    value = '',
    onChange,
    options = [],
    placeholder,
    allowCustom = true,
    mixed = false,
    size = 'md',
    className = '',
    onOptionHover,
    disabled = false,
    id,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useRef(`combobox-list-${Math.random().toString(36).slice(2, 10)}`);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Forward the inner <input> ref so parents can focus()/select() if they want.
  useEffect(() => {
    if (typeof ref === 'function') ref(inputRef.current);
    else if (ref) ref.current = inputRef.current;
  }, [ref]);

  const hasOptions = options.length > 0;

  const filtered = useMemo(() => {
    if (!hasOptions) return [];
    const q = (value || '').trim().toLowerCase();
    if (!q) return options;
    // If the query exactly matches one of the options, show the full list so
    // the user can see they're "in the vocab" and pick something else.
    if (options.some((o) => o.toLowerCase() === q)) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, value, hasOptions]);

  // Outside-click: close the dropdown. `mousedown` (not `click`) so the
  // document listener fires before focus moves / before the input's blur
  // handler would race with option-click.
  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setHighlight(-1);
        onOptionHover?.(null);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, onOptionHover]);

  // Clamp highlight when the filtered list shrinks (e.g. user keeps typing).
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(filtered.length - 1);
  }, [filtered.length, highlight]);

  function openDropdown() {
    if (!hasOptions || disabled) return;
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setHighlight(-1);
    onOptionHover?.(null);
  }

  function commit(next) {
    if (next !== value) onChange?.(next);
    closeDropdown();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openDropdown();
      if (!filtered.length) return;
      setHighlight((h) => (h + 1) % filtered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openDropdown();
      if (!filtered.length) return;
      setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1));
      return;
    }
    if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        commit(filtered[highlight]);
        return;
      }
      if (allowCustom) {
        e.preventDefault();
        commit((value || '').trim());
        return;
      }
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        closeDropdown();
      }
    }
  }

  const sizeClass = SIZES[size] || SIZES.md;
  const chevronPos = CHEVRON_POS[size] || CHEVRON_POS.md;
  const effectivePlaceholder = mixed ? '— mixed —' : placeholder;
  const inputClass =
    `${BASE} ${sizeClass} ${mixed ? 'italic' : ''} ${hasOptions ? 'cursor-text' : ''}`.trim();

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId.current}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        placeholder={effectivePlaceholder}
        className={inputClass}
        onChange={(e) => {
          onChange?.(e.target.value);
          if (!open) openDropdown();
          setHighlight(-1);
        }}
        onFocus={openDropdown}
        onClick={openDropdown}
        onKeyDown={onKeyDown}
      />
      {hasOptions && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onMouseDown={(e) => {
            // mousedown + preventDefault so the input doesn't lose focus
            // (which would close the dropdown before our toggle runs).
            e.preventDefault();
            if (open) closeDropdown();
            else {
              openDropdown();
              inputRef.current?.focus();
            }
          }}
          className={`absolute top-1/2 -translate-y-1/2 ${chevronPos} flex items-center justify-center w-5 h-5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer bg-transparent border-none p-0`}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path
              d={open ? 'M2 7.5 L6 3.5 L10 7.5' : 'M2 4.5 L6 8.5 L10 4.5'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {open && hasOptions && filtered.length > 0 && (
        <ul
          id={listId.current}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-auto bg-surface-container backdrop-blur border border-outline-variant/40 rounded-sm shadow-lg py-1"
        >
          {filtered.map((opt, idx) => {
            const active = idx === highlight;
            return (
              <li
                key={opt}
                role="option"
                aria-selected={active}
                onMouseEnter={() => {
                  setHighlight(idx);
                  onOptionHover?.(opt);
                }}
                onMouseLeave={() => onOptionHover?.(null)}
                onMouseDown={(e) => {
                  // mousedown → commit before blur; preventDefault keeps
                  // focus in the input so the dropdown close doesn't
                  // race with onBlur.
                  e.preventDefault();
                  commit(opt);
                }}
                className={`px-3 py-1 text-sm cursor-pointer ${
                  active
                    ? 'bg-primary/20 text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container-high/60'
                }`}
              >
                {opt}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default Combobox;
