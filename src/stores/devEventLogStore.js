import { create } from 'zustand';

const MAX_EVENTS = 500;
const CATEGORIES = ['pipeline', 'ai', 'state', 'validation', 'combat', 'image', 'mechanics', 'system'];
const SEVERITIES = ['info', 'warn', 'error'];

let _seqId = 0;

export const useDevEventLogStore = create((set, get) => ({
  events: [],
  isOpen: false,
  filters: new Set(),
  pinnedIds: new Set(),
  autoScroll: true,
  enabled: true,

  setEnabled: (v) => set({ enabled: v }),

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  close: () => set({ isOpen: false }),

  emit: (entry) => {
    const s = get();
    if (!s.enabled) return;
    const event = {
      id: ++_seqId,
      ts: Date.now(),
      category: CATEGORIES.includes(entry.category) ? entry.category : 'system',
      type: entry.type || 'generic',
      label: entry.label || entry.type || '—',
      data: entry.data ?? null,
      severity: SEVERITIES.includes(entry.severity) ? entry.severity : 'info',
    };
    set((prev) => {
      const next = prev.events.length >= MAX_EVENTS
        ? prev.events.slice(-MAX_EVENTS + 1)
        : prev.events;
      return { events: [...next, event] };
    });
  },

  clear: () => set({ events: [] }),

  toggleFilter: (category) => set((s) => {
    const next = new Set(s.filters);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    return { filters: next };
  }),

  clearFilters: () => set({ filters: new Set() }),

  togglePin: (id) => set((s) => {
    const next = new Set(s.pinnedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { pinnedIds: next };
  }),

  setAutoScroll: (v) => set({ autoScroll: v }),
}));

export const devLog = {
  emit: (entry) => useDevEventLogStore.getState().emit(entry),
  clear: () => useDevEventLogStore.getState().clear(),
  open: () => useDevEventLogStore.getState().toggleOpen(),
  isEnabled: () => useDevEventLogStore.getState().enabled,
};

export { CATEGORIES, SEVERITIES };
