import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import Tooltip from '../ui/Tooltip';
import ScenePreviewModal from './ScenePreviewModal';

function BadgeTooltip({ badge, t }) {
  const date = badge.earnedAt ? new Date(badge.earnedAt) : null;
  const dateStr = date
    ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <div className="space-y-1.5 max-w-xs">
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-amber-400 text-sm">military_tech</span>
        <span className="text-amber-400 font-bold text-sm">{badge.name}</span>
      </div>
      {badge.description && (
        <p className="text-xs text-on-surface-variant/80">{badge.description}</p>
      )}
      {badge.xpValue > 0 && (
        <p className="text-xs text-amber-300 font-bold">+{badge.xpValue} XP</p>
      )}
      {dateStr && (
        <p className="text-[10px] text-outline/60 tabular-nums">{dateStr}</p>
      )}
      {badge.campaignId && badge.sceneIndex != null && (
        <p className="text-[10px] text-outline/50 italic">
          {t('character.badgeFromScene', { index: badge.sceneIndex + 1, defaultValue: 'Ze sceny #{{index}}' })}
        </p>
      )}
    </div>
  );
}

function BadgeCard({ badge, onClick, t }) {
  const imageUrl = badge.imageUrl ? apiClient.resolveMediaUrl(badge.imageUrl) : null;
  const canNavigate = !!(badge.campaignId && badge.sceneIndex != null);

  return (
    <Tooltip content={<BadgeTooltip badge={badge} t={t} />} placement="top" delay={150}>
      <button
        type="button"
        onClick={canNavigate ? onClick : undefined}
        disabled={!canNavigate}
        className="group flex flex-col items-center w-20 transition-all hover:scale-105 disabled:cursor-default"
        aria-label={badge.name}
      >
        <div className="relative w-14 h-14 rounded-full border-2 border-amber-500/30 bg-surface-container-high/50 flex items-center justify-center overflow-hidden shadow-[0_0_8px_rgba(245,158,11,0.1)] group-hover:border-amber-400/60 transition-colors">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={badge.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
          ) : null}
          <div className={`${imageUrl ? 'hidden' : 'flex'} items-center justify-center w-full h-full`}>
            <span className="material-symbols-outlined text-2xl text-amber-400/70">military_tech</span>
          </div>
        </div>
        <span className="text-[9px] text-on-surface-variant/70 font-label uppercase tracking-wide mt-1.5 leading-tight text-center line-clamp-2">
          {badge.name}
        </span>
        {badge.xpValue > 0 && (
          <span className="text-[8px] text-amber-400/60 tabular-nums font-bold">
            +{badge.xpValue} XP
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export default function BadgesSection({ badges }) {
  const { t } = useTranslation();
  const [scenePreview, setScenePreview] = useState(null);

  if (!Array.isArray(badges) || badges.length === 0) return null;

  return (
    <>
      <div className="bg-surface-container-low p-6 border border-amber-500/15 rounded-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-amber-400 font-headline flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">military_tech</span>
            {t('character.skillBadges', { defaultValue: 'Medale' })}
            <span className="text-xs text-outline/60 tabular-nums font-normal">
              ({badges.length})
            </span>
          </h3>
        </div>

        <div className="flex flex-wrap gap-4">
          {badges.map((badge, idx) => (
            <BadgeCard
              key={`${badge.name}-${badge.earnedAt || idx}`}
              badge={badge}
              onClick={() => setScenePreview(badge)}
              t={t}
            />
          ))}
        </div>
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
