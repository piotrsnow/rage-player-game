import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { getNodeVisual, getEdgeVisual } from './graphVisuals.js';
import { SHAPE_PATHS, AVAILABLE_SHAPES, AVAILABLE_ICONS } from './nodeShapes.js';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import { apiClient } from '../../../services/apiClient.js';

const NODE_TYPE_OPTIONS = [
  'world', 'region', 'area', 'settlement', 'district',
  'site', 'room', 'point', 'abstract', 'dungeon',
];

const DANGER_LEVELS = ['safe', 'low', 'moderate', 'dangerous', 'deadly'];

const DISCOVERY_OPTIONS = ['unknown', 'rumored', 'known', 'visited', 'mapped', 'hidden'];

export default function InspectorPanel({
  selectedNode, selectedEdge, allNodes, occupants = [],
  onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
  mode, campaignId,
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
        campaignId={campaignId}
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

function NodeInspector({ node, occupants = [], onUpdate, onDelete, mode, campaignId, t }) {
  const vis = getNodeVisual(node.type);
  const { backendUser } = useSettings();
  const isAdmin = backendUser?.isAdmin;

  const handleField = useCallback((field, value) => {
    onUpdate(node.id, { [field]: value });
  }, [node.id, onUpdate]);

  return (
    <div className="overflow-y-auto custom-scrollbar px-6 py-3 space-y-3 text-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: vis.color }} />
        <span className="font-bold text-on-surface text-base truncate">{node.name}</span>
      </div>

      {isAdmin && (
        <NodeImageSection
          node={node}
          campaignId={campaignId}
          onUpdate={handleField}
        />
      )}

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
        <TagChips tags={node.tags || []} onChange={(next) => handleField('tags', next)} />
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
    <div className="overflow-y-auto custom-scrollbar px-6 py-3 space-y-3 text-xs">
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

const SCALE_PX = [32, 32, 48, 48, 64, 80, 96, 128];

function NodeImageSection({ node, campaignId, onUpdate }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const spritePx = SCALE_PX[Math.min(Math.max(node.scale ?? 5, 0), 7)];

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      const key = `node-image:${node.id}:${Date.now()}`;
      const res = await apiClient.request('/media/store', {
        method: 'POST',
        body: { key, type: 'node-image', contentType: file.type, data: b64, campaignId },
      });
      onUpdate('nodeImageUrl', res.url);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [node.id, campaignId, onUpdate]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const body = customPrompt.trim() ? { prompt: customPrompt.trim() } : {};
      const res = await apiClient.request(
        `/livingWorld/campaigns/${campaignId}/location-graph/nodes/${node.id}/generate-sprite`,
        { method: 'POST', body },
      );
      onUpdate('nodeImageUrl', res.nodeImageUrl);
    } catch (err) {
      console.error('Sprite generation failed', err);
    } finally {
      setGenerating(false);
    }
  }, [campaignId, node.id, customPrompt, onUpdate]);

  const loadGallery = useCallback(async () => {
    try {
      const res = await apiClient.request(
        `/livingWorld/campaigns/${campaignId}/location-graph/node-images`,
      );
      setGallery(res.images || []);
    } catch (err) {
      console.error('Failed to load gallery', err);
      setGallery([]);
    }
  }, [campaignId]);

  const openPicker = useCallback(() => {
    setShowPicker(true);
    if (!gallery) loadGallery();
  }, [gallery, loadGallery]);

  return (
    <div className="space-y-2 pb-2 border-b border-outline-variant/10">
      <label className="text-xs font-label uppercase tracking-widest text-outline">
        {t('locationGraph.inspector.nodeImage', { defaultValue: 'Obrazek węzła' })}
      </label>

      {node.nodeImageUrl && (
        <div className="relative group">
          <img
            src={node.nodeImageUrl}
            alt={node.name}
            className="w-full rounded border border-outline-variant/15 bg-black/20"
            style={{ imageRendering: 'pixelated' }}
          />
          <button
            type="button"
            onClick={() => onUpdate('nodeImageUrl', null)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2 py-1 rounded-sm bg-white/5 border border-outline-variant/10 hover:bg-white/10 transition-colors text-on-surface-variant disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">upload</span>
          {uploading ? '...' : t('locationGraph.inspector.upload', { defaultValue: 'Wgraj' })}
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="flex items-center gap-1 px-2 py-1 rounded-sm bg-white/5 border border-outline-variant/10 hover:bg-white/10 transition-colors text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-sm">photo_library</span>
          {t('locationGraph.inspector.pick', { defaultValue: 'Wybierz' })}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1 px-2 py-1 rounded-sm bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors text-primary disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">auto_fix_high</span>
          {generating
            ? t('locationGraph.inspector.generating', { defaultValue: 'Generuję...' })
            : t('locationGraph.inspector.generate', { defaultValue: 'Generuj' })}
          <span className="text-[10px] text-primary/60 ml-0.5">{spritePx}px</span>
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      <input
        className="bg-white/5 rounded-sm px-2 py-1 w-full text-on-surface text-[11px] border border-outline-variant/10 focus:border-primary/40 outline-none"
        placeholder={t('locationGraph.inspector.customPrompt', { defaultValue: 'Custom prompt (opcjonalny)...' })}
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
      />

      {showPicker && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-outline uppercase tracking-widest">
              {t('locationGraph.inspector.availableImages', { defaultValue: 'Dostępne' })}
            </span>
            <button type="button" onClick={() => setShowPicker(false)} className="text-outline hover:text-on-surface text-xs">×</button>
          </div>
          {!gallery ? (
            <div className="text-[10px] text-outline py-2 text-center">...</div>
          ) : gallery.length === 0 ? (
            <div className="text-[10px] text-outline py-2 text-center">
              {t('locationGraph.inspector.noImages', { defaultValue: 'Brak obrazków' })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {gallery.map((img, i) => (
                <button
                  key={img.url + i}
                  type="button"
                  onClick={() => { onUpdate('nodeImageUrl', img.url); setShowPicker(false); }}
                  className="relative group rounded border border-outline-variant/10 hover:border-primary/40 transition-colors overflow-hidden aspect-square bg-black/20"
                  title={img.name}
                >
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TagChips({ tags, onChange }) {
  const [input, setInput] = useState('');

  const add = (raw) => {
    const val = raw.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  };

  const remove = (idx) => onChange(tags.filter((_, i) => i !== idx));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    } else if (e.key === 'Backspace' && !input && tags.length) {
      remove(tags.length - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 bg-white/5 rounded-sm border border-outline-variant/10 focus-within:border-primary/40 px-2 py-1.5 min-h-[32px]">
      {tags.map((tag, i) => (
        <span key={tag + i} className="inline-flex items-center gap-1 bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[11px] leading-tight">
          {tag}
          <button type="button" onClick={() => remove(i)} className="hover:text-red-400 transition-colors leading-none">×</button>
        </span>
      ))}
      <input
        className="bg-transparent outline-none text-on-surface text-xs flex-1 min-w-[60px]"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? 'Dodaj tag...' : ''}
      />
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
