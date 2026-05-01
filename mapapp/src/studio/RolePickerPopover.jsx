// RolePickerPopover — 3×3 "super-compass" for assigning an autotile role
// to one or more cells in AutotileGroupPicker's interactive grid.
//
// Grid layout (matches cardinal intuition):
//   NW  N   NE
//   W   *   E
//   SW  S   SE
//
// The 4 corner cells pick corner_NW/NE/SE/SW (toggle to inner_* via the
// "zew./wew." switch), the 4 edge cells select edge_N/E/S/W, and the
// center lets the user pick `fill` / `inner` or clear.
// A dedicated "Clear" button removes the assignment.
//
// Rendering:
//   The popover renders into document.body via a portal with
//   `position: fixed`. This is critical: the sidebar SectionCard uses
//   `overflow-hidden`, and sticky headers of neighbouring sections have
//   their own z-index. Anchoring inside the card would cause the
//   popover to be clipped or covered — classic symptom the user reported
//   as "controler jest przykrywany przez header". Fixed + portal sidesteps
//   both problems and lets us place the picker next to the clicked
//   cell regardless of scroll ancestors.
//
// Props:
//   anchorRect   DOMRect-like of the anchor element (clicked cell or
//                the selection bbox). Used to position the popover.
//                When null, the popover is hidden.
//   currentRole  string | null  (single-select path; role of the anchor
//                cell, used only to highlight the matching button).
//   selectionCount  number  (purely informational — shown in the header
//                when > 1 so the user knows the pick applies to N cells).
//   onPick(role) role string or null (null = clear) — applied to every
//                cell currently selected by the parent.
//   onClose()    dismiss without change.

import React from 'react';
import { createPortal } from 'react-dom';
import { ROLE_COLORS, ROLE_BADGE } from '../ui/AutotileLayoutDiagram.jsx';

const EDGE_ROLES = {
  N: 'edge_N',
  E: 'edge_E',
  S: 'edge_S',
  W: 'edge_W',
};

const CORNER_ROLES = {
  NW: 'corner_NW',
  NE: 'corner_NE',
  SE: 'corner_SE',
  SW: 'corner_SW',
};

const INNER_CORNER_ROLES = {
  NW: 'inner_NW',
  NE: 'inner_NE',
  SE: 'inner_SE',
  SW: 'inner_SW',
};

// Popover dimensions are known up-front (fixed cell size × 3 + paddings +
// header + footer). Hard-coding them lets us flip the popover above the
// anchor when it would otherwise overflow the viewport without needing a
// measurement pass.
const POPOVER_W = 200;
const POPOVER_H = 230;
const ANCHOR_GAP = 6;

function CellButton({ role, label, currentRole, onPick, title }) {
  const isActive = role === currentRole;
  const color = role ? ROLE_COLORS[role] : 'rgba(148,163,184,0.2)';
  return (
    <button
      type="button"
      onClick={() => onPick(role)}
      title={title || role || 'clear'}
      className="rounded border border-white/10 hover:border-white/40 transition-colors"
      style={{
        background: color,
        width: 42,
        height: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(15,23,42,0.9)',
        textShadow: '0 0 2px rgba(255,255,255,0.8)',
        outline: isActive ? '2px solid rgba(250,204,21,0.95)' : 'none',
        outlineOffset: -2,
      }}
    >
      {label}
    </button>
  );
}

function computePosition(anchorRect) {
  if (!anchorRect) return { left: 0, top: 0 };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  // Preferred: below the anchor, horizontally centred on it.
  let left = anchorRect.left + anchorRect.width / 2 - POPOVER_W / 2;
  let top = anchorRect.bottom + ANCHOR_GAP;

  // Flip above if no room below.
  if (top + POPOVER_H > vh - 8) {
    const flipped = anchorRect.top - POPOVER_H - ANCHOR_GAP;
    if (flipped >= 8) top = flipped;
    else top = Math.max(8, vh - POPOVER_H - 8);
  }

  // Clamp horizontally inside viewport.
  if (left + POPOVER_W > vw - 8) left = vw - POPOVER_W - 8;
  if (left < 8) left = 8;
  return { left, top };
}

