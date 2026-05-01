// PreviewSection — thin subscription boundary around <PreviewPanel>.
//
// Lets CharGenPage avoid reading `previewCanvas`/`rendering`/`previewWarnings`
// from the chargen store directly. Those fields update on every recompose
// (every paint / slot change), and if the page reads them, every paint
// forces the whole page tree (toolbar, slot tree, actors library) to
// re-render. Hoisting them here narrows that to just the preview
// subtree. See `mapapp_perf_pass` plan §13.

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChargenStore } from '../useChargenStore.js';
import PreviewPanel from './PreviewPanel.jsx';

export default function PreviewSection({ animId, animMap, onAnim }) {
  const { previewCanvas } = useChargenStore(
    useShallow((s) => ({
      previewCanvas: s.previewCanvas,
      rendering: s.rendering,
      previewWarnings: s.previewWarnings,
    })),
  );

  return (
    <PreviewPanel
      previewCanvas={previewCanvas}
      animId={animId}
      animMap={animMap}
      onAnim={onAnim}
    />
  );
}
