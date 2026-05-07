import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from '../ui/Tooltip';
import ScenePreviewModal from './ScenePreviewModal';

const REWARD_ICONS = {
  attribute: 'star',
  mana: 'auto_awesome',
  wounds: 'favorite',
};

function resolveBadgeIcon(badge, skillIcons) {
  if (skillIcons && skillIcons[badge.name]) return skillIcons[badge.name];
  return 'military_tech';
}

function BadgeTooltip({ badge, t }) {
  const date = new Date(badge.earnedAt);
  const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const rewardLabel = badge.reward
    ? t(`character.badgeReward_${badge.reward}`, { defaultValue: badge.reward })
    : null;

  return (
    <div className="space-y-1.5 max-w-xs">
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-amber-400 text-sm">military_tech</span>
        <span className="text-amber-400 font-bold text-sm">{badge.name}</span>
      </div>
      <p className="text-xs text-on-surface-variant/80">
        {t('character.badgeEarnedFor', { defaultValue: 'Za niestandardową umiejętność użytą w grze' })}
      </p>
      <p className="text-[10px] text-outline/60 tabular-nums">{dateStr}</p>
      {badge.redeemed && rewardLabel && (
        <p className="text-[11px] text-amber-300 italic mt-1.5 pt-1.5 border-t border-outline-variant/15">
          {t('character.badgeReceived', { reward: rewardLabel, defaultValue: 'Otrzymano: {{reward}}' })}
        </p>
      )}
      {!badge.redeemed && (
        <p className="text-[11px] text-primary mt-1.5 pt-1.5 border-t border-outline-variant/15">
          {t('character.badgeClickRedeem', { defaultValue: 'Kliknij aby odebrać losową nagrodę' })}
        </p>
      )}
      {badge.campaignId && badge.sceneIndex != null && (
        <p className="text-[10px] text-outline/50 italic">
          {t('character.badgeFromScene', { index: badge.sceneIndex + 1, defaultValue: 'Ze sceny #{{index}}' })}
        </p>
      )}
    </div>
  );
}

function BadgeCircle({ badge, index, onRedeem, onShowScene, t, skillIcons }) {
  const icon = resolveBadgeIcon(badge, skillIcons);
  const isRedeemed = !!badge.redeemed;

  const handleClick = () => {
    if (isRedeemed) {
      if (badge.campaignId && badge.sceneIndex != null) onShowScene(badge);
      return;
    }
    onRedeem(index);
  };

  const baseClasses = 'group relative flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all';
  const stateClasses = isRedeemed
    ? 'bg-surface-container-high/30 border-outline-variant/15 text-on-surface-variant/30 cursor-default grayscale'
    : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:border-amber-400 hover:scale-110 cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.15)]';

  return (
    <Tooltip content={<BadgeTooltip badge={badge} t={t} />} placement="top" delay={150}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isRedeemed && !(badge.campaignId && badge.sceneIndex != null)}
        className={`${baseClasses} ${stateClasses}`}
        aria-label={badge.name}
      >
        <span className="material-symbols-outlined text-xl">{icon}</span>
        {isRedeemed && badge.reward && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-[11px] text-amber-300/70">
              {REWARD_ICONS[badge.reward] || 'check'}
            </span>
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export default function BadgesSection({ badges, onRedeem, skillIcons }) {
  const { t } = useTranslation();
  const [scenePreview, setScenePreview] = useState(null);
  const [rewardFlash, setRewardFlash] = useState(null);

  if (!Array.isArray(badges) || badges.length === 0) return null;

  const handleRedeem = (index) => {
    const reward = onRedeem(index);
    if (reward) {
      setRewardFlash({ reward, ts: Date.now() });
      setTimeout(() => setRewardFlash(null), 2200);
    }
  };

  const flashLabel = rewardFlash
    ? t(`character.badgeRewardFlash_${rewardFlash.reward}`, {
        defaultValue:
          rewardFlash.reward === 'attribute' ? '+1 punkt cechy!'
          : rewardFlash.reward === 'mana' ? '+1 max many!'
          : '+1 max obrażeń!',
      })
    : null;

  return (
    <>
      <div className="bg-surface-container-low p-6 border border-amber-500/15 rounded-sm relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-amber-400 font-headline flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">military_tech</span>
            {t('character.skillBadges', { defaultValue: 'Odznaki' })}
            <span className="text-xs text-outline/60 tabular-nums font-normal">
              ({badges.length})
            </span>
          </h3>
          {rewardFlash && (
            <span
              key={rewardFlash.ts}
              className="text-sm text-amber-300 font-bold animate-fade-in flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">
                {REWARD_ICONS[rewardFlash.reward] || 'star'}
              </span>
              {flashLabel}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {badges.map((badge, idx) => (
            <BadgeCircle
              key={`${badge.name}-${badge.earnedAt || idx}`}
              badge={badge}
              index={idx}
              onRedeem={handleRedeem}
              onShowScene={setScenePreview}
              t={t}
              skillIcons={skillIcons}
            />
          ))}
        </div>

        <p className="mt-4 text-[10px] text-on-surface-variant/50">
          {t('character.badgesHint2', {
            defaultValue: 'Każda odznaka po kliknięciu daje losową nagrodę: +1 punkt cechy, +1 max many lub +1 max obrażeń.',
          })}
        </p>
      </div>

      {scenePreview && (
        <ScenePreviewModal
          campaignId={scenePreview.campaignId}
          sceneIndex={scenePreview.sceneIndex}
          header={
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-base">military_tech</span>
              <span className="text-sm text-amber-400 font-bold">{scenePreview.name}</span>
            </div>
          }
          onClose={() => setScenePreview(null)}
        />
      )}
    </>
  );
}
