import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient.js';
import { useGameSlice } from '../stores/gameSelectors';

const BASE = '/livingWorld/campaigns';

/** Cross-widget sync: MapTab + LocationGraphModal each mount their own hook instance. */
export const LOCATION_GRAPH_MUTATED_EVENT = 'rpgon:location-graph-mutated';

export function notifyLocationGraphMutated(campaignId) {
  if (typeof window === 'undefined' || !campaignId) return;
  window.dispatchEvent(new CustomEvent(LOCATION_GRAPH_MUTATED_EVENT, { detail: { campaignId } }));
}

/**
 * @param {string} campaignId
 * @param {{ openGeneration?: number }} [options] — pass `openGeneration` from modal refresh key so graph refetches every time the location-graph modal opens.
 */
export function useLocationGraph(campaignId, options = {}) {
  const { openGeneration } = options;
  // Subskrypcja do currentLocationRef + currentLocation (string fallback)
  // żeby otwarty modal sam się odświeżał, gdy gracz przeszedł do nowej
  // lokacji (zwykła scena z create-on-miss, korekta incydentu, ręczne move).
  // Klucz złożony z obu — ref ID jest preferowany; gdy ref pusty (legacy),
  // wpada na string. Zmiana któregokolwiek triggeruje refetch.
  const currentRefKey = useGameSlice((s) => {
    const r = s.world?.currentLocationRef;
    if (r && r.kind && r.id) return `${r.kind}:${r.id}`;
    const name = s.world?.currentLocation;
    return name ? `name:${name}` : null;
  });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [occupants, setOccupants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // { type: 'node'|'edge', id }
  const [mode, setMode] = useState('gm'); // 'player' | 'gm'
  const [filters, setFilters] = useState({
    movement: true, structural: true, spatial: true,
    perception: true, social: true, narrative: true,
    access: true, temporal: true,
  });
  const [scaleFilter, setScaleFilter] = useState(7);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const abortRef = useRef(null);

  const fetchGraph = useCallback(async ({ focusKind, focusId, hops } = {}) => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (focusKind) qs.set('focusKind', focusKind);
      if (focusId) qs.set('focusId', focusId);
      if (hops) qs.set('hops', String(hops));
      const suffix = qs.toString() ? `?${qs}` : '';
      const data = await apiClient.request(`${BASE}/${campaignId}/location-graph${suffix}`);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setOccupants(data.occupants || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchGraph({ hops: 3 });
  }, [fetchGraph, currentRefKey, openGeneration]);

  useEffect(() => {
    if (!campaignId) return;
    const onMutated = (e) => {
      if (e.detail?.campaignId !== campaignId) return;
      fetchGraph({ hops: 3 });
    };
    window.addEventListener(LOCATION_GRAPH_MUTATED_EVENT, onMutated);
    return () => window.removeEventListener(LOCATION_GRAPH_MUTATED_EVENT, onMutated);
  }, [campaignId, fetchGraph]);

  const createNode = useCallback(async (body) => {
    setError(null);
    try {
      const data = await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes`, { method: 'POST', body });
      notifyLocationGraphMutated(campaignId);
      return data.node;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId, fetchGraph]);

  const updateNode = useCallback(async (nodeId, body) => {
    setError(null);
    try {
      await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes/${nodeId}`, { method: 'PUT', body });
      setNodes((prev) => prev.map((n) => {
        if (n.id !== nodeId) return n;
        const patch = { ...body };
        if ('shape' in patch) { patch.nodeShape = patch.shape || null; delete patch.shape; }
        if ('icon' in patch) { patch.nodeIcon = patch.icon || null; delete patch.icon; }
        return { ...n, ...patch };
      }));
      notifyLocationGraphMutated(campaignId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId]);

  const deleteNode = useCallback(async (nodeId) => {
    setError(null);
    try {
      await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes/${nodeId}`, { method: 'DELETE' });
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.fromId !== nodeId && e.toId !== nodeId));
      if (selected?.id === nodeId) setSelected(null);
      notifyLocationGraphMutated(campaignId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId, selected]);

  const createEdge = useCallback(async (body) => {
    setError(null);
    try {
      const data = await apiClient.request(`${BASE}/${campaignId}/location-graph/edges`, { method: 'POST', body });
      notifyLocationGraphMutated(campaignId);
      return data.edge;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId, fetchGraph]);

  const updateEdge = useCallback(async (edgeId, body) => {
    setError(null);
    try {
      await apiClient.request(`${BASE}/${campaignId}/location-graph/edges/${edgeId}`, { method: 'PUT', body });
      setEdges((prev) => prev.map((e) => e.id === edgeId ? { ...e, ...body } : e));
      notifyLocationGraphMutated(campaignId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId]);

  const deleteEdge = useCallback(async (edgeId) => {
    setError(null);
    try {
      await apiClient.request(`${BASE}/${campaignId}/location-graph/edges/${edgeId}`, { method: 'DELETE' });
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
      if (selected?.id === edgeId) setSelected(null);
      notifyLocationGraphMutated(campaignId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [campaignId, selected]);

  const moveNpc = useCallback(async (npcId, toKind, toId) => {
    await apiClient.request(`${BASE}/${campaignId}/location-graph/move-npc`, {
      method: 'POST', body: { npcId, toKind, toId },
    });
    notifyLocationGraphMutated(campaignId);
  }, [campaignId]);

  const search = useCallback(async (q) => {
    setSearchQuery(q);
    if (!q || q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await apiClient.request(`${BASE}/${campaignId}/location-graph/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  }, [campaignId]);

  const validate = useCallback(async () => {
    return apiClient.request(`${BASE}/${campaignId}/location-graph/validate`, { method: 'POST' });
  }, [campaignId]);

  const selectedNode = selected?.type === 'node' ? nodes.find((n) => n.id === selected.id) : null;
  const selectedEdge = selected?.type === 'edge' ? edges.find((e) => e.id === selected.id) : null;

  const filteredEdges = edges.filter((e) => filters[e.category] !== false);
  const filteredNodes = nodes.filter((n) => (n.scale ?? 5) <= scaleFilter);

  return {
    nodes: filteredNodes, edges: filteredEdges,
    allNodes: nodes, allEdges: edges,
    occupants,
    loading, error,
    selected, setSelected, selectedNode, selectedEdge,
    mode, setMode,
    filters, setFilters, scaleFilter, setScaleFilter,
    searchQuery, searchResults, search,
    fetchGraph, createNode, updateNode, deleteNode,
    createEdge, updateEdge, deleteEdge,
    moveNpc, validate,
  };
}
