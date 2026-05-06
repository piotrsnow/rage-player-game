// Sidebar shell — replaces the inline `SIDEBAR_CLS` / `RIGHT_CLS` /
// `INSPECTOR_CLS` constants that were duplicated in CharGenPage,
// EditorPage and StudioPage.
//
// Usage:
//   <Sidebar side="left">
//     <MapBar />
//     <LayersPanel />
//   </Sidebar>
//
//   <Sidebar side="right" width={360}>...</Sidebar>
//
// The body becomes a flex column with a generous gap so SectionCards get
// room to breathe. Border side and rounding are set from the `side`
// prop. Overflow is always `auto` so long sections scroll independently
// from the main canvas.

import React from 'react';

export default function Sidebar({
  side = 'left',
  width = 260,
  className = '',
  style,
  children,
  ...rest
}) {
  const borderSide = side === 'right' ? 'border-l' : 'border-r';
  return (
    <aside
      className={[
        'glass-panel-elevated',
        borderSide,
        'border-outline-variant/15',
        'p-3 flex flex-col gap-3',
        'overflow-auto custom-scrollbar',
        'shrink-0',
        className,
      ].join(' ')}
      style={{ width, ...style }}
      {...rest}
    >
      {children}
    </aside>
  );
}
