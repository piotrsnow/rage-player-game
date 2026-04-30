import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { GenderIcon } from '../../../utils/genderIcon';
import NpcStatCard from '../world/NpcStatCard';

/**
 * Full-sheet modal opened when a player clicks an NPC speaker label in chat.
 * Reads the NPC object (already resolved by the caller from world.npcs) and
 * renders the same NpcStatCard that's used in Stan Świata.
 */
export default function NpcSheetModal({ npc, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  if (!npc) return null;

  const raceLabel = npc.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc.creatureKind || t('worldState.races.none');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={npc.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-md max-h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-lg">badge</span>
            <h2 className="text-sm font-bold text-on-surface truncate">{npc.name}</h2>
            <GenderIcon gender={npc.gender} className="text-xs text-outline/80 shrink-0" />
            <span className="text-[10px] text-on-surface-variant shrink-0">· {raceLabel}</span>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          <div className="text-[11px] text-on-surface-variant space-y-1">
            {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
            {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
            {npc.lastLocation && <div><span className="text-outline">{t('worldState.location')}:</span> {npc.lastLocation}</div>}
            {npc.attitude && (
              <div>
                <span className="text-outline">{t('worldState.role')}:</span>{' '}
                <span className={`text-[10px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                  npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
                  npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
                  'bg-outline/10 text-outline'
                }`}>{npc.attitude}</span>
              </div>
            )}
          </div>
          <NpcStatCard npc={npc} />
        </div>
      </div>
    </div>
  );
}
