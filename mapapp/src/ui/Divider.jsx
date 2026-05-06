// Divider — horizontal hairline with a subtle gradient.
//
// Used *inside* a SectionCard when a single card has several sub-areas
// (e.g. TileInspector: Atoms / Traits / Tags) and each sub-heading would
// otherwise float in space. Using a Divider instead of another heading
// is much cleaner than stacking multiple uppercase labels.

import React from 'react';

export default function Divider({ className = '' }) {
  return (
    <div
      role="separator"
      aria-hidden="true"
      className={[
        'h-px w-full my-1',
        'bg-gradient-to-r from-transparent via-outline-variant/40 to-transparent',
        className,
      ].join(' ')}
    />
  );
}
