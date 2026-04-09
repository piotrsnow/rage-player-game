import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';

export default function MainQuestCompleteModal({ state, dispatch, navigate }) {
  const { t } = useTranslation();

  const completedMain = (state.quests?.completed || [])
    .filter((q) => q.type === 'main')
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];

  const handleEndCampaign = async () => {
    if (state.character) {
      try {
        await storage.saveCharacter(state.character);
      } catch (_) { /* best-effort */ }
    }
    dispatch({ type: 'RESET' });
    navigate('/');
  };

  const handleContinueFreeroam = () => {
    dispatch({ type: 'SET_FREEROAM' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-low p-8 border border-primary/30 rounded-sm text-center space-y-5 max-w-lg mx-4 shadow-2xl">
        <span className="material-symbols-outlined text-6xl text-primary animate-pulse">
          emoji_events
        </span>

        <h2 className="font-headline text-2xl text-tertiary">
          {t('gameplay.mainQuestComplete', 'Główna misja ukończona!')}
        </h2>

        {completedMain && (
          <p className="text-on-surface-variant text-sm leading-relaxed">
            {completedMain.name}
          </p>
        )}

        {completedMain?.reward && (
          <div className="flex items-center justify-center gap-3 text-xs text-on-surface-variant">
            {completedMain.reward.xp > 0 && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-primary">star</span>
                +{completedMain.reward.xp} XP
              </span>
            )}
            {(completedMain.reward.money?.gold > 0 || completedMain.reward.money?.silver > 0) && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-tertiary">payments</span>
                {completedMain.reward.money.gold > 0 && `${completedMain.reward.money.gold} ZM`}
                {completedMain.reward.money.silver > 0 && ` ${completedMain.reward.money.silver} SS`}
              </span>
            )}
          </div>
        )}

        <p className="text-on-surface-variant/70 text-xs leading-relaxed max-w-sm mx-auto">
          {t('gameplay.mainQuestCompleteDesc', 'Możesz zakończyć kampanię i zapisać postać do biblioteki, lub kontynuować eksplorację świata.')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={handleEndCampaign}
            className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-high/40 border border-outline-variant/20 rounded-sm text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {t('gameplay.endCampaignSave', 'Zakończ i zapisz postać')}
          </button>
          <button
            onClick={handleContinueFreeroam}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary/15 border border-primary/30 rounded-sm text-xs font-label uppercase tracking-widest text-primary hover:bg-primary/25 transition-all"
          >
            <span className="material-symbols-outlined text-sm">explore</span>
            {t('gameplay.continueFreeroam', 'Kontynuuj eksplorację')}
          </button>
        </div>
      </div>
    </div>
  );
}
