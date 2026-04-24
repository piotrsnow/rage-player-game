import { useTranslation } from 'react-i18next';

/**
 * End-state notices that sit in the bottom fixed area:
 *   - Solo: character died mid-campaign but the campaign itself is still active
 *     (scene generation stopped, but previous scenes remain reviewable).
 *   - MP: this player died but the session goes on — they stay as a spectator.
 *
 * Shown only while the campaign's status is still active; a finalized
 * campaign shows `GameplayCampaignEnd` instead.
 */
export default function GameplayDeadNotices({
  character,
  campaign,
  isMultiplayer,
  mp,
  readOnly,
}) {
  const { t } = useTranslation();
  if (readOnly) return null;
  const campaignActive = !campaign?.status || campaign.status === 'active';
  if (!campaignActive) return null;

  const showSoloDead = !isMultiplayer && character?.status === 'dead';
  const showMpSpectator = isMultiplayer && mp.state.isDead;

  if (!showSoloDead && !showMpSpectator) return null;

  return (
    <>
      {showSoloDead && (
        <div className="px-2 animate-fade-in">
          <div className="bg-error-container/20 border border-error/20 p-6 rounded-sm text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-error">skull</span>
            <p className="text-error font-headline text-lg">{t('gameplay.characterDead', 'Your character has fallen')}</p>
            <p className="text-on-surface-variant text-xs">{t('gameplay.characterDeadDesc', 'Death is final.')}</p>
          </div>
        </div>
      )}

      {showMpSpectator && (
        <div className="px-2 animate-fade-in">
          <div className="bg-error-container/20 border border-error/20 p-6 rounded-sm text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-error">skull</span>
            <p className="text-error font-headline text-lg">{t('combat.playerDied', 'Your character has fallen')}</p>
            <p className="text-on-surface-variant text-xs">{t('combat.spectatorDesc', 'You are now spectating. Your character is dead and cannot take any more actions.')}</p>
          </div>
        </div>
      )}
    </>
  );
}
