// Zustand store for the CharGen page.
//
// Holds the manifest, current appearance (race/config/slots), a
// live-composed canvas (updated debounced on any slot/color change),
// and a collection of user MapActors (loaded lazily).

import { create } from 'zustand';
import { loadManifest, resolveConfig } from './manifest.js';
import { composeSheet, SHEET_HEIGHT, SHEET_WIDTH } from './compose.js';
import { defaultAppearance, randomAppearance, randomSlot } from './randomize.js';

// rAF-debounce: rapid bursts of setSlot/setColor/… collapse into one
// recompose per animation frame. Held as a module-level handle (outside
// zustand state) because it's purely a scheduler, not UI data.
let recomposeRafId = 0;

export const useChargenStore = create((set, get) => ({
  manifest: null,
  loading: false,
  error: null,

  cmName: 'default',
  appearance: null,
  previewCanvas: null,
  previewWarnings: [],
  rendering: false,

  // metadata for save
  actorId: null,
  name: '',
  tags: [],

  // Dirty flag — mirrors the editor's. Flipped by any user-facing
  // mutation (setName/setSlot/setColor/randomize/setRace/…), cleared on
  // save/load. Consumed by the `beforeunload` handler and the top-nav
  // guard so the user gets a confirm() before losing unsaved changes.
  dirty: false,

  // Collapsed-state of SlotCategoryGroup cards in the right pane. Keyed
  // by category id (see `zOrder.SLOT_CATEGORIES`). Persists across
  // race/config swaps so the user's "I only care about clothing" fold
  // survives a race change.
  collapsedCategories: {},
  toggleCategory(catId) {
    set((s) => ({
      collapsedCategories: {
        ...s.collapsedCategories,
        [catId]: !s.collapsedCategories[catId],
      },
    }));
  },

  async init() {
    if (get().manifest || get().loading) return;
    set({ loading: true, error: null });
    try {
      const manifest = await loadManifest();
      const appearance = defaultAppearance(manifest);
      set({ manifest, appearance, loading: false });
      await get().recompose();
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  setName(name) { set({ name, dirty: true }); },
  setTags(tags) { set({ tags, dirty: true }); },
  setActorId(id) { set({ actorId: id }); },
  clearDirty() { set({ dirty: false }); },

  setRace(raceId) {
    const { manifest } = get();
    if (!manifest) return;
    const race = manifest.races[raceId];
    if (!race) return;
    const cfg = race.configs[0];
    const app = randomAppearance(manifest, { raceId, configId: cfg.id });
    set({ appearance: app, dirty: true });
    get().recompose();
  },

  setConfig(configId) {
    const { manifest, appearance } = get();
    if (!manifest || !appearance) return;
    const cfg = resolveConfig(manifest, appearance.race, configId);
    if (!cfg) return;
    // When switching config (e.g. male→female) the old slot items might not
    // fit the new body-type. Regenerate to stay consistent, but keep race.
    const next = randomAppearance(manifest, { raceId: appearance.race, configId });
    set({ appearance: next, dirty: true });
    get().recompose();
  },

  setSlot(slot, itemKey) {
    const { appearance, manifest } = get();
    if (!appearance) return;
    const slots = { ...appearance.slots };
    if (!itemKey || itemKey === 'none') {
      slots[slot] = { id: 'none', color: 'none' };
    } else {
      const item = manifest.categories[slot]?.items[itemKey];
      const color = item?.primarycolors?.[0]
        ?? item?.fixedcolors?.[0]
        ?? 'none';
      slots[slot] = { id: itemKey, color };
    }
    set({ appearance: { ...appearance, slots }, dirty: true });
    get().recompose();
  },

  setColor(slot, colorId) {
    const { appearance } = get();
    if (!appearance?.slots?.[slot]) return;
    const slots = { ...appearance.slots };
    slots[slot] = { ...slots[slot], color: colorId };
    set({ appearance: { ...appearance, slots }, dirty: true });
    get().recompose();
  },

  randomize(opts = {}) {
    const { manifest } = get();
    if (!manifest) return;
    const app = randomAppearance(manifest, opts);
    set({ appearance: app, dirty: true });
    get().recompose();
  },

  randomizeSlot(slot) {
    const { manifest, appearance } = get();
    if (!manifest || !appearance) return;
    const next = randomSlot(manifest, appearance, slot);
    const slots = { ...appearance.slots };
    if (next) slots[slot] = next;
    else slots[slot] = { id: 'none', color: 'none' };
    set({ appearance: { ...appearance, slots }, dirty: true });
    get().recompose();
  },

  loadAppearance({ id, name, appearance, tags }) {
    set({
      actorId: id || null,
      name: name || '',
      tags: Array.isArray(tags) ? [...tags] : [],
      appearance,
      dirty: false,
    });
    get().recompose();
  },

  _renderToken: 0,
  recompose() {
    // Coalesce multiple calls within the same frame (e.g. setSlot then
    // setColor back-to-back) into a single compose pass.
    if (recomposeRafId) return;
    recomposeRafId = requestAnimationFrame(() => {
      recomposeRafId = 0;
      get()._runRecompose();
    });
  },
  async _runRecompose() {
    const token = get()._renderToken + 1;
    set({ _renderToken: token, rendering: true });
    const { manifest, cmName, appearance, previewCanvas } = get();
    if (!manifest || !appearance) { set({ rendering: false }); return; }
    try {
      // composeSheet paints on a private offscreen canvas, so concurrent
      // composes never interleave with each other's clearRect/drawImage.
      // We then synchronously blit the finished sheet onto the persistent
      // previewCanvas (so Pixi / CharPreview keep the same element ref).
      // The token check guarantees a stale render is discarded without
      // ever touching previewCanvas — fixing the "random transparencies"
      // that appeared when several recomposes raced on a shared canvas.
      const { canvas: fresh, warnings } = await composeSheet(appearance, {
        manifest, cmName,
      });
      if (get()._renderToken !== token) return; // superseded, discard

      const dest = previewCanvas || document.createElement('canvas');
      dest.width = SHEET_WIDTH;
      dest.height = SHEET_HEIGHT;
      const dctx = dest.getContext('2d');
      dctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
      dctx.drawImage(fresh, 0, 0);

      set({ previewCanvas: dest, previewWarnings: warnings, rendering: false });
    } catch (err) {
      if (get()._renderToken !== token) return;
      set({ rendering: false, error: err.message });
    }
  },
}));
