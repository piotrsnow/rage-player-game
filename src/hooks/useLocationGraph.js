import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient.js';

const BASE = '/livingWorld/campaigns';

export function useLocationGraph(campaignId) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
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
      const res = await apiClient.request(`${BASE}/${campaignId}/location-graph${suffix}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchGraph({ hops: 3 }); }, [fetchGraph]);

  const createNode = useCallback(async (body) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes`, { method: 'POST', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await fetchGraph({ hops: 3 });
    return data.node;
  }, [campaignId, fetchGraph]);

  const updateNode = useCallback(async (nodeId, body) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes/${nodeId}`, { method: 'PUT', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, ...body } : n));
  }, [campaignId]);

  const deleteNode = useCallback(async (nodeId) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/nodes/${nodeId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromId !== nodeId && e.toId !== nodeId));
    if (selected?.id === nodeId) setSelected(null);
  }, [campaignId, selected]);

  const createEdge = useCallback(async (body) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/edges`, { method: 'POST', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await fetchGraph({ hops: 3 });
    return data.edge;
  }, [campaignId, fetchGraph]);

  const updateEdge = useCallback(async (edgeId, body) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/edges/${edgeId}`, { method: 'PUT', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setEdges((prev) => prev.map((e) => e.id === edgeId ? { ...e, ...body } : e));
  }, [campaignId]);

  const deleteEdge = useCallback(async (edgeId) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/edges/${edgeId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    if (selected?.id === edgeId) setSelected(null);
  }, [campaignId, selected]);

  const moveNpc = useCallback(async (npcId, toKind, toId) => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/move-npc`, {
      method: 'POST', body: { npcId, toKind, toId },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [campaignId]);

  const search = useCallback(async (q) => {
    setSearchQuery(q);
    if (!q || q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  }, [campaignId]);

  const validate = useCallback(async () => {
    const res = await apiClient.request(`${BASE}/${campaignId}/location-graph/validate`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [campaignId]);

  const selectedNode = selected?.type === 'node' ? nodes.find((n) => n.id === selected.id) : null;
  const selectedEdge = selected?.type === 'edge' ? edges.find((e) => e.id === selected.id) : null;

  const filteredEdges = edges.filter((e) => filters[e.category] !== false);
  const filteredNodes = nodes.filter((n) => (n.scale ?? 5) <= scaleFilter);

  return {
    nodes: filteredNodes, edges: filteredEdges,
    allNodes: nodes, allEdges: edges,
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
