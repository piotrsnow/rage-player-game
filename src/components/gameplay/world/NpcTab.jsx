import CustomSelect from '../../ui/CustomSelect';
import { GenderIcon } from '../../../utils/genderIcon';
import { CrossLinkChip, EmptyState, findQuestsForNpc } from './shared';

export default function NpcTab({ npcs, quests, characterVoiceMap, maleVoices, femaleVoices, dispatch, autoSave, navigateTo, t }) {
  if (npcs.length === 0) {
    return <EmptyState icon="group" text={t('worldState.emptyNpcs')} />;
  }

  const taggedVoices = [
    ...((maleVoices || []).map((v) => ({ ...v, gender: 'male' }))),
    ...((femaleVoices || []).map((v) => ({ ...v, gender: 'female' }))),
  ];
  const hasVoicePool = taggedVoices.length > 0;
  const hasMaleVoices = (maleVoices || []).length > 0;
  const hasFemaleVoices = (femaleVoices || []).length > 0;
  const showVoicePoolHint = !hasMaleVoices || !hasFemaleVoices;

  const handleVoiceChange = (npcName, npcGender, voiceId) => {
    dispatch({
      type: 'MAP_CHARACTER_VOICE',
      payload: { characterName: npcName, voiceId: voiceId || null, gender: npcGender || null },
    });
    if (autoSave) autoSave();
  };

  return (
    <div className="grid gap-3">
      {showVoicePoolHint && (
        <div className="flex items-start gap-2 p-2 rounded-sm border border-warning/30 bg-warning-container/15 text-[11px] text-warning">
          <span className="material-symbols-outlined text-sm leading-none mt-0.5">info</span>
          <span>{t('worldState.voicePoolMissing')}</span>
        </div>
      )}
      {npcs.map((npc) => {
        const mapping = characterVoiceMap?.[npc.name];
        const currentVoiceId = mapping?.voiceId;
        const relatedQuests = findQuestsForNpc(npc, quests);

        return (
          <div key={npc.id} data-entity-id={npc.id} className={`p-3 rounded-sm border transition-all ${npc.alive === false ? 'bg-error-container/10 border-error/15 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">person</span>
                <span className="text-sm font-bold text-on-surface">{npc.name}</span>
                <GenderIcon gender={npc.gender} className="text-xs text-outline/80" />
                {npc.alive === false && <span className="text-[10px] text-error font-bold uppercase">{t('worldState.dead')}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {npc.disposition != null && npc.disposition !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                    npc.disposition > 0
                      ? 'bg-primary/15 text-primary'
                      : 'bg-error/15 text-error'
                  }`}>
                    {npc.disposition > 0 ? '+' : ''}{npc.disposition}
                  </span>
                )}
                {npc.attitude && (
                  <span className={`text-[10px] font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                    npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
                    npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
                    'bg-outline/10 text-outline'
                  }`}>{npc.attitude}</span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-on-surface-variant space-y-0.5">
              {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
              {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
              {npc.lastLocation && (
                <div className="flex items-center gap-1">
                  <span className="text-outline">{t('worldState.location')}:</span>
                  <button
                    onClick={() => navigateTo('map', npc.lastLocation)}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {npc.lastLocation}
                  </button>
                </div>
              )}
              {npc.notes && <div className="text-outline italic mt-1">{npc.notes}</div>}
            </div>

            {relatedQuests.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-outline-variant/10">
                <span className="text-[10px] text-outline">{t('worldState.relatedQuests')}:</span>
                {relatedQuests.map((q) => (
                  <CrossLinkChip
                    key={q.id}
                    icon="assignment"
                    label={q.name}
                    onClick={() => navigateTo('quests', q.id)}
                  />
                ))}
              </div>
            )}

            {hasVoicePool && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline-variant/10">
                <span className="material-symbols-outlined text-xs text-outline">record_voice_over</span>
                <span className="text-[10px] text-outline shrink-0">{t('worldState.voice')}:</span>
                <CustomSelect
                  value={currentVoiceId || ''}
                  onChange={(nextVoiceId) => handleVoiceChange(npc.name, npc.gender, nextVoiceId)}
                  options={[
                    { value: '', label: t('worldState.noVoice') },
                    ...taggedVoices.map((v) => ({
                      value: v.voiceId,
                      label: `${v.voiceName} (${v.gender === 'male' ? '\u2642' : '\u2640'})`,
                    })),
                  ]}
                  className="flex-1 min-w-0"
                  buttonClassName="text-[11px] py-1 px-2 border-outline-variant/15"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
