/** Shared with LocationGraphModal + MapTab so canvas layout matches. */
export const GRAPH_LAYOUT_STORAGE_PREFIX = 'rpgon:graphLayout:v2:';

export function loadGraphLayout(campaignId) {
  try {
    const raw = localStorage.getItem(GRAPH_LAYOUT_STORAGE_PREFIX + campaignId);
    if (!raw) return { overrides: {}, snap: false };
    const parsed = JSON.parse(raw);
    return { overrides: parsed.overrides || {}, snap: !!parsed.snap };
  } catch {
    return { overrides: {}, snap: false };
  }
}

export const GRAPH_LAYOUT_STORAGE_CHANGED = 'rpgon:graph-layout-storage-changed';

export function saveGraphLayout(campaignId, overrides, snap) {
  try {
    localStorage.setItem(
      GRAPH_LAYOUT_STORAGE_PREFIX + campaignId,
      JSON.stringify({ overrides, snap }),
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(GRAPH_LAYOUT_STORAGE_CHANGED, { detail: { campaignId } }),
      );
    }
  } catch {
    /* quota exceeded — silently ignore */
  }
}
