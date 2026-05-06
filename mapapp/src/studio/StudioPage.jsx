// StudioPage — shell for the Tileset Studio.
//
// Layout (unchanged from the big version):
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ [Packs sidebar] │ [TilesetUpload + Tileset tabs + TileGrid]    │
//   │                 │ ────────────────────────────────────────      │
//   │                 │ [TileInspector + AutotileGroupPicker]         │
//   └─────────────────────────────────────────────────────────────────┘
//
// The page used to be ~500 lines with the pack list, delete-confirm
// state machine, ZIP import/export UX and the TileGrid header all
// inlined. That made it hard to tell what the page *does* (load pack
// → load tilesets → load tiles) from what the page *renders*.
//
// Responsibilities that live here:
//   * pack-level callbacks that need toasts + state rebinding
//     (delete, import, ZIP in/out, auto-detect)
//   * the overall three-column layout
//
// Everything else moved out:
//   useStudioFetches — cascading fetch effects
//   PackList         — sidebar list + per-row delete confirmation
//   PackActions      — Export/Import ZIP + Tutorial launcher
//   TilesetTabs      — horizontal row of tileset buttons
//   TilesetHeader    — name + dims + zoom + auto-detect toolbar

import React, { useMemo, useState } from 'react';
import { api, mediaUrlForKey } from '../services/api.js';
import TileGrid from './TileGrid.jsx';
import TileInspector from './TileInspector.jsx';
import TilesetUpload from './TilesetUpload.jsx';
import AutotileGroupPicker from './AutotileGroupPicker.jsx';
import RulesEditor from './RulesEditor.jsx';
import { downloadPackZip, importPackZip } from './packZip.js';
import PackList from './PackList.jsx';
import PackActions from './PackActions.jsx';
import TilesetTabs from './TilesetTabs.jsx';
import TilesetHeader from './TilesetHeader.jsx';
import { useStudioStore } from './useStudioStore.js';
import { useStudioFetches } from './useStudioFetches.js';
import { useBulkSave } from './useBulkSave.js';
import TutorialProvider from '../tutorial/TutorialProvider.jsx';
import { useTutorialStore } from '../tutorial/useTutorialStore.js';
import { STUDIO_STEPS } from './tutorial/steps.js';
import { detectRpgMakerAutotileGroups } from '../engine/autotileDetect.js';
import Spinner from '../ui/Spinner.jsx';
import Sidebar from '../ui/Sidebar.jsx';
import SectionCard from '../ui/SectionCard.jsx';
import { useToasts } from '../ui/Toasts.jsx';

