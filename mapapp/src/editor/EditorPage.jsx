// EditorPage — top-level Map Editor shell.
//
// This file is now a thin orchestrator:
//   - fetches packs + maps on mount
//   - installs `beforeunload` guard for dirty docs
//   - delegates palette building, tool dispatch, keyboard shortcuts
//     and I/O to purpose-built hooks
//   - composes the sidebars from MapBar, LayersPanel, ActorsPanel,
//     PacksSection, MapsLibrary
//
// Keyboard shortcuts installed at the page level (via
// `useEditorShortcuts`):
//   B/R/F/E/A/W/S      → tool
//   G                  → toggle grid
//   C                  → toggle collision overlay
//   1/2/3              → layer ground/overlay/objects
//   Ctrl+Z / Cmd+Z     → undo / redo (with Shift)
//   Ctrl+Y             → redo
//   Ctrl+S             → save map
//   Ctrl+C / Ctrl+V    → copy / paste selection (tool=select first)
//   Escape             → clear selection
//   ?                  → open shortcuts modal

import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { TOOLS, useEditorStore } from './useEditorStore.js';
import MapCanvas from './MapCanvas.jsx';
import ToolPalette from './ToolPalette.jsx';
import Palette from './Palette.jsx';
import LayersPanel from './LayersPanel.jsx';
import ActorsPanel from './ActorsPanel.jsx';
import NpcPlaceInspector from './NpcPlaceInspector.jsx';
import ShortcutsModal from './ShortcutsModal.jsx';
import TutorialProvider from '../tutorial/TutorialProvider.jsx';
import { useTutorialStore } from '../tutorial/useTutorialStore.js';
import { EDITOR_STEPS } from './tutorial/steps.js';
import { useToasts } from '../ui/Toasts.jsx';
import Sidebar from '../ui/Sidebar.jsx';
import MapBar from './MapBar.jsx';
import PacksSection from './PacksSection.jsx';
import MapsLibrary from './MapsLibrary.jsx';
import StatusBar from './StatusBar.jsx';
import SectionCard from '../ui/SectionCard.jsx';
import { useEditorShortcuts } from './useEditorShortcuts.js';
import { usePaletteBuilder } from './usePaletteBuilder.js';
import { useMapIO } from './useMapIO.js';
import { useToolDispatch } from './useToolDispatch.js';

export default function EditorPage() {
  const toasts = useToasts();
  const [packs, setPacks] = useState([]);
  const [maps, setMaps] = useState([]);
  const [selectedPackIds, setSelectedPackIds] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const tool = useEditorStore((s) => s.tool);
  const activeLayer = useEditorStore((s) => s.activeLayer);
  const dirty = useEditorStore((s) => s.dirty);
  const mapId = useEditorStore((s) => s.mapId);
  const selection = useEditorStore((s) => s.selection);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m] = await Promise.all([api.listPacks(), api.listMaps()]);
        if (cancelled) return;
        setPacks(p);
        setMaps(m);
      } catch (err) {
        if (!cancelled) toasts.show(`Load failed: ${err.message}`, { level: 'error' });
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    })();
    return () => { cancelled = true; };
     
  }, []);

  // Warn on browser close / reload when the map has unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!useEditorStore.getState().dirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const paletteBuilder = usePaletteBuilder({
    selectedPackIds,
    onError: (err) => toasts.show(`Palette build failed: ${err.message}`, { level: 'error' }),
  });
  const {
    palette,
    paletteLoading,
    setPaletteLoading,
    groupsByTileset,
    setGroupsByTileset,
    wallCandidates,
    setWallCandidates,
    build: buildPalette,
    textureUrls,
  } = paletteBuilder;

  const {
    saving, loadingMapId, saveMap, loadMap, newMap,
  } = useMapIO({
    toasts,
    setMaps,
    setSelectedPackIds,
    setGroupsByTileset,
    setWallCandidates,
    setPaletteLoading,
    buildPalette,
  });

  const { onPaint, hoverCellRef } = useToolDispatch({
    groupsByTileset,
    wallCandidates,
    palette,
    toasts,
  });

  useEditorShortcuts({
    saveMap,
    toasts,
    onToggleShortcuts: () => setShowShortcuts((v) => !v),
  });
  // Wire the hover ref from the tool dispatcher into MapCanvas indirectly
  // via a shared module-scope ref: the dispatcher writes to
  // `hoverCellRef.current` on every move event, and the shortcut hook
  // reads it for Ctrl+V. Exposed here for future extensions.
  void hoverCellRef;

  function togglePack(packId, on) {
    setSelectedPackIds((prev) => (
      on ? [...prev, packId] : prev.filter((id) => id !== packId)
    ));
  }

  const isObjectTool = tool === TOOLS.npcPlace || tool === TOOLS.playerStart;

  return (
    <div className="flex h-full min-h-0">
      <Sidebar side="left">
        <MapBar onNew={() => newMap(selectedPackIds)} onSave={saveMap} saving={saving} />
        <LayersPanel />
        <ActorsPanel />
        <PacksSection
          packs={packs}
          selectedPackIds={selectedPackIds}
          onToggle={togglePack}
          loading={paletteLoading}
          initialLoad={initialLoad}
        />
        <MapsLibrary
          maps={maps}
          mapId={mapId}
          loadingMapId={loadingMapId}
          initialLoad={initialLoad}
          onLoad={loadMap}
        />
      </Sidebar>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="px-3 py-2 glass-panel border-b border-outline-variant/20">
          <ToolPalette />
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-3" data-tutorial-id="map-canvas">
          <MapCanvas onPaint={onPaint} textureUrls={textureUrls} selectionRect={selection} />
        </div>
        <StatusBar
          tool={tool}
          activeLayer={activeLayer}
          dirty={dirty}
          loadingMapId={loadingMapId}
          paletteLoading={paletteLoading}
          onOpenTutorial={() => useTutorialStore.getState().start({
            tutorialId: 'mapEditor', steps: EDITOR_STEPS, force: true,
          })}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />
      </main>

      <Sidebar side="right" width={320}>
        {isObjectTool && (
          <SectionCard title="Object" accent="rose">
            <NpcPlaceInspector />
          </SectionCard>
        )}
        <SectionCard
          title="Palette"
          accent="primary"
          bodyClassName="!p-0 !flex-1 min-h-0"
          className="flex-1 min-h-0"
        >
          <Palette textureUrls={textureUrls} />
        </SectionCard>
      </Sidebar>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      <TutorialProvider
        tutorialId="mapEditor"
        steps={EDITOR_STEPS}
        sourceStore={useEditorStore}
      />
    </div>
  );
}
