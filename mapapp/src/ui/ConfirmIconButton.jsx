// ConfirmIconButton — two-step "click to arm, click again to run" icon.
//
// Before this primitive, StudioPage's pack-delete flow owned ~30 lines
// of inline state + two rendered branches (armed vs. idle) to implement
// "click × → warning row → click ✓ to confirm, click anything else to
// cancel". This component wraps that flow in a single element:
//
//   First click       → swaps to `armed` variant (rose glow)
//   Second click      → fires onConfirm(), resets
//   External timeout  → auto-cancel after `resetAfterMs` (default 6000)
//
// Props:
//   onConfirm         — called on the second click
//   title / armedTitle — tooltip in each state
//   children          — idle glyph (usually `×`)
//   armedChildren     — armed glyph (usually `✓`)
//   size / shape      — forwarded to IconButton
//   disabled          — disables the whole control
//
// Cancellation: the component does NOT handle "click outside to cancel"
// because that's scope-creep; the time-out is enough for the two
// primary use cases (pack delete, destructive settings reset).

import React, { useEffect, useState } from 'react';
import IconButton from './IconButton.jsx';

export default function ConfirmIconButton({
  onConfirm,
  title = 'Delete',
  armedTitle = 'Click again to confirm',
  children = '×',
  armedChildren = '✓',
  size = 28,
  shape = 'square',
  disabled = false,
  resetAfterMs = 6000,
  className = '',
  ...rest
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const h = setTimeout(() => setArmed(false), resetAfterMs);
    return () => clearTimeout(h);
  }, [armed, resetAfterMs]);

  function onClick(e) {
    e.stopPropagation();
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    onConfirm?.(e);
  }

  return (
    <IconButton
      armed={armed}
      variant="danger"
      title={armed ? armedTitle : title}
      onClick={onClick}
      size={size}
      shape={shape}
      disabled={disabled}
      className={className}
      {...rest}
    >
      {armed ? armedChildren : children}
    </IconButton>
  );
}
