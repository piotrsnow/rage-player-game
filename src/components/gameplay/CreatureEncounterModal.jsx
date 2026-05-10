import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';

export default function CreatureEncounterModal({
  encounter, fleeResult, isLoading, onRespond, onFlee, onDismiss,
  narrator, autoPlay,
}) {
  const { t } = useTranslation();
  const { state } = useGame();
  const [action, setAction] = useState('');
  const spokenNarrationRef = useRef(null);

  const narrationId = encounter ? `creature_encounter:${encounter.creatureName}` : null;

  useEffect(() => {
    if (!autoPlay || !narrator?.isNarratorReady) return;
    if (!encounter?.narration) return;
    if (spokenNarrationRef.current === encounter.narration) return;
    spokenNarrationRef.current = encounter.narration;
    narrator.speakSingle(encounter.narration, narrationId);
  }, [autoPlay, narrator, encounter?.narration, narrationId]);

  if (!encounter) return null;

  const character = state.character;
  const zrecznosc = character?.attributes?.zrecznosc || 1;
  const uniki = Array.isArray(character?.skills)
    ? (character.skills.find(s => s.name === 'Uniki')?.level || 0)
    : (character?.skills?.Uniki?.level || 0);
  const dodgeTarget = zrecznosc + uniki + (encounter.fleePenalty || 0);

  const handleSpeak = () => {
    if (!narrator?.isNarratorReady || !encounter.narration) return;
    narrator.speakSingle(encounter.narration, narrationId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!action.trim()) return;
    onRespond(action.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="holo-card relative w-full max-w-2xl backdrop-blur-xl p-6 sm:p-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-3xl text-sky-300 drop-shadow-[0_0_6px_rgba(125,211,252,0.35)]">
            {encounter.icon || 'pets'}
          </span>
          <h2 className="text-xl font-headline text-violet-100 drop-shadow-[0_0_8px_rgba(167,139,250,0.25)]">
            {encounter.creatureName}
          </h2>
        </div>

        <div className="relative mb-6">
          <p className="text-on-surface/90 leading-relaxed italic pr-8">{encounter.narration}</p>
          {narrator?.isNarratorReady && (
            <button
              type="button"
              onClick={handleSpeak}
              className="absolute top-0 right-0 w-7 h-7 flex items-center justify-center rounded-md text-on-surface-variant hover:text-primary transition-colors"
              title={t('chat.narratorPlay')}
            >
              <span className="material-symbols-outlined text-sm">volume_up</span>
            </button>
          )}
        </div>

        {fleeResult && (
          <div className={`mb-4 p-3 rounded-lg border ${fleeResult.success ? 'border-green-500/30 bg-green-900/20 text-green-300' : 'border-red-500/30 bg-red-900/20 text-red-300'}`}>
            <div className="font-bold">
              {fleeResult.success ? t('creatureEncounter.fleeSuccess') : t('creatureEncounter.fleeFailed')}
            </div>
            <div className="text-sm opacity-80">
              {t('creatureEncounter.fleeRoll', { roll: fleeResult.roll, target: fleeResult.target })}
            </div>
          </div>
        )}

        {!fleeResult && (
          <>
            <form onSubmit={handleSubmit} className="mb-4">
              <textarea
                value={action}
                onChange={e => setAction(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('creatureEncounter.actionPlaceholder')}
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-black/70 border border-violet-400/15 text-on-surface placeholder-on-surface-variant/45 focus:outline-none focus:border-sky-300/40 focus:ring-1 focus:ring-violet-400/25 resize-none"
                autoFocus
                disabled={isLoading}
              />
            </form>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!action.trim() || isLoading}
                className="flex-1 py-2.5 rounded-lg font-medium bg-violet-700 hover:bg-violet-600 text-violet-50 shadow-[0_0_18px_rgba(109,40,217,0.22)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('creatureEncounter.respond')}
              </button>

              <button
                type="button"
                onClick={onFlee}
                disabled={isLoading}
                className="flex-1 py-2.5 rounded-lg font-medium border border-white/10 bg-surface-container-high/60 hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">directions_run</span>
                  {t('creatureEncounter.flee')}
                  <span className="text-xs opacity-60">
                    ({t('creatureEncounter.dodgeTarget', { target: Math.max(1, dodgeTarget) })})
                  </span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
