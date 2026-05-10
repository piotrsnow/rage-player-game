// Admin panel state. Holds the currently selected campaign + cached payload,
// the latest validation report, and a small dirty-tracking set so the UI can
// warn before navigation. All mutations route through adminApi (in
// components/admin/panel/shared/adminApi.js).

import { create } from 'zustand';
import { adminApi } from '../components/admin/panel/shared/adminApi.js';

export const useAdminPanelStore = create((set, get) => ({
  campaigns: [],
  campaignsLoading: false,
  campaignsError: null,

  currentCampaignId: null,
  currentCampaign: null,
  currentLoading: false,
  currentError: null,

  // Map<entityKey, true> e.g. "quest:abc-123" — UI sets this so it can warn
  // before navigation. Cleared after successful save.
  dirty: {},

  lastValidationReport: null,
  validating: false,

  snapshots: [],
  snapshotsLoading: false,

  // ── Campaigns list ──
  loadCampaigns: async (search) => {
    set({ campaignsLoading: true, campaignsError: null });
    try {
      const rows = await adminApi.listCampaigns(search);
      set({ campaigns: rows, campaignsLoading: false });
    } catch (err) {
      set({ campaignsError: err.message || String(err), campaignsLoading: false });
    }
  },

  // ── Single campaign full payload ──
  selectCampaign: async (id) => {
    if (!id) {
      set({ currentCampaignId: null, currentCampaign: null });
      return;
    }
    set({ currentCampaignId: id, currentLoading: true, currentError: null });
    try {
      const payload = await adminApi.getCampaign(id);
      set({ currentCampaign: payload, currentLoading: false, dirty: {} });
    } catch (err) {
      set({ currentError: err.message || String(err), currentLoading: false });
    }
  },

  refreshCurrent: async () => {
    const id = get().currentCampaignId;
    if (!id) return;
    await get().selectCampaign(id);
  },

  markDirty: (key, dirty = true) =>
    set((s) => {
      const next = { ...s.dirty };
      if (dirty) next[key] = true;
      else delete next[key];
      return { dirty: next };
    }),

  hasDirty: () => Object.keys(get().dirty).length > 0,

  // ── Validation ──
  validate: async () => {
    const id = get().currentCampaignId;
    if (!id) return null;
    set({ validating: true });
    try {
      const report = await adminApi.validate(id);
      set({ lastValidationReport: report, validating: false });
      return report;
    } catch (err) {
      set({ validating: false });
      throw err;
    }
  },

  // ── Snapshots ──
  loadSnapshots: async () => {
    const id = get().currentCampaignId;
    if (!id) return;
    set({ snapshotsLoading: true });
    try {
      const rows = await adminApi.listSnapshots(id);
      set({ snapshots: rows, snapshotsLoading: false });
    } catch (err) {
      set({ snapshotsLoading: false });
      throw err;
    }
  },

  createManualSnapshot: async (reason) => {
    const id = get().currentCampaignId;
    if (!id) return;
    await adminApi.createSnapshot(id, { reason: reason || 'manual', pinned: true });
    await get().loadSnapshots();
  },

  restoreSnapshot: async (snapshotId) => {
    const id = get().currentCampaignId;
    if (!id) return;
    await adminApi.restoreSnapshot(id, snapshotId);
    // Reload everything — the restore touched every child table.
    await Promise.all([get().refreshCurrent(), get().loadSnapshots()]);
  },

  toggleSnapshotPin: async (snapshotId, pinned) => {
    const id = get().currentCampaignId;
    if (!id) return;
    await adminApi.patchSnapshot(id, snapshotId, { pinned });
    await get().loadSnapshots();
  },

  deleteSnapshot: async (snapshotId) => {
    const id = get().currentCampaignId;
    if (!id) return;
    await adminApi.deleteSnapshot(id, snapshotId);
    await get().loadSnapshots();
  },
}));
