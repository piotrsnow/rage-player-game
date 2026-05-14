import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';

export default function BadgeModal({ characterId, sceneCount, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const maxScene = sceneCount || 1;
  const [from, setFrom] = useState(Math.max(1, maxScene - 9));
  const [to, setTo] = useState(maxScene);
  const [loading, setLoading] = useState(false);
  const [badge, setBadge] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const handleGenerate = async () => {
    if (loading || !characterId) return;
    setLoading(true);
    setBadge(null);
    setClaimResult(null);
    try {
      const res = await apiClient.post(`/characters/${characterId}/badges/generate`, {
        sceneFrom: Math.max(1, Math.min(from, to)),
        sceneTo: Math.min(maxScene, Math.max(from, to)),
      });
      setBadge(res);
    } catch (err) {
      console.error('[BadgeModal] generation failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || !badge) return;
    setClaiming(true);
    try {
      const res = await apiClient.post(`/characters/${characterId}/badges/${badge.id}/claim`, {});
      setClaimResult(res);
      setBadge((prev) => ({ ...prev, xpAwarded: res.xpAwarded }));
    } catch {
      // silent
    } finally {
      setClaiming(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating || !badge?.imagePrompt) return;
    setRegenerating(true);
    try {
      const res = await apiClient.post(`/characters/${characterId}/badges/${badge.id}/regenerate-image`, {});
      setBadge((prev) => ({ ...prev, imageUrl: res.imageUrl }));
    } catch {
      // silent
    } finally {
      setRegenerating(false);
    }
  };

  const claimed = badge?.xpAwarded != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('badges.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-surface-container-highest/95 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">military_tech</span>
            {t('badges.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', 'Zamknij')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {!badge ? (
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1">Od sceny</label>
                <input
                  type="number"
                  min={1}
                  max={maxScene}
                  value={from}
                  onChange={(e) => setFrom(Math.max(1, Math.min(maxScene, parseInt(e.target.value, 10) || 1)))}
                  disabled={loading}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-sm text-on-surface text-sm focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1">Do sceny</label>
                <input
                  type="number"
                  min={1}
                  max={maxScene}
                  value={to}
                  onChange={(e) => setTo(Math.max(1, Math.min(maxScene, parseInt(e.target.value, 10) || 1)))}
                  disabled={loading}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-sm text-on-surface text-sm focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || from > to}
                className="px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm text-primary text-sm font-label uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading ? (
                  <span className="material-symbols-outlined text-base animate-spin">sync</span>
                ) : (
                  t('badges.generate')
                )}
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8 gap-2 text-on-surface-variant/50">
                <span className="material-symbols-outlined animate-spin">sync</span>
                <span className="text-sm">{t('badges.generating')}</span>
              </div>
            )}
          </div>
        ) : (
          <>
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

            <div className="px-6 py-5 space-y-4">
              <div>
                <h3 className="font-headline text-xl text-tertiary leading-tight">{badge.name}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed mt-2">{badge.description}</p>
              </div>

              {claimResult ? (
                <div className="text-center py-3 animate-fade-in">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm">
                    <span className="material-symbols-outlined text-primary text-lg">stars</span>
                    <span className="text-primary font-headline text-2xl">+{claimResult.xpAwarded} XP</span>
                  </div>
                  {claimResult.leveledUp && (
                    <p className="text-tertiary font-headline text-sm mt-2 animate-pulse">
                      {t('badges.levelUp', { level: claimResult.newCharacterLevel })}
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
                    onClick={handleRegenerate}
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
                  onClick={() => { setBadge(null); setClaimResult(null); }}
                  className="flex items-center gap-1 text-xs text-on-surface-variant/70 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  {t('badges.generateAnother', 'Kolejna')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
