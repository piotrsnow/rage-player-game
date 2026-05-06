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
  selectedNode, selectedEdge, allNodes, occupants = [],
  onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
  mode,
}) {
  const { t } = useTranslation();

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-outline text-xs uppercase tracking-widest gap-2 p-4">
        <span className="material-symbols-outlined text-2xl">info</span>
        {t('locationGraph.selectToInspect')}
      </div>
    );
  }

  if (selectedNode) {
    const nodeOccupants = occupants.filter((o) => o.locationId === selectedNode.id);
    return (
      <NodeInspector
        node={selectedNode}
        occupants={nodeOccupants}
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

function NodeInspector({ node, occupants = [], onUpdate, onDelete, mode, t }) {
  const vis = getNodeVisual(node.type);

  const handleField = useCallback((field, value) => {
    onUpdate(node.id, { [field]: value });
  }, [node.id, onUpdate]);

  return (
    <div className="overflow-y-auto custom-scrollbar p-3 space-y-3 text-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: vis.color }} />
        <span className="font-bold text-on-surface text-base truncate">{node.name}</span>
      </div>

      <Field label={t('locationGraph.inspector.name')}>
        <input
          className="bg-white/5 rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={node.name}
          onBlur={(e) => handleField('name', e.target.value)}
        />
      </Field>

      <Field label={t('locationGraph.inspector.type')}>
        <select
          className="bg-surface-container rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={node.type || 'generic'}
          onChange={(e) => handleField('type', e.target.value)}
        >
          {NODE_TYPE_OPTIONS.map((t) => {
            const v = getNodeVisual(t);
            return <option key={t} value={t} className="bg-surface-container text-on-surface py-1">{v.label}</option>;
          })}
        </select>
      </Field>

      <Field label={t('locationGraph.inspector.tags')}>
        <input
          className="bg-white/5 rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={(node.tags || []).join(', ')}
          placeholder="tag1, tag2, ..."
          onBlur={(e) => handleField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      </Field>

      <Field label={t('locationGraph.inspector.atmosphere')}>
        <input
          className="bg-white/5 rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          defaultValue={node.atmosphere || ''}
          onBlur={(e) => handleField('atmosphere', e.target.value)}
        />
      </Field>

      <Field label={t('locationGraph.inspector.dangerLevel')}>
        <select
          className="bg-surface-container rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={node.dangerLevel || 'safe'}
          onChange={(e) => handleField('dangerLevel', e.target.value)}
        >
          {DANGER_LEVELS.map((d) => <option key={d} value={d} className="bg-surface-container text-on-surface py-1">{t(`locationGraph.danger.${d}`)}</option>)}
        </select>
      </Field>

      <Field label={t('locationGraph.inspector.scale')}>
        <input
          type="range" min={0} max={7} step={1}
          className="w-full"
          value={node.scale ?? 5}
          onChange={(e) => handleField('scale', Number(e.target.value))}
        />
        <span className="text-xs text-outline">{node.scale ?? 5}</span>
      </Field>

      {occupants.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-outline-variant/10">
          <span className="text-xs font-label uppercase tracking-widest text-outline">
            {t('locationGraph.inspector.occupants', { defaultValue: 'Postacie' })}
          </span>
          <ul className="space-y-1">
            {occupants.map((occ) => (
              <li key={occ.id} className="flex items-center gap-2 px-1.5 py-1 rounded-sm bg-white/5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: occ.type === 'player' ? '#22d3ee' : '#f472b6' }}
                />
                <span className="text-on-surface truncate">{occ.name}</span>
                <span className="ml-auto text-[10px] text-outline">
                  {occ.type === 'player' ? 'Gracz' : occ.role || 'NPC'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'gm' && (
        <button
          onClick={() => onDelete(node.id)}
          className="flex items-center gap-1 w-full px-2 py-2 rounded-sm text-red-400 hover:bg-red-500/10 transition-colors text-xs uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-base">delete</span>
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
        <span className="font-bold text-on-surface text-base">{edge.edgeType}</span>
      </div>

      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
        <span>{fromNode?.name || edge.fromId}</span>
        <span className="material-symbols-outlined text-xs">{edge.bidirectional ? 'swap_horiz' : 'arrow_forward'}</span>
        <span>{toNode?.name || edge.toId}</span>
      </div>

      <Field label={t('locationGraph.inspector.edgeType')}>
        <select
          className="bg-surface-container rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={edge.edgeType}
          onChange={(e) => handleField('edgeType', e.target.value)}
        >
          {Object.entries(edgeTypesByCategory).map(([cat, types]) => (
            <optgroup key={cat} label={t(`locationGraph.categories.${cat}`)} className="bg-surface-container text-on-surface">
              {types.map((type) => <option key={type} value={type} className="bg-surface-container text-on-surface py-1">{type.replace(/_/g, ' ')}</option>)}
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
          className="bg-surface-container rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={edge.discoveryState || 'unknown'}
          onChange={(e) => handleField('discoveryState', e.target.value)}
        >
          {DISCOVERY_OPTIONS.map((d) => <option key={d} value={d} className="bg-surface-container text-on-surface py-1">{t(`locationGraph.discovery.${d}`)}</option>)}
        </select>
      </Field>

      {mode === 'gm' && (
        <button
          onClick={() => onDelete(edge.id)}
          className="flex items-center gap-1 w-full px-2 py-2 rounded-sm text-red-400 hover:bg-red-500/10 transition-colors text-xs uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-base">delete</span>
          {t('locationGraph.inspector.deleteEdge')}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-label uppercase tracking-widest text-outline">{label}</label>
      {children}
    </div>
  );
}
