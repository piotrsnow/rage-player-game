import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { getNodeVisual, getEdgeVisual } from './graphVisuals.js';
import { SHAPE_PATHS, AVAILABLE_SHAPES, AVAILABLE_ICONS } from './nodeShapes.js';

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

      <Field label={t('locationGraph.inspector.shape', { defaultValue: 'Kształt' })}>
        <ShapePicker
          value={node.nodeShape || null}
          onChange={(v) => handleField('shape', v)}
          color={vis.color}
        />
      </Field>

      <Field label={t('locationGraph.inspector.icon', { defaultValue: 'Ikona' })}>
        <IconPicker
          value={node.nodeIcon || null}
          onChange={(v) => handleField('icon', v)}
        />
      </Field>

      {/* Faza 0 — biome / anchorType / tacticalGrid (GM mode only).
          biome: hint dla scenePlanner po Fazie 1 (zastąpi keyword detection).
          anchorType: explicit override mapowania na sceneAnchors.
          tacticalGrid: pełny editor pojawia się w Fazie 7 (na razie info-only). */}
      {mode === 'gm' && (
        <>
          <Field label={t('locationGraph.inspector.biome', { defaultValue: 'Biom' })}>
            <input
              className="bg-white/5 rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
              defaultValue={node.biome || ''}
              placeholder="forest, plains, mountain, urban, dungeon..."
              onBlur={(e) => handleField('biome', e.target.value || null)}
            />
          </Field>

          <Field label={t('locationGraph.inspector.anchorType', { defaultValue: 'Anchor (3D scene)' })}>
            <input
              className="bg-white/5 rounded-sm px-2.5 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
              defaultValue={node.anchorType || ''}
              placeholder="tavern, forest, dungeon, road, castle..."
              onBlur={(e) => handleField('anchorType', e.target.value || null)}
            />
          </Field>

          <Field label={t('locationGraph.inspector.tacticalGrid', { defaultValue: 'Siatka taktyczna' })}>
            <div className="text-[11px] text-outline">
              {node.tacticalGrid
                ? `${node.tacticalGrid.width}×${node.tacticalGrid.height} ${t('locationGraph.inspector.gridSet', { defaultValue: '(zdefiniowana)' })}`
                : t('locationGraph.inspector.gridDefault', { defaultValue: 'Brak — walka użyje domyślnej siatki 12×12' })}
            </div>
          </Field>
        </>
      )}

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

      {edge.category === 'movement' && typeof edge.metadata?.traversalCount === 'number' && edge.metadata.traversalCount > 0 && (
        <Field label={t('locationGraph.inspector.familiarity', { defaultValue: 'Znajomość trasy' })}>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">
              {edge.metadata.traversalCount >= 3 ? 'explore' : 'explore_off'}
            </span>
            <span>
              {edge.metadata.traversalCount}x
              {edge.metadata.traversalCount >= 3 ? ` — ${t('locationGraph.inspector.familiarRoute', { defaultValue: 'znana trasa' })}` : ''}
            </span>
          </div>
        </Field>
      )}

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

function ShapePicker({ value, onChange, color }) {
  const thumbR = 10;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={`w-7 h-7 rounded-sm border flex items-center justify-center transition-colors ${
          !value ? 'border-primary bg-primary/20' : 'border-outline-variant/20 bg-white/5 hover:bg-white/10'
        }`}
        title="Domyślny"
      >
        <svg width={20} height={20} viewBox="-12 -12 24 24">
          <circle r={thumbR} fill={color} opacity={0.8} />
        </svg>
      </button>
      {AVAILABLE_SHAPES.filter((s) => s !== 'circle').map((shape) => {
        const gen = SHAPE_PATHS[shape];
        if (!gen) return null;
        const active = value === shape;
        return (
          <button
            key={shape}
            onClick={() => onChange(shape)}
            className={`w-7 h-7 rounded-sm border flex items-center justify-center transition-colors ${
              active ? 'border-primary bg-primary/20' : 'border-outline-variant/20 bg-white/5 hover:bg-white/10'
            }`}
            title={shape}
          >
            <svg width={20} height={20} viewBox="-12 -12 24 24">
              <path d={gen(thumbR)} fill={color} opacity={0.8} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function IconPicker({ value, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const visibleIcons = expanded ? AVAILABLE_ICONS : AVAILABLE_ICONS.slice(0, 12);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => onChange(null)}
          className={`w-7 h-7 rounded-sm border flex items-center justify-center text-xs transition-colors ${
            !value ? 'border-primary bg-primary/20 text-primary' : 'border-outline-variant/20 bg-white/5 hover:bg-white/10 text-outline'
          }`}
          title="Domyślny"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
        {visibleIcons.map((icon) => {
          const active = value === icon;
          return (
            <button
              key={icon}
              onClick={() => onChange(icon)}
              className={`w-7 h-7 rounded-sm border flex items-center justify-center transition-colors ${
                active ? 'border-primary bg-primary/20 text-primary' : 'border-outline-variant/20 bg-white/5 hover:bg-white/10 text-on-surface-variant'
              }`}
              title={icon}
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
            </button>
          );
        })}
      </div>
      {AVAILABLE_ICONS.length > 12 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[10px] text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? 'Mniej ▲' : `Więcej (${AVAILABLE_ICONS.length}) ▼`}
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
