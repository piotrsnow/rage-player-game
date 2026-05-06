// Generic Zustand store powering every page-level tutorial (map editor,
// studio, chargen). A single store instance is shared across the app but
// only one tutorial can be active at a time — each page's
// `TutorialProvider` mounts with its own `tutorialId` + `steps` and drives
// the store through `maybeAutoStart` / `start`.
//
// localStorage contract:
//   rpgon.tutorialSeen  — JSON map { [tutorialId]: true } tracking which
//                         tutorials the user has finished or dismissed.
//
// Legacy migration:
//   rpgon.mapEditor.tutorialSeen === "1"  →  { mapEditor: true }
//   (migrated on first read and the old key is removed).

import { create } from 'zustand';

const LS_KEY = 'rpgon.tutorialSeen';
const LEGACY_EDITOR_KEY = 'rpgon.mapEditor.tutorialSeen';

function readSeenFlags() {
  if (typeof window === 'undefined') return {};
  const ls = window.localStorage;
  if (!ls) return {};
  let out = {};
  try {
    const raw = ls.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') out = { ...parsed };
    }
  } catch {
    /* corrupted JSON — start fresh */
  }
  try {
    const legacy = ls.getItem(LEGACY_EDITOR_KEY);
    if (legacy === '1') {
      if (!out.mapEditor) out.mapEditor = true;
      ls.removeItem(LEGACY_EDITOR_KEY);
      ls.setItem(LS_KEY, JSON.stringify(out));
    }
  } catch {
    /* ignore */
  }
  return out;
}

function writeSeenFlags(flags) {
  try {
    window.localStorage?.setItem(LS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

export const useTutorialStore = create((set, get) => ({
  active: false,
  tutorialId: null,
  steps: [],
  stepIdx: 0,
  completed: new Set(), // ids of steps already satisfied during this run
  seenFlags: readSeenFlags(),

  // Auto-start only if this tutorial hasn't been seen yet. `force` is not
  // exposed here because auto-start should always respect the flag; the
  // "Tutorial" button uses `start({ force: true })` instead.
  maybeAutoStart({ tutorialId, steps }) {
    const s = get();
    if (s.active) return;
    if (s.seenFlags[tutorialId]) return;
    if (!Array.isArray(steps) || !steps.length) return;
    set({ active: true, tutorialId, steps, stepIdx: 0, completed: new Set() });
  },

  start({ tutorialId, steps, force = false } = {}) {
    if (!Array.isArray(steps) || !steps.length) return;
    const s = get();
    if (!force && s.seenFlags[tutorialId] && !s.active) {
      // Permissive: explicit start ignores the flag even without force,
      // matching the previous editor behaviour. `force` is kept for
      // symmetry and future opt-outs.
    }
    set({ active: true, tutorialId, steps, stepIdx: 0, completed: new Set() });
  },

  // Advance to the next step if the current step's id matches `fromId`
  // (guards against double-advance from racing subscribers).
  advance(fromId) {
    const { stepIdx, completed, steps } = get();
    const current = steps[stepIdx];
    if (!current) return;
    if (fromId && current.id !== fromId) return;
    const nextCompleted = new Set(completed);
    nextCompleted.add(current.id);
    const nextIdx = stepIdx + 1;
    if (nextIdx >= steps.length) {
      set({ stepIdx: steps.length - 1, completed: nextCompleted });
      return;
    }
    set({ stepIdx: nextIdx, completed: nextCompleted });
  },

  skipStep() {
    const { stepIdx, steps } = get();
    if (stepIdx >= steps.length - 1) {
      get().finish();
      return;
    }
    set({ stepIdx: stepIdx + 1 });
  },

  goTo(idx) {
    const { steps } = get();
    if (!steps.length) return;
    const clamped = Math.max(0, Math.min(steps.length - 1, idx));
    set({ stepIdx: clamped });
  },

  finish() {
    const { tutorialId, seenFlags } = get();
    const nextFlags = tutorialId ? { ...seenFlags, [tutorialId]: true } : seenFlags;
    if (tutorialId) writeSeenFlags(nextFlags);
    set({ active: false, seenFlags: nextFlags });
  },

  // Dismiss without finishing — by default still persists the flag (user
  // opted out). `silent: true` is used by `TutorialProvider` on unmount
  // so navigating away mid-tutorial doesn't permanently hide it.
  dismiss({ silent = false } = {}) {
    const { tutorialId, seenFlags, active } = get();
    if (!active && silent) return;
    if (silent || !tutorialId) {
      set({ active: false });
      return;
    }
    const nextFlags = { ...seenFlags, [tutorialId]: true };
    writeSeenFlags(nextFlags);
    set({ active: false, seenFlags: nextFlags });
  },
}));

export const TUTORIAL_LS_KEY = LS_KEY;
