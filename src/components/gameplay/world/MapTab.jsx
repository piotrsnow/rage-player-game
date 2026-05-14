import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterSprites } from '../../../hooks/useCharacterSprites';
import { useCurrentLocationNode } from '../../../hooks/useCurrentLocationNode';
import { useLocationGraph } from '../../../hooks/useLocationGraph';
import { useGameScenes } from '../../../stores/gameSelectors';
import { isQuietScene } from '../../../services/quietSceneCheck';
import { apiClient } from '../../../services/apiClient';
import {
  loadGraphLayout,
  GRAPH_LAYOUT_STORAGE_PREFIX,
  GRAPH_LAYOUT_STORAGE_CHANGED,
} from '../../../utils/graphLayoutStorage.js';
import GraphCanvas from '../locationGraph/GraphCanvas.jsx';
import HierarchyTree from '../locationGraph/HierarchyTree.jsx';
import InspectorPanel from '../locationGraph/InspectorPanel.jsx';

export default function MapTab({ campaignId, onTravel }) {
  const { t } = useTranslation();
  const graph = useLocationGraph(campaignId);
  const currentNode = useCurrentLocationNode(graph);
  const scenes = useGameScenes();

  const [selected, setSelected] = useState(null);
  const [positionOverrides, setPositionOverrides] = useState(() => loadGraphLayout(campaignId).overrides);

  const canvasRef = useRef(null);
  const didInitialFit = useRef(false);

  const { nodes, edges, allNodes, allEdges, occupants } = graph;

  const spriteItems = useMemo(
    () => (occupants || []).map((o) => ({
      id: o.id,
      kind: o.type === 'player' ? 'character' : 'campaign-npc',
      spriteUrl: o.spriteUrl,
    })),
    [occupants],
  );
  const extraOccupantSprites = useCharacterSprites(spriteItems, {
    campaignId,
    endpoint: 'campaign',
  });
  const occupantSpriteMap = useMemo(() => {
    const m = { ...extraOccupantSprites };
    for (const o of occupants || []) {
      if (o.spriteUrl) m[o.id] = apiClient.resolveMediaUrl(o.spriteUrl);
    }
    return m;
  }, [occupants, extraOccupantSprites]);

  const occupantSpriteSheetMap = useMemo(() => {
    const m = {};
    for (const o of occupants || []) {
      if (o.spriteSheetUrl) m[o.id] = apiClient.resolveMediaUrl(o.spriteSheetUrl);
    }
    return m;
  }, [occupants]);

  useEffect(() => {
    setPositionOverrides(loadGraphLayout(campaignId).overrides);
  }, [campaignId]);

  useEffect(() => {
    if (graph.loading) return;
    setPositionOverrides(loadGraphLayout(campaignId).overrides);
  }, [graph.loading, campaignId]);

  useEffect(() => {
    const onLayoutStorage = (e) => {
      if (e.detail?.campaignId !== campaignId) return;
      setPositionOverrides(loadGraphLayout(campaignId).overrides);
    };
    const onNativeStorage = (e) => {
      if (e.key !== GRAPH_LAYOUT_STORAGE_PREFIX + campaignId) return;
      setPositionOverrides(loadGraphLayout(campaignId).overrides);
    };
    window.addEventListener(GRAPH_LAYOUT_STORAGE_CHANGED, onLayoutStorage);
    window.addEventListener('storage', onNativeStorage);
    return () => {
      window.removeEventListener(GRAPH_LAYOUT_STORAGE_CHANGED, onLayoutStorage);
      window.removeEventListener('storage', onNativeStorage);
    };
  }, [campaignId]);

  useEffect(() => {
    if (!selected && currentNode?.id) {
      setSelected({ type: 'node', id: currentNode.id });
    }
  }, [selected, currentNode?.id]);

  useEffect(() => {
    if (didInitialFit.current || graph.loading || nodes.length === 0) return;
    didInitialFit.current = true;
    requestAnimationFrame(() => canvasRef.current?.fitToView());
  }, [graph.loading, nodes.length]);

  const adjacentIds = useMemo(() => {
    if (!currentNode) return new Set();
    const set = new Set();
    for (const e of edges) {
      if (e.fromId === currentNode.id) set.add(e.toId);
      if (e.toId === currentNode.id) set.add(e.fromId);
    }
    return set;
  }, [currentNode, edges]);

  const handleHierarchySelect = useCallback((sel) => {
    setSelected(sel);
    if (sel?.type === 'node') {
      requestAnimationFrame(() => canvasRef.current?.centerOnNode(sel.id));
    }
  }, []);

  const REQUIRED_CALM_SCENES = 0;
  const canAttemptDistantTravel = REQUIRED_CALM_SCENES === 0
    || scenes.slice(-REQUIRED_CALM_SCENES).every(isQuietScene);

  const selectedNode = useMemo(() => {
    if (selected?.type !== 'node') return null;
    return (allNodes || nodes).find((node) => node.id === selected.id) || null;
  }, [selected, allNodes, nodes]);

  const selectedEdge = useMemo(() => {
    if (selected?.type !== 'edge') return null;
    return (allEdges || edges).find((e) => e.id === selected.id) || null;
  }, [selected, allEdges, edges]);

  if (graph.loading) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        {t('common.loading')}
      </div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant">
        <span className="material-symbols-outlined mr-2">map</span>
        {t('worldState.emptyMap')}
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="w-56 border-r border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-outline-variant/15">
          <span className="text-xs font-label uppercase tracking-widest text-outline">
            {t('locationGraph.hierarchy')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <HierarchyTree
            nodes={allNodes || nodes}
            edges={allEdges || edges}
            selected={selected}
            onSelect={handleHierarchySelect}
          />
        </div>
      </div>

      <div className="flex-1 relative min-w-0 bg-black/40 rounded-sm border border-amber-900/30 ring-1 ring-amber-700/10 shadow-[inset_0_0_40px_rgba(120,53,15,0.15),inset_0_0_80px_rgba(0,0,0,0.3)]">
        <GraphCanvas
          ref={canvasRef}
          nodes={nodes}
          edges={edges}
          occupants={occupants}
          occupantSpriteMap={occupantSpriteMap}
          occupantSpriteSheetMap={occupantSpriteSheetMap}
          selected={selected}
          onSelect={setSelected}
          positionOverrides={positionOverrides}
          highlightedNodeId={currentNode?.id || null}
          highlightedAdjacentIds={adjacentIds}
        />
      </div>

      <div className="w-72 border-l border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-outline-variant/15">
          <span className="text-xs font-label uppercase tracking-widest text-outline">
            {t('locationGraph.inspector.title')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <InspectorPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            allNodes={allNodes || nodes}
            occupants={occupants}
            onUpdateNode={() => Promise.resolve()}
            onUpdateEdge={() => Promise.resolve()}
            onDeleteNode={() => {}}
            onDeleteEdge={() => {}}
            mode="player"
            campaignId={campaignId}
            readOnly
          />
        </div>
        {selectedNode && (
          <TravelBar
            campaignId={campaignId}
            selectedNode={selectedNode}
            currentNode={currentNode}
            adjacentIds={adjacentIds}
            canAttemptDistantTravel={canAttemptDistantTravel}
            onTravel={onTravel}
          />
        )}
      </div>
    </div>
  );
}

function TravelBar({ campaignId, selectedNode, currentNode, adjacentIds, canAttemptDistantTravel, onTravel }) {
  const { t } = useTranslation();
  const [travelPending, setTravelPending] = useState(false);
  const [travelError, setTravelError] = useState(null);

  const travelState = useMemo(() => {
    if (!selectedNode) return 'none';
    if (currentNode?.id === selectedNode.id) return 'current';
    if (adjacentIds?.has?.(selectedNode.id)) return 'adjacent';
    return 'distant';
  }, [selectedNode, currentNode?.id, adjacentIds]);

  const handleTravel = useCallback(async () => {
    if (!selectedNode || travelState === 'current' || travelPending) return;

    setTravelError(null);
    if (travelState === 'adjacent') {
      onTravel?.(selectedNode.name);
      return;
    }

    if (!canAttemptDistantTravel) {
      setTravelError(t('locationGraph.travelInspector.errors.quietSceneRequired'));
      return;
    }

    setTravelPending(true);
    try {
      const result = await apiClient.request(
        `/livingWorld/campaigns/${campaignId}/travel-check`,
        { method: 'POST', body: { destinationName: selectedNode.name } },
      );
      if (result.allowed) {
        onTravel?.(selectedNode.name);
      } else {
        onTravel?.(selectedNode.name, { travelFailureReason: result.reason });
      }
    } catch (err) {
      setTravelError(err?.message || t('locationGraph.travelInspector.errors.travelCheckFailed'));
    } finally {
      setTravelPending(false);
    }
  }, [campaignId, selectedNode, travelState, travelPending, canAttemptDistantTravel, onTravel, t]);

  const travelStatusKey = `locationGraph.travelInspector.status.${travelState}`;

  return (
    <div className="border-t border-outline-variant/15 px-4 py-3 space-y-2">
      <div className="text-xs text-on-surface-variant">
        {t('locationGraph.travelInspector.travelStatus')}: {t(travelStatusKey)}
      </div>
      {travelError && (
        <div className="px-2 py-1.5 rounded border border-error/35 bg-error/10 text-error text-xs">
          {travelError}
        </div>
      )}
      <button
        type="button"
        onClick={handleTravel}
        disabled={travelState === 'current' || travelPending}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-primary/35 bg-primary/12 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {travelPending && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
        {travelPending
          ? t('locationGraph.travelInspector.travelChecking')
          : t('locationGraph.travelInspector.travelHere')}
      </button>
    </div>
  );
}
