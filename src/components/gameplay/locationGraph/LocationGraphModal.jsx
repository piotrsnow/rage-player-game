import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y.js';
import { useLocationGraph } from '../../../hooks/useLocationGraph.js';
import GraphCanvas from './GraphCanvas.jsx';
import HierarchyTree from './HierarchyTree.jsx';
import InspectorPanel from './InspectorPanel.jsx';
import GraphToolbar from './GraphToolbar.jsx';
import AddNodeForm from './AddNodeForm.jsx';
import AddEdgeFlow from './AddEdgeFlow.jsx';

export default function LocationGraphModal({ campaignId, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const graph = useLocationGraph(campaignId);

  const [addingNode, setAddingNode] = useState(false);
  const [addingEdge, setAddingEdge] = useState(false);
  const [edgeSource, setEdgeSource] = useState(null);
  const [showNodeForm, setShowNodeForm] = useState(null); // { x, y } or null
  const [validationResult, setValidationResult] = useState(null);
  const [renaming, setRenaming] = useState(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-label={t('locationGraph.title')}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-6xl h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">hub</span>
            <h2 className="text-xs font-bold text-on-surface uppercase tracking-widest">{t('locationGraph.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            {graph.loading && <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>}
            <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
          </div>
        </div>

        {/* Body — 3-column layout */}
        <div className="flex-1 flex min-h-0">
          {/* Left sidebar — tree */}
          <div className="w-48 border-r border-outline-variant/10 flex-shrink-0 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-outline-variant/10">
              <span className="text-[10px] font-label uppercase tracking-widest text-outline">{t('locationGraph.hierarchy')}</span>
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
            <div className="flex-1 relative">
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
                selected={graph.selected}
                onSelect={graph.setSelected}
                onDoubleClickNode={handleDoubleClickNode}
                addingNode={addingNode}
                onCanvasClick={handleCanvasClick}
                addingEdge={addingEdge}
                onEdgeSourceClick={handleEdgeSourceClick}
                mode={graph.mode}
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
            />
          </div>

          {/* Right sidebar — inspector */}
          <div className="w-56 border-l border-outline-variant/10 flex-shrink-0 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-outline-variant/10">
              <span className="text-[10px] font-label uppercase tracking-widest text-outline">{t('locationGraph.inspector.title')}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <InspectorPanel
                selectedNode={graph.selectedNode}
                selectedEdge={graph.selectedEdge}
                allNodes={graph.allNodes}
                onUpdateNode={graph.updateNode}
                onUpdateEdge={graph.updateEdge}
                onDeleteNode={handleDeleteNode}
                onDeleteEdge={handleDeleteEdge}
                mode={graph.mode}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
