import { useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient.js';

const WORLD_REVISION_URL = '/admin/livingWorld/world-graph/revise-graph';
const CAMPAIGN_REVISION_URL = (id) => `/livingWorld/campaigns/${id}/location-graph/revise-graph`;

const ADMIN_EDGE_PATCH_URL = (edgeId) => `/admin/livingWorld/edges/${edgeId}`;
const ADMIN_WORLD_LOC_PATCH_URL = (locId) => `/admin/campaigns/world-locations/${locId}`;

/**
 * Hook for AI-powered graph revision.
 *
 * In campaign mode, applies patches via graph.updateNode / graph.updateEdge.
 * In world mode, applies directly to admin endpoints then refreshes.
 *
 * @param {{ graph: object, worldMode: boolean, campaignId?: string|null }} opts
 */
export function useGraphRevision({ graph, worldMode, campaignId }) {
  const [revising, setRevising] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const appliedRef = useRef(new Set());

  const revise = useCallback(async () => {
    setRevising(true);
    setError(null);
    setResult(null);
    appliedRef.current = new Set();

    try {
      const nodes = (graph.allNodes || graph.nodes || []).map((n) => ({
        id: n.id,
        kind: n.kind,
        name: n.name,
        type: n.type,
        scale: n.scale,
        tags: n.tags,
        description: n.description,
        atmosphere: n.atmosphere,
        dangerLevel: n.dangerLevel,
        biome: n.biome,
        regionX: n.regionX,
        regionY: n.regionY,
      }));

      const edges = (graph.allEdges || graph.edges || []).map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        edgeType: e.edgeType,
        category: e.category,
        weight: e.weight,
        bidirectional: e.bidirectional,
      }));

      const url = worldMode
        ? WORLD_REVISION_URL
        : CAMPAIGN_REVISION_URL(campaignId);

      const data = await apiClient.post(url, { nodes, edges });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Revision failed');
    } finally {
      setRevising(false);
    }
  }, [graph, worldMode, campaignId]);

  const applyOne = useCallback(async (kind, id) => {
    if (!result?.patches) return;
    const list = kind === 'node' ? result.patches.nodes : result.patches.edges;
    const patch = list.find((p) => p.id === id);
    if (!patch) return;

    const patchData = { ...patch };
    delete patchData.id;

    try {
      if (worldMode) {
        if (kind === 'node') {
          await apiClient.patch(ADMIN_WORLD_LOC_PATCH_URL(id), patchData);
        } else {
          await apiClient.patch(ADMIN_EDGE_PATCH_URL(id), patchData);
        }
      } else {
        if (kind === 'node') {
          await graph.updateNode(id, patchData);
        } else {
          await graph.updateEdge(id, patchData);
        }
      }
      appliedRef.current.add(`${kind}:${id}`);
      setResult((prev) => ({ ...prev, _appliedVersion: (prev?._appliedVersion || 0) + 1 }));
    } catch (err) {
      setError(`Failed to apply ${kind} ${id}: ${err.message}`);
    }
  }, [result, worldMode, graph]);

  const rejectOne = useCallback((kind, id) => {
    if (!result?.patches) return;
    const key = kind === 'node' ? 'nodes' : 'edges';
    setResult((prev) => ({
      ...prev,
      patches: {
        ...prev.patches,
        [key]: prev.patches[key].filter((p) => p.id !== id),
      },
    }));
  }, [result]);

  const applyAll = useCallback(async () => {
    if (!result?.patches) return;
    for (const p of result.patches.nodes) {
      if (!appliedRef.current.has(`node:${p.id}`)) {
        await applyOne('node', p.id);
      }
    }
    for (const p of result.patches.edges) {
      if (!appliedRef.current.has(`edge:${p.id}`)) {
        await applyOne('edge', p.id);
      }
    }
    if (worldMode && graph.fetchGraph) {
      await graph.fetchGraph();
    }
  }, [result, applyOne, worldMode, graph]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    appliedRef.current = new Set();
  }, []);

  const isApplied = useCallback((kind, id) => {
    return appliedRef.current.has(`${kind}:${id}`);
  }, []);

  const totalPatches = result
    ? (result.patches?.nodes?.length || 0) + (result.patches?.edges?.length || 0)
    : 0;

  return {
    revise,
    revising,
    result,
    error,
    totalPatches,
    clearResult,
    applyAll,
    applyOne,
    rejectOne,
    isApplied,
  };
}
