import { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y.js';
import { useLocationGraph } from '../../../hooks/useLocationGraph.js';
import { useCharacterSprites } from '../../../hooks/useCharacterSprites.js';
import { apiClient } from '../../../services/apiClient.js';
import { useGraphShortcuts } from '../../../hooks/useGraphShortcuts.js';
import { useEntityBrowser } from '../../../hooks/useEntityBrowser.js';
import GraphCanvas from './GraphCanvas.jsx';
import HierarchyTree from './HierarchyTree.jsx';
import InspectorPanel from './InspectorPanel.jsx';
import GraphToolbar from './GraphToolbar.jsx';
import AddNodeForm from './AddNodeForm.jsx';
import AddEdgeFlow from './AddEdgeFlow.jsx';
import ModalNavBar from './ModalNavBar.jsx';
import EntityBrowserPanel from './EntityBrowserPanel.jsx';
import EntityInspector from './EntityInspector.jsx';
import NpcDetailsModal from './NpcDetailsModal.jsx';
import {
  getGeoProjectionParams,
  layoutPxToRegion,
  GRAPH_LAYOUT_W,
  GRAPH_LAYOUT_H,
  GRAPH_LAYOUT_PAD,
} from '../../../services/graphLayout.js';
import { loadGraphLayout, saveGraphLayout } from '../../../utils/graphLayoutStorage.js';

export default function LocationGraphModal({ campaignId, onClose, openGeneration = 0 }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const graph = useLocationGraph(campaignId, { openGeneration });

  const spriteItems = useMemo(
    () => (graph.occupants || []).map((o) => ({
      id: o.id,
      kind: o.type === 'player' ? 'character' : 'campaign-npc',
      spriteUrl: o.spriteUrl,
    })),
    [graph.occupants],
  );
  const extraOccupantSprites = useCharacterSprites(spriteItems, {
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
  const entityBrowser = useEntityBrowser(campaignId);
  const [activeTab, setActiveTab] = useState('graph');
  const [selectedNpcId, setSelectedNpcId] = useState(null);

  const [addingNode, setAddingNode] = useState(false);
  const [addingEdge, setAddingEdge] = useState(false);
  const [edgeSource, setEdgeSource] = useState(null);
  const [showNodeForm, setShowNodeForm] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const searchInputRef = useRef(null);

  const [layoutState] = useState(() => loadGraphLayout(campaignId));
  const [positionOverrides, setPositionOverrides] = useState(layoutState.overrides);
  const [snapToGrid, setSnapToGrid] = useState(layoutState.snap);

  const handleNodeDragEnd = useCallback(async (nodeId, pos) => {
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
          saveGraphLayout(campaignId, next, snapToGrid);
          return next;
        });
        return;
      } catch (err) {
        console.error(err);
      }
    }
    setPositionOverrides((prev) => {
      const next = { ...prev, [nodeId]: pos };
      saveGraphLayout(campaignId, next, snapToGrid);
      return next;
    });
  }, [campaignId, snapToGrid, graph]);

  const handleResetLayout = useCallback(() => {
    setPositionOverrides({});
    saveGraphLayout(campaignId, {}, snapToGrid);
  }, [campaignId, snapToGrid]);

  const handleToggleSnap = useCallback(() => {
    setSnapToGrid((prev) => {
      const next = !prev;
      saveGraphLayout(campaignId, positionOverrides, next);
      return next;
    });
  }, [campaignId, positionOverrides]);

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
    if (addingNode) {
      setShowNodeForm(pos);
      setAddingNode(false);
    }
  }, [addingNode]);

  const handleEdgeSourceClick = useCallback((node) => {
    if (!edgeSource) {
      setEdgeSource(node);
    } else {
      setAddingEdge(false);
    }
  }, [edgeSource]);

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
      if (activeTab !== 'graph') return;
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
    onToggleAddNode: () => activeTab === 'graph' && handleAddNodeToggle(),
    onToggleAddEdge: () => activeTab === 'graph' && handleAddEdgeToggle(),
    onCycleFocus: () => {},
  });

  const handleNpcClick = useCallback((occ) => {
    if (occ?.id) setSelectedNpcId(occ.id);
  }, []);

  const handleDoubleClickNode = useCallback((node) => {
    if (graph.mode !== 'gm') return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('locationGraph.title')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-[95vw] h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">hub</span>
            {t('locationGraph.title')}
          </h2>
          <div className="flex items-center gap-2">
            {graph.loading && <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>}
            <button onClick={onClose} aria-label={t('common.close')} className="text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Body — nav bar + tab-dependent content */}
        <div className="flex-1 flex min-h-0">
          <ModalNavBar activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'graph' ? (
            <>
              {/* Left sidebar — tree */}
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

              {/* Center — canvas */}
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
                      <button onClick={() => setValidationResult(null)} className="mt-1 text-[10px] underline opacity-60">
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
                    addingNode={addingNode}
                    onCanvasClick={handleCanvasClick}
                    addingEdge={addingEdge}
                    onEdgeSourceClick={handleEdgeSourceClick}
                    positionOverrides={positionOverrides}
                    onNodeDragEnd={handleNodeDragEnd}
                    snapToGrid={snapToGrid}
                  />

                  {showNodeForm && (
                    <AddNodeForm
                      position={showNodeForm}
                      allNodes={graph.allNodes}
                      onSubmit={handleNodeCreated}
                      onCancel={() => setShowNodeForm(null)}
                    />
                  )}

                  {addingEdge && edgeSource && (
                    <AddEdgeFlow
                      sourceNode={edgeSource}
                      allNodes={graph.allNodes}
                      onSubmit={handleEdgeCreated}
                      onCancel={() => { setEdgeSource(null); setAddingEdge(false); }}
                    />
                  )}
                </div>

                <GraphToolbar
                  filters={graph.filters}
                  onToggleFilter={handleToggleFilter}
                  scaleFilter={graph.scaleFilter}
                  onScaleChange={graph.setScaleFilter}
                  onAddNode={handleAddNodeToggle}
                  onAddEdge={handleAddEdgeToggle}
                  addingNode={addingNode}
                  addingEdge={addingEdge}
                  mode={graph.mode}
                  onModeChange={() => graph.setMode((m) => m === 'gm' ? 'player' : 'gm')}
                  searchQuery={graph.searchQuery}
                  onSearch={graph.search}
                  onValidate={handleValidate}
                  searchInputRef={searchInputRef}
                  snapToGrid={snapToGrid}
                  onToggleSnap={handleToggleSnap}
                  onResetLayout={handleResetLayout}
                />
              </div>

              {/* Right sidebar — graph inspector */}
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
                    campaignId={campaignId}
                    onNpcClick={handleNpcClick}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Left sidebar — type filter */}
              <div className="w-48 border-r border-outline-variant/15 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="px-4 py-2 border-b border-outline-variant/15">
                  <span className="text-xs font-label uppercase tracking-widest text-outline">
                    {t('locationGraph.entityBrowser.types')}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  <button
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

              {/* Center — entity table */}
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
                campaignId={campaignId}
                PAGE_SIZE={entityBrowser.PAGE_SIZE}
                ENTITY_TYPES={entityBrowser.ENTITY_TYPES}
              />

              {/* Right sidebar — entity inspector */}
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
          )}
        </div>

        {selectedNpcId && (
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
