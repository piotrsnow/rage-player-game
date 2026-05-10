import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { defaultLengthKmBetweenScales } from '../../../../shared/domain/locationGraphLayout.js';
import { getNodeVisual, getEdgeVisual } from './graphVisuals.js';
import { SHAPE_PATHS, AVAILABLE_SHAPES, AVAILABLE_ICONS } from './nodeShapes.js';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import { apiClient } from '../../../services/apiClient.js';
import { useActionTag } from '../../../contexts/ActionTagContext.jsx';

const NODE_TYPE_OPTIONS = [
  'world', 'region', 'area', 'settlement', 'district',
  'site', 'room', 'point', 'abstract', 'dungeon',
];

const DANGER_LEVELS = ['safe', 'low', 'moderate', 'dangerous', 'deadly'];

const DISCOVERY_OPTIONS = ['unknown', 'rumored', 'known', 'visited', 'mapped', 'hidden'];

const INPUT_CLS = 'bg-white/5 rounded px-2.5 py-2 w-full text-sm text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none transition-colors';
const SELECT_CLS = 'bg-surface-container rounded px-2.5 py-2 w-full text-sm text-on-surface border border-outline-variant/10';

export default function InspectorPanel({
  selectedNode, selectedEdge, allNodes, occupants = [],
  onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
  mode, campaignId,
  worldMode = false,
  readOnly = false,
  onNpcClick,
}) {
  const { t } = useTranslation();

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-outline text-xs uppercase tracking-widest gap-2 px-6 py-4">
        <span className="material-symbols-outlined text-2xl">info</span>
        {t('locationGraph.selectToInspect')}
      </div>
    );
  }

  if (selectedNode) {
    const nk = selectedNode.kind;
    const nodeOccupants = occupants.filter(
      (o) => o.locationId === selectedNode.id && (o.locationKind ?? 'world') === (nk || o.locationKind),
    );
    return (
      <NodeInspector
        node={selectedNode}
        occupants={nodeOccupants}
        onUpdate={onUpdateNode}
        onDelete={onDeleteNode}
        mode={mode}
        campaignId={campaignId}
        worldMode={worldMode}
        readOnly={readOnly}
        onNpcClick={onNpcClick}
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
      readOnly={readOnly}
      t={t}
    />
  );
}

