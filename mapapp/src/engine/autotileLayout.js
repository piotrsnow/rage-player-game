// Pure layout math shared between the Studio UI (AutotileGroupPicker,
// TileInfoCard, TileInfoPin) and the TileGrid overlay renderer.
//
// Previously this lived inside `AutotileGroupPicker.jsx`, which meant
// TileGrid — and the InfoCard/InfoPin — had to import a heavy React
// component file (RolePickerPopover, AutotileLayoutDiagram, Toasts, api
// client, …) just to compute "how many cells does an `rpgmaker_a2`
// group occupy?". Pulling it down to the engine layer keeps the hot
// render path import-cheap.

// Accepts either a layout string (legacy) or an AutotileGroup-like object
// `{ layout, cols?, rows? }`. For layout === 'custom' we honor the explicit
// cols/rows from the group (persisted in the backend), falling back to 2×2.
export function cellsForLayout(group) {
  const layout = typeof group === 'string' ? group : group?.layout;
  switch (layout) {
    case 'rpgmaker_a1': return { cols: 2, rows: 3 };
    case 'rpgmaker_a2': return { cols: 2, rows: 3 };
    case 'wang_2edge': return { cols: 4, rows: 4 };
    case 'blob_47': return { cols: 8, rows: 6 };
    case 'custom': {
      const c = Math.max(1, Math.min(32, Number(group?.cols) || 2));
      const r = Math.max(1, Math.min(32, Number(group?.rows) || 2));
      return { cols: c, rows: r };
    }
    default: return { cols: 2, rows: 3 };
  }
}
