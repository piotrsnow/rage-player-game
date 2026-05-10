import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';

export default function CreatureEncounterModal({ encounter, fleeResult, isLoading, onRespond, onFlee, onDismiss }) {
  const { t } = useTranslation();
  const { state } = useGame();
  const [action, setAction] = useState('');

  if (!encounter) return null;

  const character = state.character;
  const zrecznosc = character?.attributes?.zrecznosc || 1;
  const uniki = character?.skills?.find(s => s.name === 'Uniki')?.level || 0;
  const dodgeTarget = zrecznosc + uniki + (encounter.fleePenalty || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!action.trim()) return;
    onRespond(action.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900/90 backdrop-blur-xl shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-3xl text-amber-400">{encounter.icon || 'pets'}</span>
          <h2 className="text-xl font-bold text-amber-200">{encounter.creatureName}</h2>
        </div>

        <p className="text-gray-200 leading-relaxed mb-6 italic">{encounter.narration}</p>

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
            <form onSubmit={handleSubmit} className="mb-3">
              <input
                type="text"
                value={action}
                onChange={e => setAction(e.target.value)}
                placeholder={t('creatureEncounter.actionPlaceholder')}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800/80 border border-white/10 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                autoFocus
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!action.trim() || isLoading}
                className="mt-2 w-full py-2.5 rounded-lg font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('creatureEncounter.respond')}
              </button>
            </form>

            <button
              onClick={onFlee}
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg font-medium border border-white/10 bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 hover:text-white transition-colors disabled:opacity-40"
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-base">directions_run</span>
                {t('creatureEncounter.flee')}
                <span className="text-xs text-gray-500">
                  ({t('creatureEncounter.dodgeTarget', { target: Math.max(1, dodgeTarget) })})
                </span>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
