import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterSprites } from '../../../hooks/useCharacterSprites';
import { useCurrentLocationNode } from '../../../hooks/useCurrentLocationNode';
import { useLocationGraph } from '../../../hooks/useLocationGraph';
import { useNodeImageBulkGeneration } from '../../../hooks/useNodeImageBulkGeneration';
import { useGameScenes } from '../../../stores/gameSelectors';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import { isQuietScene } from '../../../services/quietSceneCheck';
import { apiClient } from '../../../services/apiClient';
import {
  forceDirectedLayout,
  GRAPH_LAYOUT_W,
  GRAPH_LAYOUT_H,
} from '../../../services/graphLayout.js';
import {
  loadGraphLayout,
  saveGraphLayout,
  GRAPH_LAYOUT_STORAGE_PREFIX,
  GRAPH_LAYOUT_STORAGE_CHANGED,
} from '../../../utils/graphLayoutStorage.js';
import GraphCanvas from '../locationGraph/GraphCanvas.jsx';
import HierarchyTree from '../locationGraph/HierarchyTree.jsx';
import InspectorPanel from '../locationGraph/InspectorPanel.jsx';

export default function MapTab({ campaignId, onTravel }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
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

  const bulkImageGen = useNodeImageBulkGeneration({
    campaignId,
    onNodeComplete: useCallback((nodeId, url) => {
      graph.updateNode(nodeId, { nodeImageUrl: url });
    }, [graph]),
  });

  const stdProvider = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'].includes(settings.sceneImageTier)
    ? settings.sceneImageTier
    : null;

  const handleAutoLayout = useCallback(() => {
    const nodeIds = nodes.map((n) => n.id);
    const edgeLinks = edges.map((e) => ({ from: e.fromId, to: e.toId }));
    const layoutMap = forceDirectedLayout(nodeIds, edgeLinks, {
      width: GRAPH_LAYOUT_W, height: GRAPH_LAYOUT_H,
    });
    const overrides = {};
    layoutMap.forEach((pos, id) => { overrides[id] = pos; });
    setPositionOverrides(overrides);
    saveGraphLayout(campaignId, overrides, false);
  }, [nodes, edges, campaignId]);

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

  const handleNodeDragEnd = useCallback((nodeId, pos) => {
    setPositionOverrides((prev) => {
      const next = { ...prev, [nodeId]: pos };
      saveGraphLayout(campaignId, next, false);
      return next;
    });
  }, [campaignId]);

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

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 relative bg-black/40 rounded-sm border border-amber-900/30 ring-1 ring-amber-700/10 shadow-[inset_0_0_40px_rgba(120,53,15,0.15),inset_0_0_80px_rgba(0,0,0,0.3)]">
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
            onNodeDragEnd={handleNodeDragEnd}
            highlightedNodeId={currentNode?.id || null}
            highlightedAdjacentIds={adjacentIds}
          />
        </div>
        <MapToolbar
          onAutoLayout={handleAutoLayout}
          bulkImageGen={bulkImageGen}
          nodes={allNodes || nodes}
          stdProvider={stdProvider}
          sdModel={settings.sdWebuiModel || null}
          t={t}
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

const BULK_PROVIDER_OPTIONS = [
  { id: 'pixellab', label: 'PixelLab', icon: 'auto_fix_high' },
  { id: 'standard', label: 'Standard', icon: 'image' },
];

function MapToolbar({ onAutoLayout, bulkImageGen, nodes, stdProvider, sdModel, t }) {
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const { start, cancel, clearProgress, isActive, progress } = bulkImageGen;
  const missingCount = nodes ? nodes.filter((n) => !n.nodeImageUrl).length : 0;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-t border-outline-variant/10 text-xs">
      <button
        type="button"
        onClick={onAutoLayout}
        title={t('locationGraph.toolbar.autoLayout', { defaultValue: 'Ułóż graf' })}
        className="flex items-center gap-1 px-3 py-1.5 rounded-sm hover:bg-white/5 text-on-surface-variant transition-colors uppercase tracking-widest"
      >
        <span className="material-symbols-outlined text-sm">hub</span>
        {t('locationGraph.toolbar.autoLayout', { defaultValue: 'Ułóż graf' })}
      </button>

      <div className="w-px h-5 bg-outline-variant/20" />

      {isActive && progress ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs">
            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            <span>{progress.done}/{progress.total}</span>
            {progress.failed > 0 && <span className="text-red-400">({progress.failed} err)</span>}
            <span className="text-tertiary/50">{Math.round(((progress.done + progress.failed) / progress.total) * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="flex items-center gap-1 px-2 py-1 rounded-sm bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
            Stop
          </button>
        </div>
      ) : progress && (progress.status === 'completed' || progress.status === 'cancelled') ? (
        <div className="flex items-center gap-2">
          <span className={`text-xs ${progress.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>
            {progress.status === 'completed'
              ? `Gotowe: ${progress.done}${progress.failed ? `, err: ${progress.failed}` : ''}`
              : 'Anulowano'}
          </span>
          <button type="button" onClick={clearProgress} className="text-outline hover:text-on-surface text-xs">×</button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProviderMenu((v) => !v)}
            disabled={missingCount === 0}
            title={t('locationGraph.toolbar.generateAllImages', { defaultValue: 'Generuj wszystkie obrazki' })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-sm bg-tertiary/10 border border-tertiary/20 hover:bg-tertiary/20 text-tertiary text-xs transition-colors uppercase tracking-widest disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            {t('locationGraph.toolbar.generateAllImages', { defaultValue: 'Generuj wszystkie' })}
            {missingCount > 0 && <span className="text-tertiary/50 ml-0.5">({missingCount})</span>}
          </button>
          {showProviderMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProviderMenu(false)} />
              <div className="absolute bottom-full left-0 mb-1 bg-surface-container-highest border border-outline-variant/20 rounded-sm shadow-xl py-1 min-w-[160px] z-50">
                {BULK_PROVIDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setShowProviderMenu(false);
                      if (opt.id === 'pixellab') {
                        start(nodes, { provider: 'pixellab' });
                      } else {
                        start(nodes, {
                          provider: stdProvider || 'dalle',
                          sdModel: (stdProvider || 'dalle') === 'sd-webui' ? sdModel : null,
                        });
                      }
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 text-on-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
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
