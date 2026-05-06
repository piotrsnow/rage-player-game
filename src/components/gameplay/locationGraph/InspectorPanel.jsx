import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { getNodeVisual, getEdgeVisual } from './graphVisuals.js';

const NODE_TYPE_OPTIONS = [
  'world', 'region', 'area', 'settlement', 'district',
  'site', 'room', 'point', 'abstract', 'dungeon',
];

const DANGER_LEVELS = ['safe', 'low', 'moderate', 'dangerous', 'deadly'];

const DISCOVERY_OPTIONS = ['unknown', 'rumored', 'known', 'visited', 'mapped', 'hidden'];

export default function InspectorPanel({
  selectedNode, selectedEdge, allNodes,
  onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
  mode,
}) {
  const { t } = useTranslation();

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-outline text-[10px] uppercase tracking-widest gap-2 p-4">
        <span className="material-symbols-outlined text-xl">info</span>
        {t('locationGraph.selectToInspect')}
      </div>
    );
  }

  if (selectedNode) {
    return (
      <NodeInspector
        node={selectedNode}
        onUpdate={onUpdateNode}
        onDelete={onDeleteNode}
        mode={mode}
        t={t}
      />
    );
  }

  return (
    <EdgeInspector
      edge={selectedEdge}
      allNodes={allNodes}
      onUpdate={onUpdateEdge}
      onDelete={onDeleteEdge}
      mode={mode}
      t={t}
    />
  );
}

function NodeInspector({ node, onUpdate, onDelete, mode, t }) {
  const vis = getNodeVisual(node.type);

  const handleField = useCallback((field, value) => {
    onUpdate(node.id, { [field]: value });
  }, [node.id, onUpdate]);

  return (
    <div className="overflow-y-auto custom-scrollbar p-3 space-y-3 text-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: vis.color }} />
        <span className="font-bold text-on-surface text-sm truncate">{node.name}</span>
      </div>

      <Field label={t('locationGraph.inspector.name')}>
        <input
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={node.name}
          onBlur={(e) => handleField('name', e.target.value)}
        />
      </Field>

      <Field label={t('locationGraph.inspector.type')}>
        <select
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10"
          value={node.type || 'generic'}
          onChange={(e) => handleField('type', e.target.value)}
        >
          {NODE_TYPE_OPTIONS.map((t) => {
            const v = getNodeVisual(t);
            return <option key={t} value={t}>{v.label}</option>;
          })}
        </select>
      </Field>

      <Field label={t('locationGraph.inspector.tags')}>
        <input
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={(node.tags || []).join(', ')}
          placeholder="tag1, tag2, ..."
          onBlur={(e) => handleField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </Field>

      <Field label={t('locationGraph.inspector.atmosphere')}>
        <input
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={node.atmosphere || ''}
          onBlur={(e) => handleField('atmosphere', e.target.value)}
        />
      </Field>

      <Field label={t('locationGraph.inspector.dangerLevel')}>
        <select
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10"
          value={node.dangerLevel || 'safe'}
          onChange={(e) => handleField('dangerLevel', e.target.value)}
        >
          {DANGER_LEVELS.map((d) => <option key={d} value={d}>{t(`locationGraph.danger.${d}`)}</option>)}
        </select>
      </Field>

      <Field label={t('locationGraph.inspector.scale')}>
        <input
          type="range" min={0} max={7} step={1}
          className="w-full"
          value={node.scale ?? 5}
          onChange={(e) => handleField('scale', Number(e.target.value))}
        />
        <span className="text-[10px] text-outline">{node.scale ?? 5}</span>
      </Field>

      {mode === 'gm' && (
        <button
          onClick={() => onDelete(node.id)}
          className="flex items-center gap-1 w-full px-2 py-1.5 rounded-sm text-red-400 hover:bg-red-500/10 transition-colors text-[10px] uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
          {t('locationGraph.inspector.deleteNode')}
        </button>
      )}
    </div>
  );
}

function EdgeInspector({ edge, allNodes, onUpdate, onDelete, mode, t }) {
  const vis = getEdgeVisual(edge.category);
  const fromNode = allNodes.find((n) => n.id === edge.fromId);
  const toNode = allNodes.find((n) => n.id === edge.toId);

  const edgeTypesByCategory = {};
  for (const [name, info] of Object.entries(EDGE_TYPES)) {
    const cat = info.category;
    if (!edgeTypesByCategory[cat]) edgeTypesByCategory[cat] = [];
    edgeTypesByCategory[cat].push(name);
  }

  const handleField = useCallback((field, value) => {
    onUpdate(edge.id, { [field]: value });
  }, [edge.id, onUpdate]);

  return (
    <div className="overflow-y-auto custom-scrollbar p-3 space-y-3 text-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
        <span className="w-6 h-0.5" style={{ backgroundColor: vis.color }} />
        <span className="font-bold text-on-surface text-sm">{edge.edgeType}</span>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">
        <span>{fromNode?.name || edge.fromId}</span>
        <span className="material-symbols-outlined text-[10px]">{edge.bidirectional ? 'swap_horiz' : 'arrow_forward'}</span>
        <span>{toNode?.name || edge.toId}</span>
      </div>

      <Field label={t('locationGraph.inspector.edgeType')}>
        <select
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10"
          value={edge.edgeType}
          onChange={(e) => handleField('edgeType', e.target.value)}
        >
          {Object.entries(edgeTypesByCategory).map(([cat, types]) => (
            <optgroup key={cat} label={t(`locationGraph.categories.${cat}`)}>
              {types.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label={t('locationGraph.inspector.bidirectional')}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={edge.bidirectional}
            onChange={(e) => handleField('bidirectional', e.target.checked)}
            className="rounded"
          />
          <span className="text-on-surface-variant">{edge.bidirectional ? '↔' : '→'}</span>
        </label>
      </Field>

      <Field label={t('locationGraph.inspector.discoveryState')}>
        <select
          className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface border border-outline-variant/10"
          value={edge.discoveryState || 'unknown'}
          onChange={(e) => handleField('discoveryState', e.target.value)}
        >
          {DISCOVERY_OPTIONS.map((d) => <option key={d} value={d}>{t(`locationGraph.discovery.${d}`)}</option>)}
        </select>
      </Field>

      {mode === 'gm' && (
        <button
          onClick={() => onDelete(edge.id)}
          className="flex items-center gap-1 w-full px-2 py-1.5 rounded-sm text-red-400 hover:bg-red-500/10 transition-colors text-[10px] uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
          {t('locationGraph.inspector.deleteEdge')}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-label uppercase tracking-widest text-outline">{label}</label>
      {children}
    </div>
  );
}
