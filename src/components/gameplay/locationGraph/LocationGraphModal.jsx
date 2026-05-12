import { lazy, Suspense, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y.js';
import { useLocationGraph } from '../../../hooks/useLocationGraph.js';
import { useWorldGraph } from '../../../hooks/useWorldGraph.js';
import { useCharacterSprites } from '../../../hooks/useCharacterSprites.js';
import { apiClient } from '../../../services/apiClient.js';
import { useGraphShortcuts } from '../../../hooks/useGraphShortcuts.js';
import { useEntityBrowser } from '../../../hooks/useEntityBrowser.js';
import { useWorldGraphSpriteJob } from '../../../hooks/useWorldGraphSpriteJob.js';
import { useNodeImageBulkGeneration } from '../../../hooks/useNodeImageBulkGeneration.js';
import { useGraphRevision } from '../../../hooks/useGraphRevision.js';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import GraphCanvas from './GraphCanvas.jsx';
import HierarchyTree from './HierarchyTree.jsx';
import InspectorPanel from './InspectorPanel.jsx';
import GraphToolbar from './GraphToolbar.jsx';
import AddNodeForm from './AddNodeForm.jsx';
import AddEdgeFlow from './AddEdgeFlow.jsx';
import RevisionPanel from './RevisionPanel.jsx';
import ModalNavBar from './ModalNavBar.jsx';
import EntityBrowserPanel from './EntityBrowserPanel.jsx';
import EntityInspector from './EntityInspector.jsx';
import NpcDetailsModal from './NpcDetailsModal.jsx';

const AdminNpcListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/NpcListTab'));
const AdminLocationListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/LocationListTab'));
const AdminEventTimelineTab = lazy(() => import('../../admin/adminLivingWorld/tabs/EventTimelineTab'));
const AdminReputationListTab = lazy(() => import('../../admin/adminLivingWorld/tabs/ReputationListTab'));
const AdminWorldLoreTab = lazy(() => import('../../admin/AdminWorldLoreTab'));
const AdminPromotionsTab = lazy(() => import('../../admin/adminLivingWorld/tabs/PromotionsTab'));
const AdminCanonGraphTab = lazy(() => import('../../admin/adminLivingWorld/tabs/CanonGraphTab'));
const AdminEntityRegistryTab = lazy(() => import('../../admin/adminLivingWorld/tabs/EntityRegistryTab'));
const AdminFontConfigTab = lazy(() => import('../../admin/adminLivingWorld/tabs/FontConfigTab'));

const ADMIN_TAB_COMPONENTS = {
  'admin-npcs': AdminNpcListTab,
  'admin-locations': AdminLocationListTab,
  'admin-events': AdminEventTimelineTab,
  'admin-reputation': AdminReputationListTab,
  'admin-lore': AdminWorldLoreTab,
  'admin-promotions': AdminPromotionsTab,
  'admin-canon': AdminCanonGraphTab,
  'admin-registry': AdminEntityRegistryTab,
  'admin-fonts': AdminFontConfigTab,
};
import {
  getGeoProjectionParams,
  layoutPxToRegion,
  GRAPH_LAYOUT_W,
  GRAPH_LAYOUT_H,
  GRAPH_LAYOUT_PAD,
} from '../../../services/graphLayout.js';
import { loadGraphLayout, saveGraphLayout } from '../../../utils/graphLayoutStorage.js';

const LAYOUT_WORLD_KEY = '__world_admin__';

/**
 * @param {{ campaignId?: string|null, onClose: () => void, openGeneration?: number, worldMode?: boolean }} props
 */
export default function LocationGraphModal({ campaignId = null, onClose, openGeneration = 0, worldMode = false }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { backendUser, settings } = useSettings();
  const isAdmin = !!backendUser?.isAdmin;
  const layoutStorageKey = worldMode ? LAYOUT_WORLD_KEY : campaignId;

  const [showOrphans, setShowOrphans] = useState(false);

  const campaignGraph = useLocationGraph(worldMode ? null : campaignId, {
    openGeneration,
    paused: worldMode,
  });
  const worldGraphHook = useWorldGraph({ openGeneration, paused: !worldMode, showOrphans });

  const graph = worldMode ? worldGraphHook : campaignGraph;

  const spriteItems = useMemo(
    () => (graph.occupants || []).map((o) => ({
      id: o.id,
      kind: worldMode
        ? 'world-npc'
        : (o.type === 'player' ? 'character' : 'campaign-npc'),
      spriteUrl: o.spriteUrl,
    })),
    [graph.occupants, worldMode],
  );
  const extraOccupantSprites = useCharacterSprites(spriteItems, worldMode ? {
    endpoint: 'admin',
  } : {
    campaignId,
    endpoint: 'campaign',
  });
  const occupantSpriteMap = useMemo(() => {
    const m = { ...extraOccupantSprites };
    for (const o of graph.occupants || []) {
      if (o.spriteUrl) m[o.id] = apiClient.resolveMediaUrl(o.spriteUrl);
    }
    return m;
  }, [graph.occupants, extraOccupantSprites]);
  const entityBrowser = useEntityBrowser(worldMode ? null : campaignId);
  const spriteJob = useWorldGraphSpriteJob({
    onComplete: worldMode ? worldGraphHook.fetchGraph : undefined,
  });

  const stdProvider = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'].includes(settings.sceneImageTier)
    ? settings.sceneImageTier
    : null;

  const bulkImageGenHook = useNodeImageBulkGeneration({
    campaignId: worldMode ? undefined : campaignId,
    onNodeComplete: useCallback((nodeId, url) => {
      graph.updateNode(nodeId, { nodeImageUrl: url });
    }, [graph]),
  });

  const bulkImageGen = useMemo(() => ({
    ...bulkImageGenHook,
    nodes: graph.allNodes,
    stdProvider,
    startPixelLab: () => {
      if (worldMode) {
        spriteJob.start(graph.allNodes);
      } else {
        bulkImageGenHook.start(graph.allNodes, { provider: 'pixellab' });
      }
    },
    startStandard: (provider) => {
      const p = provider || stdProvider || 'dalle';
      bulkImageGenHook.start(graph.allNodes, {
        provider: p,
        sdModel: p === 'sd-webui' ? (settings.sdWebuiModel || null) : null,
      });
    },
  }), [bulkImageGenHook, graph.allNodes, stdProvider, worldMode, spriteJob, settings.sdWebuiModel]);

  const revision = useGraphRevision({ graph, worldMode, campaignId });

  const [activeTab, setActiveTab] = useState('graph');
  const [selectedNpcId, setSelectedNpcId] = useState(null);

  const [addingNode, setAddingNode] = useState(false);
  const [addingEdge, setAddingEdge] = useState(false);
  const [edgeSource, setEdgeSource] = useState(null);
  const [showNodeForm, setShowNodeForm] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const searchInputRef = useRef(null);

  const [layoutState] = useState(() => loadGraphLayout(layoutStorageKey));
  const [positionOverrides, setPositionOverrides] = useState(layoutState.overrides);
  const [snapToGrid, setSnapToGrid] = useState(layoutState.snap);

  const handleNodeDragEnd = useCallback(async (nodeId, pos) => {
    if (graph.readOnly) {
      setPositionOverrides((prev) => {
        const next = { ...prev, [nodeId]: pos };
        saveGraphLayout(layoutStorageKey, next, snapToGrid);
        return next;
      });
      return;
    }
    const params = getGeoProjectionParams(graph.allNodes, {
      width: GRAPH_LAYOUT_W,
      height: GRAPH_LAYOUT_H,
      pad: GRAPH_LAYOUT_PAD,
    });
    const km = params ? layoutPxToRegion(pos.x, pos.y, params) : null;
    if (km) {
      try {
        await graph.updateNode(nodeId, { regionX: km.regionX, regionY: km.regionY });
        setPositionOverrides((prev) => {
          const next = { ...prev };
          delete next[nodeId];
          saveGraphLayout(layoutStorageKey, next, snapToGrid);
          return next;
        });
        return;
      } catch (err) {
        console.error(err);
      }
    }
    setPositionOverrides((prev) => {
      const next = { ...prev, [nodeId]: pos };
      saveGraphLayout(layoutStorageKey, next, snapToGrid);
      return next;
    });
  }, [layoutStorageKey, snapToGrid, graph]);

  const handleResetLayout = useCallback(() => {
    setPositionOverrides({});
    saveGraphLayout(layoutStorageKey, {}, snapToGrid);
  }, [layoutStorageKey, snapToGrid]);

  const handleToggleSnap = useCallback(() => {
    setSnapToGrid((prev) => {
      const next = !prev;
      saveGraphLayout(layoutStorageKey, positionOverrides, next);
      return next;
    });
  }, [layoutStorageKey, positionOverrides]);

  const handleAddNodeToggle = useCallback(() => {
    setAddingNode((v) => !v);
    setAddingEdge(false);
    setEdgeSource(null);
  }, []);

  const handleAddEdgeToggle = useCallback(() => {
    setAddingEdge((v) => !v);
    setAddingNode(false);
    setShowNodeForm(null);
    setEdgeSource(null);
  }, []);

  const handleCanvasClick = useCallback((pos) => {
    if (graph.readOnly) return;
    if (addingNode) {
      setShowNodeForm(pos);
      setAddingNode(false);
    }
  }, [addingNode, graph.readOnly]);

  const handleEdgeSourceClick = useCallback((node) => {
    if (graph.readOnly) return;
    if (!edgeSource) {
      setEdgeSource(node);
    } else {
      setAddingEdge(false);
    }
  }, [edgeSource, graph.readOnly]);

  const handleNodeCreated = useCallback(async (data) => {
    try {
      await graph.createNode(data);
      setShowNodeForm(null);
    } catch (err) {
      console.error('Failed to create node:', err);
    }
  }, [graph]);

  const handleEdgeCreated = useCallback(async (data) => {
    try {
      await graph.createEdge(data);
      setEdgeSource(null);
      setAddingEdge(false);
    } catch (err) {
      console.error('Failed to create edge:', err);
    }
  }, [graph]);

  const handleDeleteNode = useCallback(async (nodeId) => {
    if (!confirm(t('locationGraph.confirmDeleteNode'))) return;
    try { await graph.deleteNode(nodeId); } catch (err) { console.error(err); }
  }, [graph, t]);

  const handleDeleteEdge = useCallback(async (edgeId) => {
    if (!confirm(t('locationGraph.confirmDeleteEdge'))) return;
    try { await graph.deleteEdge(edgeId); } catch (err) { console.error(err); }
  }, [graph, t]);

  useGraphShortcuts({
    onDelete: () => {
      if (graph.readOnly || activeTab !== 'graph') return;
      if (graph.selectedNode) handleDeleteNode(graph.selectedNode.id);
      else if (graph.selectedEdge) handleDeleteEdge(graph.selectedEdge.id);
    },
    onEscape: () => {
      setAddingNode(false);
      setAddingEdge(false);
      setEdgeSource(null);
      setShowNodeForm(null);
      graph.setSelected(null);
    },
    onFocusSearch: () => activeTab === 'graph' && searchInputRef.current?.focus(),
    onToggleAddNode: () => activeTab === 'graph' && !graph.readOnly && handleAddNodeToggle(),
    onToggleAddEdge: () => activeTab === 'graph' && !graph.readOnly && handleAddEdgeToggle(),
    onCycleFocus: () => {},
  });

  const handleNpcClick = useCallback((occ) => {
    if (worldMode || !graph.fetchNpcDetails) return;
    if (occ?.id) setSelectedNpcId(occ.id);
  }, [worldMode, graph.fetchNpcDetails]);

  const handleDoubleClickNode = useCallback((node) => {
    if (graph.readOnly || graph.mode !== 'gm') return;
    const newName = prompt(t('locationGraph.renamePrompt'), node.name);
    if (newName && newName !== node.name) {
      graph.updateNode(node.id, { name: newName });
    }
  }, [graph, t]);

  const handleValidate = useCallback(async () => {
    try {
      const result = await graph.validate();
      setValidationResult(result);
    } catch (err) {
      console.error(err);
    }
  }, [graph]);

  const handleToggleFilter = useCallback((cat) => {
    graph.setFilters((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, [graph]);

  const modalTitle = worldMode
    ? t('locationGraph.titleWorld', { defaultValue: 'Graf lokacji świata' })
    : t('locationGraph.title');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={modalTitle} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-[95vw] h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">
              {worldMode ? 'public' : 'hub'}
            </span>
            {modalTitle}
          </h2>
          <div className="flex items-center gap-2">
            {graph.loading && <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>}
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <ModalNavBar activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

          {activeTab === 'graph' ? (
            <>
              <div className="w-56 border-r border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="px-4 py-2 border-b border-outline-variant/15">
                  <span className="text-xs font-label uppercase tracking-widest text-outline">{t('locationGraph.hierarchy')}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <HierarchyTree
                    nodes={graph.allNodes}
                    edges={graph.allEdges}
                    selected={graph.selected}
                    onSelect={graph.setSelected}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 relative bg-black/40 border border-outline-variant/20 rounded-sm">
                  {graph.error && (
                    <div className="absolute top-2 left-2 right-2 z-10 bg-red-500/20 border border-red-500/30 rounded-sm px-3 py-1.5 text-xs text-red-300">
                      {graph.error}
                    </div>
                  )}
                  {validationResult && (
                    <div className={`absolute top-2 right-2 z-10 rounded-sm px-3 py-1.5 text-xs max-w-xs max-h-32 overflow-y-auto ${
                      validationResult.valid ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {validationResult.valid ? t('locationGraph.validationOk') : (
                        <ul className="list-disc pl-3 space-y-0.5">
                          {validationResult.warnings.slice(0, 10).map((w, i) => <li key={i}>{w.message}</li>)}
                        </ul>
                      )}
                      <button type="button" onClick={() => setValidationResult(null)} className="mt-1 text-[10px] underline opacity-60">
                        {t('common.close')}
                      </button>
                    </div>
                  )}

                  <GraphCanvas
                    nodes={graph.nodes}
                    edges={graph.edges}
                    occupants={graph.occupants}
                    occupantSpriteMap={occupantSpriteMap}
                    selected={graph.selected}
                    onSelect={graph.setSelected}
                    onDoubleClickNode={handleDoubleClickNode}
                    addingNode={addingNode && !graph.readOnly}
                    onCanvasClick={handleCanvasClick}
                    addingEdge={addingEdge && !graph.readOnly}
                    onEdgeSourceClick={handleEdgeSourceClick}
                    positionOverrides={positionOverrides}
                    onNodeDragEnd={handleNodeDragEnd}
                    snapToGrid={snapToGrid}
                  />

                  {showNodeForm && !graph.readOnly && (
                    <AddNodeForm
                      position={showNodeForm}
                      allNodes={graph.allNodes}
                      onSubmit={handleNodeCreated}
                      onCancel={() => setShowNodeForm(null)}
                    />
                  )}

                  {addingEdge && edgeSource && !graph.readOnly && (
                    <AddEdgeFlow
                      sourceNode={edgeSource}
                      allNodes={graph.allNodes}
                      onSubmit={handleEdgeCreated}
                      onCancel={() => { setEdgeSource(null); setAddingEdge(false); }}
                    />
                  )}

                  <RevisionPanel
                    revision={revision}
                    allNodes={graph.allNodes}
                    allEdges={graph.allEdges}
                  />
                </div>

                <GraphToolbar
                  readOnly={graph.readOnly}
                  filters={graph.filters}
                  onToggleFilter={handleToggleFilter}
                  scaleFilter={graph.scaleFilter}
                  onScaleChange={graph.setScaleFilter}
                  onAddNode={handleAddNodeToggle}
                  onAddEdge={handleAddEdgeToggle}
                  addingNode={addingNode}
                  addingEdge={addingEdge}
                  mode={graph.mode}
                  onModeChange={() => !graph.readOnly && graph.setMode((m) => m === 'gm' ? 'player' : 'gm')}
                  searchQuery={graph.searchQuery}
                  onSearch={graph.search}
                  onValidate={handleValidate}
                  searchInputRef={searchInputRef}
                  snapToGrid={snapToGrid}
                  onToggleSnap={handleToggleSnap}
                  onResetLayout={handleResetLayout}
                  spriteJob={worldMode ? { ...spriteJob, nodes: graph.allNodes } : undefined}
                  bulkImageGen={bulkImageGen}
                  revision={revision}
                  showOrphans={showOrphans}
                  onToggleOrphans={worldMode ? () => setShowOrphans((v) => !v) : undefined}
                />
              </div>

              <div className="w-[28rem] border-l border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="px-6 py-2 border-b border-outline-variant/15">
                  <span className="text-xs font-label uppercase tracking-widest text-outline">{t('locationGraph.inspector.title')}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <InspectorPanel
                    selectedNode={graph.selectedNode}
                    selectedEdge={graph.selectedEdge}
                    allNodes={graph.allNodes}
                    occupants={graph.occupants}
                    onUpdateNode={graph.updateNode}
                    onUpdateEdge={graph.updateEdge}
                    onDeleteNode={handleDeleteNode}
                    onDeleteEdge={handleDeleteEdge}
                    mode={graph.mode}
                    campaignId={worldMode ? undefined : campaignId}
                    worldMode={worldMode}
                    readOnly={graph.readOnly}
                    onNpcClick={handleNpcClick}
                  />
                </div>
              </div>
            </>
          ) : activeTab === 'entities' ? (
            <>
              <div className="w-48 border-r border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="px-4 py-2 border-b border-outline-variant/15">
                  <span className="text-xs font-label uppercase tracking-widest text-outline">
                    {t('locationGraph.entityBrowser.types')}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  <button
                    type="button"
                    onClick={() => entityBrowser.setTypeFilter(null)}
                    className={`w-full text-left px-4 py-1.5 text-xs transition-colors ${
                      !entityBrowser.typeFilter ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-primary/5'
                    }`}
                  >
                    {t('locationGraph.entityBrowser.allTypes')}
                  </button>
                  {entityBrowser.ENTITY_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => entityBrowser.setTypeFilter(type)}
                      className={`w-full text-left px-4 py-1.5 text-xs transition-colors flex justify-between ${
                        entityBrowser.typeFilter === type ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-primary/5'
                      }`}
                    >
                      <span>{type}</span>
                      <span className="text-outline">{entityBrowser.counts[type] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>

              <EntityBrowserPanel
                entities={entityBrowser.entities}
                counts={entityBrowser.counts}
                loading={entityBrowser.loading}
                error={entityBrowser.error}
                typeFilter={entityBrowser.typeFilter}
                onTypeFilter={entityBrowser.setTypeFilter}
                search={entityBrowser.search}
                onSearch={entityBrowser.setSearch}
                page={entityBrowser.page}
                onPageChange={entityBrowser.setPage}
                selectedIds={entityBrowser.selectedIds}
                onToggleSelect={entityBrowser.toggleSelect}
                onSelectAll={entityBrowser.selectAll}
                onClearSelection={entityBrowser.clearSelection}
                onBulkDelete={entityBrowser.bulkDelete}
                onSelectEntity={entityBrowser.setSelected}
                campaignId={worldMode ? null : campaignId}
                PAGE_SIZE={entityBrowser.PAGE_SIZE}
                ENTITY_TYPES={entityBrowser.ENTITY_TYPES}
              />

              <div className="w-[28rem] border-l border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="px-6 py-2 border-b border-outline-variant/15">
                  <span className="text-xs font-label uppercase tracking-widest text-outline">
                    {t('locationGraph.entityBrowser.inspectorTitle')}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <EntityInspector
                    entity={entityBrowser.selected}
                    onDelete={entityBrowser.deleteEntity}
                  />
                </div>
              </div>
            </>
          ) : ADMIN_TAB_COMPONENTS[activeTab] ? (() => {
            const AdminTab = ADMIN_TAB_COMPONENTS[activeTab];
            return (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-on-surface-variant text-sm">Loading…</div>}>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  <AdminTab />
                </div>
              </Suspense>
            );
          })() : null}
        </div>

        {selectedNpcId && graph.fetchNpcDetails && (
          <NpcDetailsModal
            npcId={selectedNpcId}
            fetchNpcDetails={graph.fetchNpcDetails}
            onClose={() => setSelectedNpcId(null)}
          />
        )}
      </div>
    </div>
  );
}