function NodeInspector({ node, occupants = [], onUpdate, onDelete, mode, campaignId, worldMode = false, readOnly = false, onNpcClick, t }) {
  const vis = getNodeVisual(node.type);
  const { backendUser } = useSettings();
  const isAdmin = backendUser?.isAdmin;
  const actionTagCtx = useActionTag();
  const [saveError, setSaveError] = useState(null);

  const handleField = useCallback((field, value) => {
    if (readOnly) return;
    setSaveError(null);
    onUpdate(node.id, { [field]: value }).catch((err) => {
      setSaveError(err.message || t('locationGraph.inspector.saveFailed', { defaultValue: 'Zapis nie powiódł się' }));
    });
  }, [node.id, onUpdate, readOnly, t]);

  const handleMentionLocation = useCallback(() => {
    if (!actionTagCtx || readOnly || worldMode) return;
    actionTagCtx.insertTag({
      kind: 'location',
      id: node.id,
      name: node.name,
      meta: node.type ? { locationType: node.type } : undefined,
    });
  }, [actionTagCtx, node, readOnly, worldMode]);

  return (
    <div className="overflow-y-auto custom-scrollbar pl-6 py-4 !pr-8 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-3 mb-1 border-b border-outline-variant/10">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: vis.color }} />
        <span className="font-headline text-lg text-on-surface truncate">{node.name}</span>
        {actionTagCtx && !readOnly && !worldMode && (
          <button
            type="button"
            onClick={handleMentionLocation}
            title={t('locationGraph.mentionLocation', 'Wstaw do akcji')}
            className="flex items-center justify-center w-6 h-6 rounded-sm border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">alternate_email</span>
          </button>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-widest text-outline bg-white/5 rounded px-1.5 py-0.5">
          {worldMode ? (node.kind === 'campaign' ? 'Sandbox' : vis.label) : vis.label}
        </span>
      </div>

      {saveError && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <span className="material-symbols-outlined text-sm">error</span>
          <span className="flex-1 truncate">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="text-red-300/60 hover:text-red-300">×</button>
        </div>
      )}

      {(worldMode || (Array.isArray(node.campaigns) && node.campaigns.length > 0)) && (
        <CollapsibleSection
          title={t('locationGraph.inspector.sectionCampaigns', { defaultValue: 'Kampanie' })}
          icon="flag"
          defaultOpen={worldMode}
        >
          {(!node.campaigns || node.campaigns.length === 0) ? (
            <p className="text-xs text-outline italic">
              {t('locationGraph.inspector.noCampaignRefs', { defaultValue: 'Brak powiązań z kampaniami.' })}
            </p>
          ) : (
            <ul className="space-y-2">
              {node.campaigns.map((c) => (
                <li
                  key={c.id}
                  className="rounded border border-outline-variant/15 bg-white/[0.03] px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-on-surface text-sm font-medium truncate">{c.name || c.id}</span>
                    {c.discoveredAt ? (
                      <span className="text-[10px] text-outline shrink-0 whitespace-nowrap" title={c.discoveredAt}>
                        {c.discoveredAt.slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                  {Array.isArray(c.relations) && c.relations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.relations.map((rel) => (
                        <span
                          key={rel}
                          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary/90"
                        >
                          {t(`locationGraph.inspector.campaignRelation.${rel}`, { defaultValue: rel })}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title={t('locationGraph.inspector.sectionImage', { defaultValue: 'Obrazek' })}
        icon="image"
      >
        <NodeImageSection node={node} campaignId={campaignId} onUpdate={handleField} isAdmin={isAdmin} readOnly={readOnly} />
      </CollapsibleSection>

      {occupants.length > 0 && (
        <CollapsibleSection
          title={t('locationGraph.inspector.sectionOccupants', { defaultValue: 'Postacie' })}
          icon="group"
          defaultOpen
        >
          <ul className="space-y-1">
            {occupants.map((occ) => (
              occ.type === 'npc' ? (
                <li key={occ.id}>
                  <button
                    type="button"
                    disabled={worldMode}
                    onClick={() => onNpcClick?.(occ)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors ${
                      worldMode
                        ? 'opacity-60 cursor-not-allowed border-transparent bg-white/5'
                        : `cursor-pointer ${
                          occ.alive === false
                            ? 'bg-red-500/5 hover:bg-red-500/10 border-red-500/10 hover:border-red-500/20 opacity-60'
                            : 'bg-white/5 hover:bg-white/10 border-transparent hover:border-outline-variant/20'
                        }`
                    }`}
                  >
                    {occ.alive === false ? (
                      <span className="material-symbols-outlined text-red-400/70 text-sm flex-shrink-0">skull</span>
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: '#f472b6' }}
                      />
                    )}
                    <span className={`text-sm truncate ${occ.alive === false ? 'text-on-surface/50 line-through decoration-red-400/30' : 'text-on-surface'}`}>{occ.name}</span>
                    <span className="ml-auto text-[10px] text-outline shrink-0">
                      {occ.role || 'NPC'}
                    </span>
                    <span className="material-symbols-outlined text-outline text-[14px] shrink-0" aria-hidden>chevron_right</span>
                  </button>
                </li>
              ) : (
                <li key={occ.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#22d3ee' }}
                  />
                  <span className="text-on-surface text-sm truncate">{occ.name}</span>
                  <span className="ml-auto text-[10px] text-outline">
                    Gracz
                  </span>
                </li>
              )
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title={t('locationGraph.inspector.sectionBasic', { defaultValue: 'Podstawowe' })}
        icon="info"
      >
        <Field label={t('locationGraph.inspector.name')}>
          <input
            key={node.id}
            className={INPUT_CLS}
            defaultValue={node.name}
            onBlur={(e) => handleField('name', e.target.value)}
          />
        </Field>

        <Field label={t('locationGraph.inspector.type')}>
          <select
            className={SELECT_CLS}
            disabled={readOnly}
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
      </CollapsibleSection>

      <CollapsibleSection
        title={t('locationGraph.inspector.sectionAppearance', { defaultValue: 'Wygląd' })}
        icon="palette"
      >
        <Field label={t('locationGraph.inspector.atmosphere')}>
          <input
            key={node.id}
            className={INPUT_CLS}
            defaultValue={node.atmosphere || ''}
            onBlur={(e) => handleField('atmosphere', e.target.value)}
          />
        </Field>

        <Field label={t('locationGraph.inspector.dangerLevel')}>
          <select
            className={SELECT_CLS}
            disabled={readOnly}
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
      </CollapsibleSection>

      {mode === 'gm' && (
        <CollapsibleSection
          title={t('locationGraph.inspector.sectionGm', { defaultValue: 'Ustawienia GM' })}
          icon="tune"
          defaultOpen={false}
        >
          <Field label={t('locationGraph.inspector.biome', { defaultValue: 'Biom' })}>
            <input
              key={node.id}
              className={INPUT_CLS}
              defaultValue={node.biome || ''}
              placeholder="forest, plains, mountain, urban, dungeon..."
              onBlur={(e) => handleField('biome', e.target.value || null)}
            />
          </Field>

          <Field label={t('locationGraph.inspector.anchorType', { defaultValue: 'Anchor (3D scene)' })}>
            <input
              key={node.id}
              className={INPUT_CLS}
              defaultValue={node.anchorType || ''}
              placeholder="tavern, forest, dungeon, road, castle..."
              onBlur={(e) => handleField('anchorType', e.target.value || null)}
            />
          </Field>

          <Field label={t('locationGraph.inspector.tacticalGrid', { defaultValue: 'Siatka taktyczna' })}>
            <div className="text-xs text-outline">
              {node.tacticalGrid
                ? `${node.tacticalGrid.width}×${node.tacticalGrid.height} ${t('locationGraph.inspector.gridSet', { defaultValue: '(zdefiniowana)' })}`
                : t('locationGraph.inspector.gridDefault', { defaultValue: 'Brak — walka użyje domyślnej siatki 12×12' })}
            </div>
          </Field>
        </CollapsibleSection>
      )}

      {mode === 'gm' && !readOnly && (
        <div className="pt-3 mt-1">
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="flex items-center gap-1.5 w-full px-3 py-2 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors text-xs uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            {t('locationGraph.inspector.deleteNode')}
          </button>
        </div>
      )}
    </div>
  );
}

function EdgeInspector({ edge, allNodes, onUpdate, onDelete, mode, readOnly = false, t }) {
  const vis = getEdgeVisual(edge.category);
  const fromNode = allNodes.find((n) => n.id === edge.fromId);
  const toNode = allNodes.find((n) => n.id === edge.toId);
  const defaultLen = defaultLengthKmBetweenScales(fromNode?.scale ?? 5, toNode?.scale ?? 5);

  const edgeTypesByCategory = {};
  for (const [name, info] of Object.entries(EDGE_TYPES)) {
    const cat = info.category;
    if (!edgeTypesByCategory[cat]) edgeTypesByCategory[cat] = [];
    edgeTypesByCategory[cat].push(name);
  }

  const handleField = useCallback((field, value) => {
    if (readOnly) return;
    onUpdate(edge.id, { [field]: value });
  }, [edge.id, onUpdate, readOnly]);

  return (
    <div className="overflow-y-auto custom-scrollbar pl-6 py-4 !pr-8 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-3 mb-1 border-b border-outline-variant/10">
        <span className="w-6 h-0.5" style={{ backgroundColor: vis.color }} />
        <span className="font-headline text-lg text-on-surface">{edge.edgeType}</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-on-surface-variant pb-2">
        <span>{fromNode?.name || edge.fromId}</span>
        <span className="material-symbols-outlined text-sm">{edge.bidirectional ? 'swap_horiz' : 'arrow_forward'}</span>
        <span>{toNode?.name || edge.toId}</span>
      </div>

      <CollapsibleSection
        title={t('locationGraph.inspector.sectionConnection', { defaultValue: 'Połączenie' })}
        icon="link"
      >
        <Field label={t('locationGraph.inspector.edgeType')}>
          <select
            className={SELECT_CLS}
            disabled={readOnly}
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
              disabled={readOnly}
              checked={edge.bidirectional}
              onChange={(e) => handleField('bidirectional', e.target.checked)}
              className="rounded"
            />
            <span className="text-on-surface-variant">{edge.bidirectional ? '↔' : '→'}</span>
          </label>
        </Field>

        <Field label={t('locationGraph.inspector.discoveryState')}>
          <select
            className={SELECT_CLS}
            disabled={readOnly}
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

        <Field label={t('locationGraph.inspector.directionDeg', { defaultValue: 'Kierunek layoutu (°)' })}>
          <input
            key={`${edge.id}-dir`}
            type="number"
            min={0}
            max={359}
            disabled={readOnly}
            className={INPUT_CLS}
            defaultValue={typeof edge.metadata?.directionDeg === 'number' ? edge.metadata.directionDeg : 0}
            onBlur={(e) => {
              if (readOnly) return;
              const v = parseFloat(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              onUpdate(edge.id, { directionDeg: ((v % 360) + 360) % 360 });
            }}
          />
        </Field>
        <Field label={t('locationGraph.inspector.lengthKm', { defaultValue: 'Długość (km)' })}>
          <input
            key={`${edge.id}-km`}
            type="number"
            min={0}
            step={0.01}
            disabled={readOnly}
            className={INPUT_CLS}
            defaultValue={typeof edge.metadata?.lengthKm === 'number' ? edge.metadata.lengthKm : defaultLen}
            onBlur={(e) => {
              if (readOnly) return;
              const v = parseFloat(e.target.value, 10);
              if (!Number.isFinite(v) || v < 0) return;
              onUpdate(edge.id, { lengthKm: v });
            }}
          />
        </Field>
        <p className="text-[10px] text-outline leading-snug">
          {t('locationGraph.inspector.layoutHint', {
            defaultValue: 'Od węzła „od” do „do”: 0° w prawo, 90° w dół. Dotyczy tylko widoku grafu.',
          })}
        </p>
      </CollapsibleSection>

      {mode === 'gm' && !readOnly && (
        <div className="pt-3 mt-1">
          <button
            type="button"
            onClick={() => onDelete(edge.id)}
            className="flex items-center gap-1.5 w-full px-3 py-2 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors text-xs uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            {t('locationGraph.inspector.deleteEdge')}
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-outline-variant/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 w-full py-2.5 text-xs text-on-surface-variant/70 hover:text-on-surface-variant transition-colors"
      >
        <span className="material-symbols-outlined text-sm">{icon}</span>
        <span className="uppercase tracking-widest font-label">{title}</span>
        <span
          className={`ml-auto material-symbols-outlined text-sm transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${open ? 'rotate-0' : '-rotate-90'}`}
        >
          expand_more
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div
          className={`min-h-0 overflow-hidden ${!open ? 'pointer-events-none' : ''}`}
          inert={!open ? '' : undefined}
        >
          <div className="pb-3 space-y-3">{children}</div>
        </div>
      </div>
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

function NodeImageSection({ node, campaignId, onUpdate, isAdmin, readOnly = false }) {
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
    <div className="space-y-2.5">
      {node.nodeImageUrl && (
        <div className="relative group inline-block">
          <img
            src={apiClient.resolveMediaUrl(node.nodeImageUrl)}
            alt={node.name}
            className="max-w-[180px] w-full rounded-lg border border-outline-variant/15 bg-black/20"
            style={{ imageRendering: 'pixelated' }}
          />
          {isAdmin && !readOnly && (
            <button
              type="button"
              onClick={() => onUpdate('nodeImageUrl', null)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-outline-variant/10 hover:bg-white/10 transition-colors text-on-surface-variant text-xs disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">upload</span>
                  {uploading ? '...' : t('locationGraph.inspector.upload', { defaultValue: 'Wgraj' })}
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-outline-variant/10 hover:bg-white/10 transition-colors text-on-surface-variant text-xs"
                >
                  <span className="material-symbols-outlined text-sm">photo_library</span>
                  {t('locationGraph.inspector.pick', { defaultValue: 'Wybierz' })}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors text-primary text-xs disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              {generating
                ? t('locationGraph.inspector.generating', { defaultValue: 'Generuję...' })
                : t('locationGraph.inspector.generate', { defaultValue: 'Generuj' })}
              <span className="text-[10px] text-primary/60 ml-0.5">{spritePx}px</span>
            </button>
          </div>

          {isAdmin && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />}

          <input
            className="bg-white/5 rounded px-2.5 py-1.5 w-full text-on-surface text-xs border border-outline-variant/10 focus:border-primary/40 outline-none"
            placeholder={t('locationGraph.inspector.customPrompt')}
            title={t('locationGraph.inspector.customPromptHint')}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />

          {isAdmin && showPicker && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-outline uppercase tracking-widest">
                  {t('locationGraph.inspector.availableImages', { defaultValue: 'Dostępne' })}
                  {gallery && gallery.length > 0 && (
                    <span className="ml-1 normal-case tracking-normal text-outline/60">({gallery.length})</span>
                  )}
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
                      <img src={apiClient.resolveMediaUrl(img.url)} alt={img.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
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
    <div className="flex flex-wrap items-center gap-1 bg-white/5 rounded border border-outline-variant/10 focus-within:border-primary/40 px-2.5 py-2 min-h-[38px]">
      {tags.map((tag, i) => (
        <span key={tag + i} className="inline-flex items-center gap-1 bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs leading-tight">
          {tag}
          <button type="button" onClick={() => remove(i)} className="hover:text-red-400 transition-colors leading-none">×</button>
        </span>
      ))}
      <input
        className="bg-transparent outline-none text-on-surface text-sm flex-1 min-w-[60px]"
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
    <div className="space-y-1.5">
      <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant/70">{label}</label>
      {children}
    </div>
  );
}
