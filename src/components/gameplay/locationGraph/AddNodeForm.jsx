import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getNodeVisual } from './graphVisuals.js';

const TYPE_OPTIONS = [
  'settlement', 'district', 'site', 'room', 'point', 'area', 'region', 'abstract', 'dungeon',
];

export default function AddNodeForm({ position, allNodes, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState('site');
  const [parentId, setParentId] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const parent = allNodes.find((n) => n.id === parentId);
    onSubmit({
      name: name.trim(),
      type,
      scale: TYPE_OPTIONS.indexOf(type) >= 0 ? { settlement: 3, district: 4, site: 5, room: 6, point: 7, area: 2, region: 1, abstract: 5, dungeon: 5 }[type] : 5,
      parentKind: parent?.kind || undefined,
      parentId: parent?.id || undefined,
    });
  };

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant/15 rounded-sm p-3 shadow-xl w-72 animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-2 text-xs">
        <div className="flex items-center gap-2 pb-1 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-primary text-sm">add_location</span>
          <span className="font-bold text-on-surface text-[10px] uppercase tracking-widest">{t('locationGraph.addNode.title')}</span>
        </div>

        <input
          autoFocus
          className="bg-white/5 rounded-sm px-2 py-1.5 w-full text-on-surface border border-outline-variant/10 focus:border-primary/40 outline-none"
          placeholder={t('locationGraph.addNode.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="bg-white/5 rounded-sm px-2 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((t) => {
            const v = getNodeVisual(t);
            return <option key={t} value={t}>{v.label}</option>;
          })}
        </select>

        <select
          className="bg-white/5 rounded-sm px-2 py-1.5 w-full text-on-surface border border-outline-variant/10"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">{t('locationGraph.addNode.noParent')}</option>
          {allNodes.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>

        <div className="flex gap-2 pt-1">
          <button type="submit" className="flex-1 px-2 py-1.5 bg-primary/20 text-primary rounded-sm hover:bg-primary/30 transition-colors uppercase tracking-widest text-[10px] font-bold">
            {t('locationGraph.addNode.create')}
          </button>
          <button type="button" onClick={onCancel} className="px-2 py-1.5 text-outline hover:text-on-surface transition-colors uppercase tracking-widest text-[10px]">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
