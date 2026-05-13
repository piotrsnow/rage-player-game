import { useState, useCallback, useEffect, useMemo } from 'react';
import { apiClient } from '../services/apiClient.js';

const WORLD_GRAPH_URL = '/admin/livingWorld/world-graph';

/**
 * Admin read-only snapshot of every WorldLocation / CampaignLocation + LocationEdge graph.
 *
 * Mirrors `useLocationGraph` surface so `LocationGraphModal` can reuse the UI in `worldMode`.
 *
 * @param {{ openGeneration?: number, paused?: boolean }} [options]
 */
export function useWorldGraph(options = {}) {
  const { openGeneration, paused = false, showOrphans = false } = options;
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [occupants, setOccupants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mode] = useState('gm'); // pinned — no player mode in admin world view
  const [filters, setFilters] = useState({
    movement: true, structural: true, spatial: true,
    perception: true, social: true, narrative: true,
    access: true, temporal: true,
  });
  const [scaleFilter, setScaleFilter] = useState(7);
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    const t = searchQuery.trim().toLowerCase();
    if (t.length < 2) return [];
    return nodes
      .filter((n) => (n.name || '').toLowerCase().includes(t))
      .slice(0, 30)
      .map((n) => ({ kind: 'node', id: n.id, label: `${n.kind === 'campaign' ? '[S] ' : ''}${n.name}`, nodeKind: n.kind }));
  }, [searchQuery, nodes]);

  const fetchGraph = useCallback(async () => {
    if (paused) return;
    setLoading(true);
    setError(null);
    try {
      const url = showOrphans ? `${WORLD_GRAPH_URL}?showOrphans=true` : WORLD_GRAPH_URL;
      const data = await apiClient.get(url);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setOccupants(data.occupants || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [paused, showOrphans]);

  useEffect(() => {
    if (paused) return;
    fetchGraph();
  }, [fetchGraph, openGeneration, paused]);

  const readOnlyReject = async () => {
    throw new Error('World graph is read-only.');
  };

  const patchNodeLocal = useCallback((nodeId, patch) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
  }, []);

  const search = useCallback((q) => {
    setSearchQuery(typeof q === 'string' ? q : '');
  }, []);

  const validate = useCallback(async () => ({ valid: true, warnings: [] }), []);

  const selectedNode = selected?.type === 'node' ? nodes.find((n) => n.id === selected.id) : null;
  const selectedEdge = selected?.type === 'edge' ? edges.find((e) => e.id === selected.id) : null;

  const filteredEdges = edges.filter((e) => filters[e.category] !== false);
  const filteredNodes = nodes.filter((n) => (n.scale ?? 5) <= scaleFilter);

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    allNodes: nodes,
    allEdges: edges,
    occupants,
    loading,
    error,
    selected,
    setSelected,
    selectedNode,
    selectedEdge,
    mode,
    setMode: () => {},
    filters,
    setFilters,
    scaleFilter,
    setScaleFilter,
    searchQuery,
    searchResults,
    search,
    fetchGraph,
    patchNodeLocal,
    createNode: readOnlyReject,
    updateNode: readOnlyReject,
    deleteNode: readOnlyReject,
    createEdge: readOnlyReject,
    updateEdge: readOnlyReject,
    deleteEdge: readOnlyReject,
    moveNpc: readOnlyReject,
    validate,
    fetchNpcDetails: null,
    readOnly: true,
  };
}