export default function StudioPage() {
  const toasts = useToasts();
  const selectedPackId = useStudioStore((s) => s.selectedPackId);
  const selectPack = useStudioStore((s) => s.selectPack);
  const tilesets = useStudioStore((s) => s.tilesets);
  const setTilesets = useStudioStore((s) => s.setTilesets);
  const selectedTilesetId = useStudioStore((s) => s.selectedTilesetId);
  const selectTileset = useStudioStore((s) => s.selectTileset);
  const tilesByLocalId = useStudioStore((s) => s.tilesByLocalId);
  const setTiles = useStudioStore((s) => s.setTiles);
  const selection = useStudioStore((s) => s.selection);
  const setSelection = useStudioStore((s) => s.setSelection);

  const [detectingGroups, setDetectingGroups] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [showOverlay, setShowOverlay] = useState(false);
  // Sticky-progress banners replace "Importing x.zip…" toasts — a
  // progress bar is worth the extra pixels when a pack might take a
  // few seconds to upload or assemble.
  const [zipImportProgress, setZipImportProgress] = useState(null);
  const [zipExportProgress, setZipExportProgress] = useState(null);

  useBulkSave({ debounceMs: 400 });

  const {
    packs,
    packsLoading,
    tilesetsLoading,
    tilesLoading,
    autotileGroups,
    setAutotileGroups,
    refreshPacks,
  } = useStudioFetches();

  const currentPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) || null,
    [packs, selectedPackId]
  );
  const currentTileset = useMemo(
    () => tilesets.find((t) => t.id === selectedTilesetId) || null,
    [tilesets, selectedTilesetId]
  );

  async function handleDeletePack(pack) {
    const toastId = toasts.show(`Deleting "${pack.name}"…`, { level: 'info', ttl: 0 });
    try {
      await api.deletePack(pack.id);
      if (pack.id === selectedPackId) {
        selectPack(null);
        setTilesets([]);
        setTiles([]);
      }
      await refreshPacks();
      toasts.dismiss(toastId);
      toasts.show(`Deleted "${pack.name}".`, { level: 'success' });
    } catch (err) {
      toasts.dismiss(toastId);
      toasts.show(`Delete failed: ${err.message}`, { level: 'error' });
    }
  }

  async function onImported(result) {
    toasts.show(`Imported pack "${result?.pack?.name}".`, { level: 'success' });
    await refreshPacks();
    if (result?.pack?.id) selectPack(result.pack.id);
  }

  async function onExportZip() {
    if (!selectedPackId) return;
    setZipExportProgress({ phase: 'zip-read', loaded: 0, total: 100, subLabel: 'Starting…' });
    try {
      await downloadPackZip(selectedPackId, {
        onProgress: (p) => setZipExportProgress(p),
      });
      toasts.show('Export OK.', { level: 'success' });
    } catch (err) {
      toasts.show(`Export failed: ${err.message}`, { level: 'error' });
    } finally {
      setZipExportProgress(null);
    }
  }

  async function onImportZip(file) {
    if (!file) return;
    setZipImportProgress({
      phase: 'zip-read', loaded: 0, total: 100, subLabel: `Reading ${file.name}`,
    });
    try {
      const result = await importPackZip(file, { onProgress: (p) => setZipImportProgress(p) });
      toasts.show(`Imported pack "${result?.pack?.name}" from ZIP.`, { level: 'success' });
      await refreshPacks();
      if (result?.pack?.id) selectPack(result.pack.id);
    } catch (err) {
      toasts.show(`ZIP import failed: ${err.message}`, { level: 'error' });
    } finally {
      setZipImportProgress(null);
    }
  }

  async function onAutoDetectGroups() {
    if (!currentTileset) return;
    const proposals = detectRpgMakerAutotileGroups({
      imageWidth: currentTileset.imageWidth,
      imageHeight: currentTileset.imageHeight,
      nativeTilesize: currentTileset.nativeTilesize,
    });
    if (!proposals.length) {
      toasts.show('No RPG Maker A1/A2 patterns detected.', { level: 'warning' });
      return;
    }
    setDetectingGroups(true);
    try {
      for (const p of proposals) {
        await api.createAutotileGroup({
          tilesetId: currentTileset.id,
          name: p.name, layout: p.layout,
          originCol: p.originCol, originRow: p.originRow,
          regionId: '', traits: {},
        });
      }
      const groupRows = await api.listAutotileGroups(currentTileset.id);
      setAutotileGroups(groupRows);
      toasts.show(`Auto-created ${proposals.length} autotile group(s).`, { level: 'success' });
    } catch (err) {
      toasts.show(`Auto-detect failed: ${err.message}`, { level: 'error' });
    } finally {
      setDetectingGroups(false);
    }
  }

  const imageUrl = currentTileset ? mediaUrlForKey(currentTileset.imageKey) : null;

  return (
    <div className="flex h-full min-h-0">
      <Sidebar side="left" width={280}>
        <PackList
          packs={packs}
          loading={packsLoading}
          selectedPackId={selectedPackId}
          onSelect={selectPack}
          onDelete={handleDeletePack}
        />
        <PackActions
          selectedPackId={selectedPackId}
          zipExportProgress={zipExportProgress}
          zipImportProgress={zipImportProgress}
          onExportZip={onExportZip}
          onImportZip={onImportZip}
          onStartTutorial={() =>
            useTutorialStore.getState().start({
              tutorialId: 'studio', steps: STUDIO_STEPS, force: true,
            })
          }
        />
      </Sidebar>

      <main className="flex-1 min-w-0 flex flex-col p-3 gap-3 overflow-auto custom-scrollbar">
        <section data-tutorial-id="studio-upload">
          <TilesetUpload
            onImported={onImported}
            existingPacks={packs}
            defaultTargetPackId={selectedPackId || ''}
          />
        </section>

        {tilesetsLoading && !tilesets.length && (
          <section><Spinner size={14} label="Loading tilesets…" /></section>
        )}

        <TilesetTabs
          tilesets={tilesets}
          loading={tilesetsLoading}
          selectedTilesetId={selectedTilesetId}
          onSelect={selectTileset}
        />

        {currentTileset && (
          <section className="flex flex-col gap-2">
            <TilesetHeader
              tileset={currentTileset}
              tileCount={tilesByLocalId.size}
              zoom={zoom}
              onZoomChange={setZoom}
              detectingGroups={detectingGroups}
              onAutoDetectGroups={onAutoDetectGroups}
              showOverlay={showOverlay}
              onToggleOverlay={() => setShowOverlay((v) => !v)}
            />
            <div
              className="glass-panel p-2 rounded-sm overflow-auto custom-scrollbar relative border border-outline-variant/15"
              data-tutorial-id="studio-tilegrid"
            >
              {tilesLoading && (
                <div className="absolute top-2 right-2 z-[1]">
                  <Spinner size={14} label="Loading tiles…" />
                </div>
              )}
              <TileGrid
                imageUrl={imageUrl}
                tilesize={currentTileset.nativeTilesize}
                imageWidth={currentTileset.imageWidth}
                imageHeight={currentTileset.imageHeight}
                selection={selection}
                onSelectionChange={(next) => setSelection(next)}
                zoom={zoom}
                showOverlay={showOverlay}
                tilesByLocalId={tilesByLocalId}
              />
            </div>
          </section>
        )}
      </main>

      <Sidebar side="right" width={360} data-tutorial-id="studio-inspector">
        <SectionCard title="Tile inspector" accent="sky" collapsible>
          <TileInspector traitVocab={currentPack?.traitVocab || {}} />
        </SectionCard>
        {currentTileset && (
          <SectionCard title="Autotile groups" accent="amber" collapsible defaultCollapsed>
            <AutotileGroupPicker
              tileset={currentTileset}
              groups={autotileGroups}
              onChange={setAutotileGroups}
            />
          </SectionCard>
        )}
        {selectedPackId && (
          <SectionCard title="Rules" accent="indigo" collapsible defaultCollapsed data-tutorial-id="studio-rules">
            <RulesEditor packId={selectedPackId} groups={autotileGroups} />
          </SectionCard>
        )}
      </Sidebar>

      <TutorialProvider
        tutorialId="studio"
        steps={STUDIO_STEPS}
        sourceStore={useStudioStore}
      />
    </div>
  );
}
