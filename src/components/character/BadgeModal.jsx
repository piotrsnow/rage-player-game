import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useGameDispatch } from '../../stores/gameSelectors';
import XpCounter from './XpCounter';

/**
 * Unified badge modal — three modes:
 *  1. `badge` is null + `onGenerate` provided → scene range picker
 *  2. `badge` is set → result view (medal image + claim XP)
 *
 * Optional features controlled by props:
 *  - `onClaim`   → delegate claim externally (BadgesSection); if absent, claims internally via characterId
 *  - `onDelete`  → show delete button (BadgesSection)
 *  - `onGenerate` + `sceneCount` → show picker when badge is null (Sidebar)
 */
export default function BadgeModal({
  characterId,
  sceneCount,
  badge,
  onGenerate,
  onClaim,
  onDelete,
  onClose,
  onRegenerate,
  regenerating,
  claiming: externalClaiming,
}) {
  const { t } = useTranslation();
  const dispatch = useGameDispatch();
  const modalRef = useModalA11y(onClose);
  const maxScene = sceneCount || 1;

  const [from, setFrom] = useState(Math.max(1, maxScene - 9));
  const [to, setTo] = useState(maxScene);
  const [internalClaiming, setInternalClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const claiming = externalClaiming ?? internalClaiming;

  const handleGenerate = () => {
    const f = Math.max(1, Math.min(from, to));
    const toVal = Math.min(maxScene, Math.max(from, to));
    onGenerate(f, toVal);
  };

  const dispatchXpMessages = (badgeName, result) => {
    const contentKey = result.leveledUp ? 'badges.chatLevelUp' : 'badges.chatXpClaimed';
    const contentOpts = result.leveledUp
      ? { name: badgeName, xp: result.xpAwarded, level: result.newCharacterLevel }
      : { name: badgeName, xp: result.xpAwarded };
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_badge_xp`,
        role: 'system',
        subtype: 'badge_xp',
        content: t(contentKey, contentOpts),
        timestamp: Date.now(),
      },
    });
    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        characterXp: result.newCharacterXp,
        characterLevel: result.newCharacterLevel,
      },
    });
  };

  const handleClaim = async () => {
    if (claiming || !badge) return;

    if (onClaim) {
      const result = await onClaim(badge.id);
      if (result) setClaimResult(result);
      return;
    }

    setInternalClaiming(true);
    try {
      const res = await apiClient.post(`/characters/${characterId}/badges/${badge.id}/claim`, {});
      setClaimResult(res);
      dispatchXpMessages(badge.name || t('badges.title'), res);
    } catch { /* silent */ } finally {
      setInternalClaiming(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await onDelete(badge.id);
  };

  const claimed = badge?.xpAwarded != null || claimResult;
  const isPicker = !badge;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('badges.modalTitle')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {/* Floating medal above modal */}
        {badge && (
          <div
            className="badge-medal-frame-lg w-64 h-64 rounded-full overflow-hidden relative z-10 mb-4 shrink-0"
            style={badge.color ? { '--badge-color': badge.color } : undefined}
          >
            {badge.imageUrl ? (
              <img
                src={apiClient.resolveMediaUrl(badge.imageUrl)}
                alt={badge.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[rgba(16,14,20,0.6)] to-[rgba(26,18,40,0.4)] flex items-center justify-center">
                <span className="material-symbols-outlined text-5xl text-[rgba(197,154,255,0.25)]">{badge.icon || 'shield'}</span>
              </div>
            )}
          </div>
        )}

        <div
          ref={modalRef}
          className="holo-card relative w-full backdrop-blur-xl flex flex-col animate-fade-in overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(197,154,255,0.12)] shrink-0">
            <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
              <span className="material-symbols-outlined text-[rgba(197,154,255,0.7)]">military_tech</span>
              {t('badges.modalTitle')}
            </h2>
            <button
              onClick={onClose}
              aria-label={t('common.close', 'Zamknij')}
              className="text-[rgba(220,200,255,0.5)] hover:text-[rgba(197,154,255,0.9)] transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Scene range picker */}
          {isPicker && onGenerate && (
            <div className="px-6 py-5 space-y-5">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[rgba(220,200,255,0.5)] mb-1">
                    {t('badges.fromScene', 'Od sceny')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={maxScene}
                    value={from}
                    onChange={(e) => setFrom(Math.max(1, Math.min(maxScene, parseInt(e.target.value, 10) || 1)))}
                    className="w-full px-3 py-2 bg-[rgba(16,14,20,0.5)] border border-[rgba(197,154,255,0.15)] rounded-md text-on-surface text-sm focus:border-[rgba(197,154,255,0.4)] focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[rgba(220,200,255,0.5)] mb-1">
                    {t('badges.toScene', 'Do sceny')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={maxScene}
                    value={to}
                    onChange={(e) => setTo(Math.max(1, Math.min(maxScene, parseInt(e.target.value, 10) || 1)))}
                    className="w-full px-3 py-2 bg-[rgba(16,14,20,0.5)] border border-[rgba(197,154,255,0.15)] rounded-md text-on-surface text-sm focus:border-[rgba(197,154,255,0.4)] focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={from > to}
                className="w-full py-2.5 bg-[rgba(197,154,255,0.12)] border border-[rgba(197,154,255,0.3)] rounded-md text-[rgba(197,154,255,0.9)] font-label uppercase tracking-wider text-sm hover:bg-[rgba(197,154,255,0.2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('badges.generate')}
              </button>
            </div>
          )}

          {/* Result — medal reveal */}
          {badge && (
            <div className="px-6 py-4 space-y-4">
              <div className="text-center">
                <h3
                  className="font-headline text-2xl leading-tight"
                  style={{ color: badge.color || '#ffefd5' }}
                >
                  {badge.name}
                </h3>
                <p className="text-[rgba(220,200,255,0.6)] text-sm leading-relaxed mt-2">{badge.description}</p>
              </div>

              {claimResult ? (
                <div className="text-center py-3 animate-fade-in">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-[rgba(197,154,255,0.1)] border border-[rgba(197,154,255,0.25)] rounded-md">
                    <span className="material-symbols-outlined text-[rgba(255,200,120,0.9)] text-lg">stars</span>
                    <span className="text-[rgba(255,200,120,0.9)] font-headline text-2xl">
                      <XpCounter target={claimResult.xpAwarded} />
                    </span>
                  </div>
                  {claimResult.leveledUp && (
                    <p className="text-tertiary font-headline text-sm mt-2 animate-pulse">
                      {t('badges.levelUp', { level: claimResult.newCharacterLevel })}
                    </p>
                  )}
                </div>
              ) : claimed ? (
                <div className="text-center py-2">
                  <span className="text-[rgba(220,200,255,0.4)] text-sm">
                    {t('badges.alreadyClaimed', { xp: badge.xpAwarded })}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full py-2.5 bg-[rgba(197,154,255,0.12)] border border-[rgba(197,154,255,0.3)] rounded-md text-[rgba(197,154,255,0.9)] font-label uppercase tracking-wider text-sm hover:bg-[rgba(197,154,255,0.2)] transition-colors disabled:opacity-40"
                >
                  {claiming ? (
                    <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  ) : (
                    t('badges.claimXp')
                  )}
                </button>
              )}

              <div className="flex items-center justify-between">
                {badge.imagePrompt && onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(badge.id)}
                    disabled={regenerating}
                    className="flex items-center gap-1 text-xs text-[rgba(220,200,255,0.45)] hover:text-[rgba(197,154,255,0.9)] transition-colors disabled:opacity-40"
                  >
                    <span className={`material-symbols-outlined text-sm ${regenerating ? 'animate-spin' : ''}`}>
                      {regenerating ? 'progress_activity' : 'refresh'}
                    </span>
                    {t('badges.regenerateImage')}
                  </button>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  {onDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1 text-xs text-[rgba(220,200,255,0.45)] hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      {confirmDelete ? t('badges.confirmDelete') : t('badges.delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-[rgba(220,200,255,0.45)] hover:text-[rgba(120,220,255,0.9)] transition-colors"
                  >
                    {t('common.close', 'Zamknij')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
