import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { defaultLengthKmBetweenScales } from '../../../../shared/domain/locationGraphLayout.js';

const EDGE_TYPE_NAMES = Object.keys(EDGE_TYPES);

const CATEGORIES_ORDER = ['movement', 'structural', 'spatial', 'perception', 'access', 'social', 'narrative', 'temporal'];

export default function AddEdgeFlow({ sourceNode, allNodes, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [targetId, setTargetId] = useState('');
  const [edgeType, setEdgeType] = useState('path_to');
  const [directionDeg, setDirectionDeg] = useState('0');
  const [lengthKm, setLengthKm] = useState('1');

  const targetNode = allNodes.find((n) => n.id === targetId);

  const defaultLengthKm = useMemo(() => {
    if (!sourceNode || !targetNode) return 1;
    return defaultLengthKmBetweenScales(sourceNode.scale ?? 5, targetNode.scale ?? 5);
  }, [sourceNode, targetNode]);

  useEffect(() => {
    setLengthKm(String(defaultLengthKm));
  }, [defaultLengthKm, targetId]);

  const edgesByCategory = {};
  for (const name of EDGE_TYPE_NAMES) {
    const cat = EDGE_TYPES[name].category;
    if (!edgesByCategory[cat]) edgesByCategory[cat] = [];
    edgesByCategory[cat].push(name);
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!targetId) return;
    const typeInfo = EDGE_TYPES[edgeType];
    const deg = parseFloat(directionDeg, 10);
    const km = parseFloat(lengthKm, 10);
    onSubmit({
      fromKind: sourceNode.kind,
      fromId: sourceNode.id,
      toKind: targetNode?.kind || 'world',
      toId: targetId,
      edgeType,
      category: typeInfo?.category || 'movement',
      bidirectional: typeInfo?.bidirectional ?? true,
      directionDeg: Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0,
      lengthKm: Number.isFinite(km) && km >= 0 ? km : defaultLengthKm,
    });
  };

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant/15 rounded-sm p-3 shadow-xl w-80 animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-2 text-xs">
        <div className="flex items-center gap-2 pb-1 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-primary text-sm">conversion_path</span>
          <span className="font-bold text-on-surface text-[10px] uppercase tracking-widest">{t('locationGraph.addEdge.title')}</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-on-surface-variant px-1">
          <span className="font-bold text-primary">{sourceNode.name}</span>
          <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
          <span className="text-outline">{targetNode?.name || '...'}</span>
        </div>

        <select
          className="bg-white/5 rounded-sm px-2 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">{t('locationGraph.addEdge.selectTarget')}</option>
          {allNodes.filter((n) => n.id !== sourceNode.id).map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>

        <select
          className="bg-white/5 rounded-sm px-2 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={edgeType}
          onChange={(e) => setEdgeType(e.target.value)}
        >
          {CATEGORIES_ORDER.map((cat) => {
            const types = edgesByCategory[cat];
            if (!types) return null;
            return (
              <optgroup key={cat} label={t(`locationGraph.categories.${cat}`)}>
                {types.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
              </optgroup>
            );
          })}
        </select>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <label className="flex flex-col gap-0.5 text-[10px] text-on-surface-variant">
            <span>{t('locationGraph.addEdge.directionDeg', { defaultValue: 'Kierunek (°)' })}</span>
            <input
              type="number"
              min={0}
              max={359}
              step={1}
              className="bg-white/5 rounded-sm px-2 py-1.5 text-on-surface border border-outline-variant/10"
              value={directionDeg}
              onChange={(e) => setDirectionDeg(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-on-surface-variant">
            <span>{t('locationGraph.addEdge.lengthKm', { defaultValue: 'Długość (km)' })}</span>
            <input
              type="number"
              min={0}
              step={0.01}
              className="bg-white/5 rounded-sm px-2 py-1.5 text-on-surface border border-outline-variant/10"
              value={lengthKm}
              onChange={(e) => setLengthKm(e.target.value)}
            />
          </label>
        </div>
        <p className="text-[9px] text-outline leading-tight px-0.5">
          {t('locationGraph.addEdge.layoutHint', {
            defaultValue: '0° = w prawo, 90° = w dół (ekran). Domyślna długość zależy od skali węzłów.',
          })}
        </p>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!targetId} className="flex-1 px-2 py-1.5 bg-primary/20 text-primary rounded-sm hover:bg-primary/30 transition-colors uppercase tracking-widest text-[10px] font-bold disabled:opacity-30">
            {t('locationGraph.addEdge.create')}
          </button>
          <button type="button" onClick={onCancel} className="px-2 py-1.5 text-outline hover:text-on-surface transition-colors uppercase tracking-widest text-[10px]">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
