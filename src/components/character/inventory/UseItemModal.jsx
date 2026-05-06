import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { typeIcons } from './constants';

function TargetButton({ icon, label, sublabel, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-all ${
        selected
          ? 'bg-tertiary/20 border-tertiary/50 text-on-surface shadow-[0_0_10px_rgba(197,154,255,0.25)]'
          : 'bg-surface-container-highest/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-highest/70 hover:border-tertiary/30 hover:text-on-surface'
      }`}
    >
      {icon && (
        <span
          className={`material-symbols-outlined text-base ${selected ? 'text-tertiary' : 'text-on-surface-variant/70'}`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
        >
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-headline text-xs leading-tight truncate">{label}</div>
        {sublabel && (
          <div className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant/60 truncate mt-0.5">
            {sublabel}
          </div>
        )}
      </div>
    </button>
  );
}

export default function UseItemModal({ item, character, npcs = [], items = [], onSubmit, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  const [target, setTarget] = useState({ type: 'none', id: null });
  const [description, setDescription] = useState('');

  const icon = typeIcons[item.type] || typeIcons.misc;
  const trimmed = description.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    let targetLabel = null;
    if (target.type === 'self') targetLabel = character?.name || null;
    else if (target.type === 'npc') targetLabel = npcs.find((n) => n.id === target.id)?.name || null;
    else if (target.type === 'item') targetLabel = items.find((i) => i.id === target.id)?.name || null;

    const targetTag = targetLabel ? ` [CEL: ${targetLabel}]` : '';
    const actionText = `[UŻYCIE PRZEDMIOTU: ${item.name}]${targetTag} ${trimmed}`;
    onSubmit(actionText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface-container-highest/95 backdrop-blur-2xl border border-tertiary/30 rounded-sm shadow-2xl shadow-tertiary/10"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-tertiary text-xl shrink-0"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="font-headline text-tertiary text-sm leading-tight truncate">
                {t('inventory.useItemTitle', 'Użyj przedmiotu')}
              </h3>
              <p className="text-[11px] text-on-surface-variant/70 truncate">{item.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Zamknij')}
            className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-surface-container/50 text-on-surface-variant shrink-0"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
          <div>
            <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70 block mb-2">
              {t('inventory.useItemTarget', 'Cel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <TargetButton
                icon="block"
                label={t('inventory.useItemNoTarget', 'Brak celu')}
                selected={target.type === 'none'}
                onClick={() => setTarget({ type: 'none', id: null })}
              />
              <TargetButton
                icon="person"
                label={t('inventory.useItemPlayer', 'Moja postać')}
                sublabel={character?.name}
                selected={target.type === 'self'}
                onClick={() => setTarget({ type: 'self', id: null })}
              />
              {npcs.map((npc) => (
                <TargetButton
                  key={`npc-${npc.id}`}
                  icon="groups"
                  label={npc.name}
                  sublabel={t('inventory.useItemTargetNpc', 'NPC')}
                  selected={target.type === 'npc' && target.id === npc.id}
                  onClick={() => setTarget({ type: 'npc', id: npc.id })}
                />
              ))}
              {items.map((it) => (
                <TargetButton
                  key={`item-${it.id}`}
                  icon={typeIcons[it.type] || typeIcons.misc}
                  label={it.name}
                  sublabel={t('inventory.useItemTargetItem', 'Przedmiot')}
                  selected={target.type === 'item' && target.id === it.id}
                  onClick={() => setTarget({ type: 'item', id: it.id })}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70 block mb-2">
              {t('inventory.useItemAction', 'Co chcesz zrobić?')}
            </label>
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder={t('inventory.useItemPlaceholder', 'Opisz co robisz z tym przedmiotem... Kreatywność jest bonusowana!')}
              className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-tertiary/50 focus:bg-surface-container/80 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-outline-variant/15 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-label uppercase tracking-wider text-on-surface-variant hover:text-on-surface border border-outline-variant/15 hover:border-outline-variant/30 rounded-sm transition-colors"
          >
            {t('common.cancel', 'Anuluj')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm border transition-all ${
              canSubmit
                ? 'bg-tertiary/20 text-tertiary border-tertiary/40 hover:bg-tertiary/30 shadow-[0_0_10px_rgba(197,154,255,0.2)]'
                : 'bg-surface-container/30 text-on-surface-variant/40 border-outline-variant/10 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-sm">play_arrow</span>
            {t('inventory.useItemSubmit', 'Wykonaj')}
          </button>
        </div>
      </div>
    </div>
  );
}
