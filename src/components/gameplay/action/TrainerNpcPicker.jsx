import { useTranslation } from 'react-i18next';
import { translateSkill } from '../../../utils/rpgTranslate';
import { SKILL_CAPS } from '../../../data/rpgSystem';

export default function TrainerNpcPicker({ trainers, character, dispatch, onCancel }) {
  const { t } = useTranslation();

  const handleTrain = (npc, skillName) => {
    dispatch({ type: 'TRAIN_SKILL', payload: { skillName, npcId: npc.id } });
    onCancel();
  };

  return (
    <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('training.trainWith', 'Trenuj z...')}
      </label>
      {trainers.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
          {trainers.map((npc) => (
            <div
              key={npc.id || npc.name}
              className="px-3 py-2 bg-surface-container/60 border border-outline-variant/10 rounded-sm"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xs text-tertiary">school</span>
                <span className="text-sm text-on-surface truncate">{npc.name}</span>
                {npc.role && <span className="text-[9px] text-on-surface-variant">({npc.role})</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {(npc.canTrain || []).map((skillName) => {
                  const skill = character?.skills?.[skillName];
                  const cap = skill?.cap ?? SKILL_CAPS.basic;
                  const maxed = cap >= SKILL_CAPS.max;
                  return (
                    <button
                      key={skillName}
                      onClick={() => !maxed && handleTrain(npc, skillName)}
                      disabled={maxed}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="text-primary">{translateSkill(skillName, t)}</span>
                      <span className="text-[9px] text-on-surface-variant tabular-nums">
                        {t('training.capShort', { cap, defaultValue: `cap ${cap}` })}{maxed ? ' MAX' : ' → +1'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant/60 italic px-1">
          {t('training.noTrainersNearby', 'Brak trenerów w pobliżu')}
        </p>
      )}
      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
