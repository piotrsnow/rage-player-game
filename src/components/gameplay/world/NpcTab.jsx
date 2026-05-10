import { useState } from 'react';
import CustomSelect from '../../ui/CustomSelect';
import { GenderIcon } from '../../../utils/genderIcon';
import { CrossLinkChip, EmptyState, findQuestsForNpc } from './shared';
import NpcStatCard from './NpcStatCard';
import { useActionTag } from '../../../contexts/ActionTagContext';

function NpcRow({ npc, quests, characterVoiceMap, taggedVoices, hasVoicePool, handleVoiceChange, navigateTo, onMentionNpc, t }) {
  const [showCard, setShowCard] = useState(false);
  const mapping = characterVoiceMap?.[npc.name];
  const currentVoiceId = mapping?.voiceId;
  const relatedQuests = findQuestsForNpc(npc, quests);

  const raceLabel = npc.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc.creatureKind || null;
  const hasSheet = npc.stats && typeof npc.stats === 'object' && npc.stats.attributes;
  const level = npc.stats?.level ?? npc.level ?? 1;

  return (
    <div data-entity-id={npc.id} className={`p-3 rounded-sm border transition-all ${npc.alive === false ? 'bg-error-container/10 border-error/15 opacity-60' : 'bg-surface-container/40 border-outline-variant/10'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="material-symbols-outlined text-base text-primary">person</span>
          <span className="text-base font-bold text-on-surface">{npc.name}</span>
          <GenderIcon gender={npc.gender} className="text-sm text-outline/80" />
          {raceLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/15 text-on-surface-variant">
              {raceLabel}
            </span>
          )}
          {hasSheet && (
            <span className="text-xs px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary font-bold">
              {t('worldState.lvl')} {level}
            </span>
          )}
          {npc.alive === false && <span className="text-xs text-error font-bold uppercase">{t('worldState.dead')}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {onMentionNpc && npc.alive !== false && (
            <button
              type="button"
              onClick={() => onMentionNpc(npc)}
              title={t('worldState.mentionNpc', 'Wstaw do akcji')}
              className="flex items-center justify-center w-6 h-6 rounded-sm border border-sky-500/20 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">alternate_email</span>
            </button>
          )}
          {npc.disposition != null && npc.disposition !== 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-sm ${
              npc.disposition > 0
                ? 'bg-primary/15 text-primary'
                : 'bg-error/15 text-error'
            }`}>
              {npc.disposition > 0 ? '+' : ''}{npc.disposition}
            </span>
          )}
          {npc.attitude && (
            <span className={`text-xs font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${
              npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
              npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
              'bg-outline/10 text-outline'
            }`}>{npc.attitude}</span>
          )}
        </div>
      </div>
      <div className="text-sm text-on-surface-variant space-y-0.5">
        {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
        {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
        {npc.appearance && <div><span className="text-outline">{t('worldState.appearance')}:</span> {npc.appearance}</div>}
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

      {hasSheet && (
        <>
          <button
            type="button"
            onClick={() => setShowCard((v) => !v)}
            className="mt-2 w-full flex items-center justify-between px-2 py-1 rounded-sm border border-outline-variant/15 bg-surface-container/30 hover:bg-surface-container/60 transition-colors text-sm text-on-surface-variant"
            aria-expanded={showCard}
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-primary">badge</span>
              {t('worldState.characterCard')}
            </span>
            <span className="material-symbols-outlined text-sm">
              {showCard ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {showCard && <NpcStatCard npc={npc} />}
        </>
      )}

      {relatedQuests.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-outline-variant/10">
          <span className="text-xs text-outline">{t('worldState.relatedQuests')}:</span>
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
          <span className="material-symbols-outlined text-sm text-outline">record_voice_over</span>
          <span className="text-xs text-outline shrink-0">{t('worldState.voice')}:</span>
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
            buttonClassName="text-sm py-1 px-2 border-outline-variant/15"
          />
        </div>
      )}
    </div>
  );
}

export default function NpcTab({ npcs, quests, characterVoiceMap, maleVoices, femaleVoices, ttsProvider, dispatch, autoSave, navigateTo, t }) {
  const actionTagCtx = useActionTag();

  const handleMentionNpc = actionTagCtx ? (npc) => {
    actionTagCtx.insertTag({
      kind: 'npc',
      id: npc.id || npc.name,
      name: npc.name,
      meta: npc.role ? { role: npc.role } : undefined,
    });
  } : null;

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
    const pool = [...(maleVoices || []), ...(femaleVoices || [])];
    const voice = pool.find((v) => v.voiceId === voiceId);
    dispatch({
      type: 'MAP_CHARACTER_VOICE',
      payload: { characterName: npcName, voiceId: voiceId || null, gender: npcGender || null, voiceName: voice?.voiceName || null, ttsProvider: ttsProvider || 'elevenlabs' },
    });
    if (autoSave) autoSave();
  };

  return (
    <div className="grid gap-3">
      {showVoicePoolHint && (
        <div className="flex items-start gap-2 p-2 rounded-sm border border-warning/30 bg-warning-container/15 text-sm text-warning">
          <span className="material-symbols-outlined text-base leading-none mt-0.5">info</span>
          <span>{t('worldState.voicePoolMissing')}</span>
        </div>
      )}
      {npcs.map((npc) => (
        <NpcRow
          key={npc.id ?? npc.name}
          npc={npc}
          quests={quests}
          characterVoiceMap={characterVoiceMap}
          taggedVoices={taggedVoices}
          hasVoicePool={hasVoicePool}
          handleVoiceChange={handleVoiceChange}
          navigateTo={navigateTo}
          onMentionNpc={handleMentionNpc}
          t={t}
        />
      ))}
    </div>
  );
}
