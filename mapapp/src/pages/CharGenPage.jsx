// /chargen — character generator page.
//
// Composes the page from small, focused components that each own a single
// region of UX:
//
//   AppearanceToolbar — top bar (name, tags, randomize-all, save, delete)
//   RaceConfigPicker  — race + config dropdowns
//   SlotEditor        — one LPC slot card (item + colours + randomize)
//   PreviewPanel      — live character preview with anim switcher
//   ActorsLibrary     — saved actor list + filter + "New" / "Load"
//
// Before this refactor, the page was a 520-line file with four inline
// helper components (SlotEditor, ColorSwatchButton, plus a bunch of style
// constants). Keeping the state wiring here and pushing all JSX out of
// this file makes each region reviewable on its own and cuts the page to
// a thin orchestrator.

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useActors, useActorsStore } from '../services/useActorsStore.js';
import { useChargenStore } from '../chargen/useChargenStore.js';
import { SLOT_CATEGORIES } from '../chargen/zOrder.js';
import AboutLpc from '../chargen/AboutLpc.jsx';
import TutorialProvider from '../tutorial/TutorialProvider.jsx';
import { useTutorialStore } from '../tutorial/useTutorialStore.js';
import { CHARGEN_STEPS } from '../chargen/tutorial/steps.js';
import Spinner from '../ui/Spinner.jsx';
import { useToasts } from '../ui/Toasts.jsx';
import Button from '../ui/Button.jsx';
import Sidebar from '../ui/Sidebar.jsx';
import { loadCm } from '../chargen/colormap.js';
import AppearanceToolbar from '../chargen/components/AppearanceToolbar.jsx';
import RaceConfigPicker from '../chargen/components/RaceConfigPicker.jsx';
import SlotCategoryGroup from '../chargen/components/SlotCategoryGroup.jsx';
import PreviewPanel from '../chargen/components/PreviewPanel.jsx';
import ActorsLibrary from '../chargen/components/ActorsLibrary.jsx';