export default function RolePickerPopover({
  anchorRect = null,
  currentRole = null,
  selectionCount = 1,
  onPick,
  onClose,
}) {
  const [centerMode, setCenterMode] = React.useState(
    currentRole && currentRole.startsWith('inner') && !/_/.test(currentRole.slice(5))
      ? 'inner'
      : 'fill'
  );
  const [cornerMode, setCornerMode] = React.useState(
    currentRole && currentRole.startsWith('inner_') ? 'inner' : 'corner'
  );

  // Dismiss on Escape or outside click. We don't bind to the root
  // `onClick` of the popover itself so clicks inside the picker keep it
  // open (the inner stopPropagation on the root handles that).
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    function onDocClick(e) {
      // Ignore clicks that originated inside the popover or on the
      // anchor cell (the parent re-opens the picker on every click, so
      // without this guard we'd race-close immediately).
      const root = document.getElementById('role-picker-popover-root');
      if (root && root.contains(e.target)) return;
      onClose?.();
    }
    window.addEventListener('keydown', onKey);
    // Defer mouse listener so the same click that opened us doesn't
    // immediately close it (mousedown bubbles after opening click).
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  if (!anchorRect || typeof document === 'undefined') return null;

  const cornerMap = cornerMode === 'inner' ? INNER_CORNER_ROLES : CORNER_ROLES;
  const centerRole = centerMode === 'inner' ? 'inner' : 'fill';
  const pos = computePosition(anchorRect);

  return createPortal(
    <div
      id="role-picker-popover-root"
      className="bg-surface border border-outline rounded-lg shadow-xl p-2"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPOVER_W,
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-semibold text-on-surface-variant">
          Rola komórki
          {selectionCount > 1 && (
            <span className="ml-1 text-primary/90">({selectionCount})</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-on-surface-variant/70 hover:text-on-surface"
          aria-label="Zamknij"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1 mb-1.5 text-[10px]">
        <span className="text-on-surface-variant/70">Narożniki:</span>
        <button
          type="button"
          className={`px-1.5 py-0.5 rounded ${cornerMode === 'corner' ? 'bg-primary/30' : 'bg-white/5'}`}
          onClick={() => setCornerMode('corner')}
        >
          zew.
        </button>
        <button
          type="button"
          className={`px-1.5 py-0.5 rounded ${cornerMode === 'inner' ? 'bg-primary/30' : 'bg-white/5'}`}
          onClick={() => setCornerMode('inner')}
        >
          wew.
        </button>
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: 'repeat(3, 42px)', gridTemplateRows: 'repeat(3, 42px)' }}
      >
        <CellButton role={cornerMap.NW} label={ROLE_BADGE[cornerMap.NW]} currentRole={currentRole} onPick={onPick} />
        <CellButton role={EDGE_ROLES.N} label="N" currentRole={currentRole} onPick={onPick} />
        <CellButton role={cornerMap.NE} label={ROLE_BADGE[cornerMap.NE]} currentRole={currentRole} onPick={onPick} />

        <CellButton role={EDGE_ROLES.W} label="W" currentRole={currentRole} onPick={onPick} />
        <div
          className="rounded border border-white/10 flex flex-col items-center justify-center"
          style={{
            background: ROLE_COLORS[centerRole],
            outline: currentRole === centerRole ? '2px solid rgba(250,204,21,0.95)' : 'none',
            outlineOffset: -2,
          }}
        >
          <button
            type="button"
            onClick={() => onPick(centerRole)}
            title={centerRole}
            className="w-full flex-1 flex items-center justify-center hover:bg-white/5 rounded"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(15,23,42,0.9)',
              textShadow: '0 0 2px rgba(255,255,255,0.8)',
            }}
          >
            {centerMode === 'inner' ? 'I' : 'F'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCenterMode(centerMode === 'inner' ? 'fill' : 'inner');
            }}
            className="text-[8px] underline text-on-surface-variant/80 w-full"
            title="Przełącz środek: fill ↔ inner"
          >
            {centerMode === 'inner' ? '→ fill' : '→ inner'}
          </button>
        </div>
        <CellButton role={EDGE_ROLES.E} label="E" currentRole={currentRole} onPick={onPick} />

        <CellButton role={cornerMap.SW} label={ROLE_BADGE[cornerMap.SW]} currentRole={currentRole} onPick={onPick} />
        <CellButton role={EDGE_ROLES.S} label="S" currentRole={currentRole} onPick={onPick} />
        <CellButton role={cornerMap.SE} label={ROLE_BADGE[cornerMap.SE]} currentRole={currentRole} onPick={onPick} />
      </div>

      <div className="flex gap-1 mt-2">
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex-1 text-[10px] py-1 rounded bg-white/5 hover:bg-white/10 text-on-surface-variant"
        >
          Wyczyść
        </button>
      </div>
    </div>,
    document.body
  );
}
