import { useTranslation } from 'react-i18next';
import { getGameState } from '../../stores/gameStore';
import { exportAsJson, exportAsMarkdown } from '../../services/exportLog';
import { canLeaveCampaign, getLeaveBlockedMessage } from '../../services/campaignGuard';

/**
 * End-of-campaign banner — completed (trophy) or failed (skull) with optional
 * epilogue, "export log" + "new campaign" buttons. The Leave check gates the
 * nav so characters mid-locked-campaign can't strand themselves.
 */
export default function GameplayCampaignEnd({
  campaign,
  character,
  isMultiplayer,
  mpGameState,
  dispatch,
  navigate,
}) {
  const { t } = useTranslation();
  if (!campaign?.status || campaign.status === 'active') return null;

  const icon = campaign.status === 'completed' ? 'emoji_events' : 'skull';
  const title = campaign.status === 'completed'
    ? t('gameplay.campaignCompleted', 'Campaign Completed!')
    : t('gameplay.campaignFailed', 'Campaign Failed');

  const onExport = () => {
    if (isMultiplayer && mpGameState) {
      exportAsMarkdown({
        campaign: mpGameState.campaign,
        character,
        scenes: mpGameState.scenes,
        chatHistory: mpGameState.chatHistory,
        quests: mpGameState.quests,
        world: mpGameState.world,
      });
    } else {
      exportAsMarkdown(getGameState());
    }
  };

  const onExportJson = () => {
    if (isMultiplayer && mpGameState) {
      exportAsJson({ ...mpGameState, character });
    } else {
      exportAsJson(getGameState());
    }
  };

  const onNewCampaign = () => {
    const guard = canLeaveCampaign(getGameState());
    if (!guard.allowed) {
      window.alert(getLeaveBlockedMessage(guard.reason));
      return;
    }
    dispatch({ type: 'RESET' });
    navigate('/');
  };

  return (
    <div className="px-2 animate-fade-in">
      <div className="bg-surface-container-low p-8 border border-primary/20 rounded-sm text-center space-y-4">
        <span className="material-symbols-outlined text-5xl text-primary">{icon}</span>
        <h2 className="font-headline text-2xl text-tertiary">{title}</h2>
        {campaign.epilogue && (
          <p className="text-on-surface-variant text-sm leading-relaxed max-w-xl mx-auto">{campaign.epilogue}</p>
        )}
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-high/40 border border-outline-variant/15 rounded-sm text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            {t('gameplay.exportLog')}
          </button>
          <button
            onClick={onExportJson}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-high/40 border border-outline-variant/15 rounded-sm text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm">data_object</span>
            {t('gameplay.exportCampaignJson')}
          </button>
          <button
            onClick={onNewCampaign}
            className="flex items-center gap-2 px-6 py-2 bg-primary/15 border border-primary/30 rounded-sm text-xs font-label uppercase tracking-widest text-primary hover:bg-primary/25 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t('gameplay.newCampaign', 'New Campaign')}
          </button>
        </div>
      </div>
    </div>
  );
}
