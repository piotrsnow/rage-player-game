import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';

function BadgeClaimModal({ badge, onClaim, onRegenerate, onClose, claiming, regenerating }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const [xpResult, setXpResult] = useState(null);

  const handleClaim = async () => {
    const result = await onClaim(badge.id);
    if (result) setXpResult(result);
  };

  const claimed = badge.xpAwarded != null || xpResult;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-sm bg-surface-container-highest/95 backdrop-blur-2xl border border-outline-variant/15 rounded-sm shadow-2xl animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {badge.imageUrl ? (
          <div className="relative w-full aspect-square bg-surface-container-high">
            <img
              src={apiClient.resolveMediaUrl(badge.imageUrl)}
              alt={badge.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-dim via-transparent to-transparent" />
          </div>
        ) : (
          <div className="w-full aspect-[3/2] bg-gradient-to-br from-surface-container to-surface-container-lowest flex items-center justify-center">
            <span className="material-symbols-outlined text-8xl text-primary/20">{badge.icon || 'shield'}</span>
          </div>
        )}

        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-headline text-xl text-tertiary leading-tight">{badge.name}</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mt-2">{badge.description}</p>
          </div>

          {xpResult ? (
            <div className="text-center py-3 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm">
                <span className="material-symbols-outlined text-primary text-lg">stars</span>
                <span className="text-primary font-headline text-2xl">+{xpResult.xpAwarded} XP</span>
              </div>
              {xpResult.leveledUp && (
                <p className="text-tertiary font-headline text-sm mt-2 animate-pulse">
                  {t('badges.levelUp', { level: xpResult.newCharacterLevel })}
                </p>
              )}
            </div>
          ) : claimed ? (
            <div className="text-center py-2">
              <span className="text-on-surface-variant/60 text-sm">
                {t('badges.alreadyClaimed', { xp: badge.xpAwarded })}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-2.5 bg-primary/15 border border-primary/30 rounded-sm text-primary font-label uppercase tracking-wider text-sm hover:bg-primary/25 transition-colors disabled:opacity-40"
            >
              {claiming ? (
                <span className="material-symbols-outlined text-base animate-spin">sync</span>
              ) : (
                t('badges.claimXp')
              )}
            </button>
          )}

          <div className="flex items-center justify-between">
            {badge.imagePrompt && (
              <button
                type="button"
                onClick={() => onRegenerate(badge.id)}
                disabled={regenerating}
                className="flex items-center gap-1 text-xs text-on-surface-variant/70 hover:text-tertiary transition-colors disabled:opacity-40"
              >
                <span className={`material-symbols-outlined text-sm ${regenerating ? 'animate-spin' : ''}`}>
                  {regenerating ? 'progress_activity' : 'refresh'}
                </span>
                {t('badges.regenerateImage')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-on-surface-variant/70 hover:text-primary transition-colors ml-auto"
            >
              {t('common.close', 'Zamknij')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BadgesSection({ characterId }) {
  const { t } = useTranslation();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const scrollRef = useRef(null);

  const fetchBadges = useCallback(async () => {
    if (!characterId) return;
    try {
      const data = await apiClient.get(`/characters/${characterId}/badges`);
      setBadges(data.badges || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const badge = await apiClient.post(`/characters/${characterId}/badges/generate`, {});
      setBadges((prev) => [badge, ...prev]);
      setSelectedBadge(badge);
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  };

  const handleClaim = async (badgeId) => {
    if (claiming) return null;
    setClaiming(true);
    try {
      const result = await apiClient.post(`/characters/${characterId}/badges/${badgeId}/claim`, {});
      setBadges((prev) => prev.map((b) => b.id === badgeId ? { ...b, xpAwarded: result.xpAwarded } : b));
      return result;
    } catch {
      return null;
    } finally {
      setClaiming(false);
    }
  };

  const handleRegenerate = async (badgeId) => {
    if (regenerating) return;
    setRegenerating(badgeId);
    try {
      const updated = await apiClient.post(`/characters/${characterId}/badges/${badgeId}/regenerate-image`, {});
      setBadges((prev) => prev.map((b) => b.id === badgeId ? { ...b, imageUrl: updated.imageUrl } : b));
      if (selectedBadge?.id === badgeId) {
        setSelectedBadge((prev) => ({ ...prev, imageUrl: updated.imageUrl }));
      }
    } catch {
      // silent
    } finally {
      setRegenerating(null);
    }
  };

  if (loading) return null;

  return (
    <>
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-tertiary font-headline flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">military_tech</span>
            {t('badges.title')}
          </h3>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-on-surface-variant hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10 disabled:opacity-40"
          >
            <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>
              {generating ? 'progress_activity' : 'add_circle'}
            </span>
            {generating ? t('badges.generating') : t('badges.generate')}
          </button>
        </div>

        {badges.length === 0 ? (
          <p className="text-on-surface-variant/50 text-sm text-center py-4">
            {t('badges.empty')}
          </p>
        ) : (
          <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {badges.map((badge) => {
              const claimed = badge.xpAwarded != null;
              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => setSelectedBadge(badge)}
                  className={`group shrink-0 w-28 flex flex-col items-center text-center transition-all rounded-sm border overflow-hidden ${
                    claimed
                      ? 'border-outline-variant/10 opacity-60 hover:opacity-80'
                      : 'border-primary/20 hover:border-primary/40 animate-pulse-subtle'
                  }`}
                >
                  {badge.imageUrl ? (
                    <div className="w-full aspect-square bg-surface-container-high relative">
                      <img
                        src={apiClient.resolveMediaUrl(badge.imageUrl)}
                        alt={badge.name}
                        className={`w-full h-full object-cover ${claimed ? 'grayscale' : ''}`}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      {!claimed && (
                        <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
                      )}
                    </div>
                  ) : (
                    <div className={`w-full aspect-square flex items-center justify-center bg-surface-container-high/60 relative ${claimed ? 'grayscale' : ''}`}>
                      <span className="material-symbols-outlined text-3xl text-primary/40">{badge.icon || 'shield'}</span>
                      {!claimed && (
                        <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
                      )}
                    </div>
                  )}
                  <div className="px-1.5 py-2 w-full">
                    <span className="text-[10px] font-label uppercase tracking-wide text-on-surface-variant leading-tight line-clamp-2">
                      {badge.name}
                    </span>
                    {claimed && (
                      <span className="text-[9px] text-outline mt-0.5 block">+{badge.xpAwarded} XP</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedBadge && (
        <BadgeClaimModal
          badge={selectedBadge}
          onClaim={handleClaim}
          onRegenerate={handleRegenerate}
          onClose={() => setSelectedBadge(null)}
          claiming={claiming}
          regenerating={regenerating === selectedBadge.id}
        />
      )}
    </>
  );
}