export default function CharGenPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const toasts = useToasts();
  const store = useChargenStore();
  const [anim, setAnim] = useState('idle_down');
  const { actors, loading: actorsLoading } = useActors();
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actorFilter, setActorFilter] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [cm, setCm] = useState(null);

  useEffect(() => { store.init(); }, [store]);

  // Warn the user if they try to close / reload the browser with unsaved
  // appearance edits. Internal SPA navigation is guarded separately by
  // App.jsx's nav links + the "Back" button below.
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!useChargenStore.getState().dirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Load the colormap alongside the manifest so the color picker can show
  // real swatches instead of textual color-id suffixes.
  useEffect(() => {
    let cancelled = false;
    if (!store.manifest) return;
    (async () => {
      try {
        const loaded = await loadCm(store.cmName || 'default', store.manifest);
        if (!cancelled) setCm(loaded);
      } catch {
        /* swatches will fall back to textual hints */
      }
    })();
    return () => { cancelled = true; };
  }, [store.manifest, store.cmName]);

  useEffect(() => {
    const unsub = useActorsStore.subscribe((state, prev) => {
      if (state.error && state.error !== prev.error) {
        toasts.show(`Load actors failed: ${state.error}`, { level: 'error' });
      }
    });
    return unsub;
  }, [toasts]);

  // Deep-link: /chargen?actorId=...
  useEffect(() => {
    const id = new URLSearchParams(loc.search).get('actorId');
    if (!id || !store.manifest) return;
    let cancelled = false;
    (async () => {
      setDeepLinkLoading(true);
      try {
        const a = await api.getActor(id);
        if (cancelled) return;
        store.loadAppearance({ id: a.id, name: a.name, appearance: a.appearance, tags: a.tags });
      } catch (err) {
        if (!cancelled) toasts.show(`Load actor failed: ${err.message}`, { level: 'error' });
      } finally {
        if (!cancelled) setDeepLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loc.search, store.manifest]);

  const { manifest, appearance, previewCanvas, loading, error, name, tags, actorId, dirty } = store;
  const animMap = manifest?.anim;
  const currentRace = appearance?.race ? manifest?.races?.[appearance.race] : null;
  const currentConfig = currentRace?.configs.find((c) => c.id === appearance?.config) || null;

  async function onSave() {
    if (!appearance) return;
    if (!name.trim()) { toasts.show('Name required', { level: 'warning' }); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), appearance, tags };
      let saved;
      if (actorId) saved = await api.updateActor(actorId, payload);
      else saved = await api.createActor(payload);
      store.setActorId(saved.id);
      store.clearDirty();
      useActorsStore.getState().upsert(saved);
      toasts.show(`Saved "${saved.name}".`, { level: 'success' });
      window.dispatchEvent(new CustomEvent('rpgon:actors-changed'));
    } catch (err) {
      toasts.show(`Save failed: ${err.message}`, { level: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!actorId) return;
    if (!confirm('Delete this actor?')) return;
    setDeleting(true);
    try {
      await api.deleteActor(actorId);
      useActorsStore.getState().remove(actorId);
      store.setActorId(null);
      toasts.show('Actor deleted.', { level: 'success' });
      window.dispatchEvent(new CustomEvent('rpgon:actors-changed'));
    } catch (err) {
      toasts.show(`Delete failed: ${err.message}`, { level: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  function confirmDiscardIfDirty() {
    if (!store.dirty) return true;
    return window.confirm('You have unsaved actor changes. Discard them?');
  }

  function onNew() {
    if (!manifest) return;
    if (!confirmDiscardIfDirty()) return;
    store.setActorId(null);
    store.setName('');
    store.setTags([]);
    store.randomize({ raceId: 'human', configId: 'm1' });
  }

  function onLoad(actor) {
    if (actor.id === actorId) return;
    if (!confirmDiscardIfDirty()) return;
    store.loadAppearance({
      id: actor.id, name: actor.name, appearance: actor.appearance, tags: actor.tags,
    });
    toasts.show(`Loaded "${actor.name}".`, { level: 'info' });
  }

  const saveDisabled = !manifest || saving || deleting;

  return (
    <div className="flex h-full min-h-0 text-on-surface">
      <Sidebar side="left" width={340}>
        <PreviewPanel
          previewCanvas={previewCanvas}
          animId={anim}
          animMap={animMap}
          onAnim={setAnim}
        />

        <ActorsLibrary
          actors={actors}
          actorId={actorId}
          filter={actorFilter}
          onFilterChange={setActorFilter}
          loading={actorsLoading}
          deepLinkLoading={deepLinkLoading}
          onNew={onNew}
          onLoad={onLoad}
        />

        <div className="mt-auto flex flex-col gap-1.5">
          <Button block onClick={() => setShowAbout(true)}>About LPC assets</Button>
          <Button
            block
            onClick={() => useTutorialStore.getState().start({
              tutorialId: 'chargen', steps: CHARGEN_STEPS, force: true,
            })}
            title="Uruchom samouczek krok po kroku"
            aria-label="Uruchom samouczek"
          >
            Tutorial
          </Button>
          <Button
            block
            onClick={() => {
              if (!confirmDiscardIfDirty()) return;
              nav('/editor');
            }}
          >
            ← Back to Map Editor
          </Button>
        </div>
      </Sidebar>

      {showAbout && <AboutLpc onClose={() => setShowAbout(false)} />}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <AppearanceToolbar
          name={name}
          onNameChange={store.setName}
          tags={tags}
          onTagsChange={store.setTags}
          onRandomizeAll={() => store.randomize()}
          onSave={onSave}
          onDelete={onDelete}
          saving={saving}
          deleting={deleting}
          disabled={saveDisabled}
          actorId={actorId}
          dirty={dirty}
        />

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">
          {loading && <Spinner size={16} label="Loading LPC manifest…" />}
          {deepLinkLoading && <Spinner size={16} label="Loading actor…" />}
          {error && <div className="text-error">{error}</div>}
          {appearance && currentRace && (
            <>
              <RaceConfigPicker
                manifest={manifest}
                appearance={appearance}
                currentRace={currentRace}
                onSetRace={store.setRace}
                onSetConfig={store.setConfig}
              />

              <div
                className="flex flex-col gap-3 mt-3"
                data-tutorial-id="chargen-slots"
              >
                {SLOT_CATEGORIES.map((cat) => (
                  <SlotCategoryGroup
                    key={cat.id}
                    category={cat}
                    config={currentConfig}
                    manifest={manifest}
                    appearance={appearance}
                    cm={cm}
                    collapsed={!!store.collapsedCategories[cat.id]}
                    onToggle={() => store.toggleCategory(cat.id)}
                    onSetSlot={store.setSlot}
                    onSetColor={store.setColor}
                    onRandomizeSlot={store.randomizeSlot}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <TutorialProvider
        tutorialId="chargen"
        steps={CHARGEN_STEPS}
        sourceStore={useChargenStore}
      />
    </div>
  );
}
