import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { imageService } from '../../services/imageGen';
import { useSettings } from '../../contexts/SettingsContext';
import { useGameDispatch, useGameScenes } from '../../stores/gameSelectors';
import BadgeModal from './BadgeModal';

const BADGE_POLL_DELAY_MS = 6000;
const BADGE_POLL_INTERVAL_MS = 4000;
const BADGE_POLL_MAX_ATTEMPTS = 5;

const KNOWN_IMAGE_PROVIDERS = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'];

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function useImageProvider() {
  const { settings } = useSettings();
  const provider = KNOWN_IMAGE_PROVIDERS.includes(settings.sceneImageTier)
    ? settings.sceneImageTier
    : (settings.imageProvider || 'dalle');
  return { provider, sdModel: settings.sdWebuiModel || null };
}

export default function BadgesSection({ characterId }) {
  const { t } = useTranslation();
  const dispatch = useGameDispatch();
  const scenes = useGameScenes();
  const { provider, sdModel } = useImageProvider();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [preloadingBadgeId, setPreloadingBadgeId] = useState(null);
  const [hoveredBadge, setHoveredBadge] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const scrollRef = useRef(null);
  const knownBadgeIdsRef = useRef(new Set());
  const lastSceneCountRef = useRef(0);

  const fetchBadges = useCallback(async () => {
    if (!characterId) return;
    try {
      const data = await apiClient.get(`/characters/${characterId}/badges`);
      const fetched = data.badges || [];
      setBadges(fetched);
      knownBadgeIdsRef.current = new Set(fetched.map((b) => b.id));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  useEffect(() => {
    const sceneCount = scenes?.length || 0;
    if (sceneCount <= lastSceneCountRef.current) {
      lastSceneCountRef.current = sceneCount;
      return;
    }
    lastSceneCountRef.current = sceneCount;

    const sceneIndex = sceneCount - 1;
    if (sceneIndex <= 0 || sceneIndex % 5 !== 0) return;
    if (!characterId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await apiClient.get(`/characters/${characterId}/badges`);
        const fetched = data.badges || [];
        const newBadge = fetched.find(
          (b) => !knownBadgeIdsRef.current.has(b.id) && b.imageUrl,
        );
        if (newBadge) {
          setBadges(fetched);
          knownBadgeIdsRef.current = new Set(fetched.map((b) => b.id));
          await preloadImage(apiClient.resolveMediaUrl(newBadge.imageUrl));
          if (!cancelled) setSelectedBadge(newBadge);
          return;
        }
        const newBadgeNoImage = fetched.find(
          (b) => !knownBadgeIdsRef.current.has(b.id),
        );
        if (newBadgeNoImage) {
          setBadges(fetched);
          knownBadgeIdsRef.current = new Set(fetched.map((b) => b.id));
          if (!cancelled) setSelectedBadge(newBadgeNoImage);
          return;
        }
      } catch { /* silent */ }

      attempts++;
      if (attempts < BADGE_POLL_MAX_ATTEMPTS && !cancelled) {
        setTimeout(poll, BADGE_POLL_INTERVAL_MS);
      }
    };

    const timer = setTimeout(poll, BADGE_POLL_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scenes?.length, characterId]);

  const generateBadgeImageFE = useCallback(async (badge) => {
    if (!badge?.imagePrompt) return badge;
    try {
      const imageUrl = await imageService.generatePlaygroundImage({
        prompt: badge.imagePrompt,
        provider,
        sdModel,
      });
      if (imageUrl) {
        await apiClient.post(
          `/characters/${characterId}/badges/${badge.id}/regenerate-image`,
          { imageUrl },
        );
        return { ...badge, imageUrl };
      }
    } catch { /* non-fatal */ }
    return badge;
  }, [characterId, provider, sdModel]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      let badge = await apiClient.post(`/characters/${characterId}/badges/generate`, {});
      setBadges((prev) => [badge, ...prev]);
      if (badge.imagePrompt && !badge.imageUrl) {
        badge = await generateBadgeImageFE(badge);
        setBadges((prev) => prev.map((b) => b.id === badge.id ? badge : b));
      }
      if (badge.imageUrl) {
        await preloadImage(apiClient.resolveMediaUrl(badge.imageUrl));
      }
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

      const badge = badges.find((b) => b.id === badgeId) || selectedBadge;
      const badgeName = badge?.name || t('badges.title');
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
      const badge = badges.find((b) => b.id === badgeId) || selectedBadge;
      if (!badge?.imagePrompt) return;
      const updated = await generateBadgeImageFE(badge);
      if (updated.imageUrl) {
        await preloadImage(apiClient.resolveMediaUrl(updated.imageUrl));
      }
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

  const handleDelete = async (badgeId) => {
    try {
      await apiClient.del(`/characters/${characterId}/badges/${badgeId}`);
      setBadges((prev) => prev.filter((b) => b.id !== badgeId));
      setSelectedBadge(null);
    } catch { /* silent */ }
  };

  const handleBadgeTileClick = async (badge) => {
    if (preloadingBadgeId) return;
    if (badge.imageUrl) {
      setPreloadingBadgeId(badge.id);
      await preloadImage(apiClient.resolveMediaUrl(badge.imageUrl));
      setPreloadingBadgeId(null);
    }
    setSelectedBadge(badge);
  };

  if (loading) return null;

  return (
    <>
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm overflow-visible">
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
          <div ref={scrollRef} className="flex flex-wrap gap-3 pb-2 pt-3 px-2">
            {badges.map((badge) => {
              const claimed = badge.xpAwarded != null;
              const isPreloading = preloadingBadgeId === badge.id;
              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => handleBadgeTileClick(badge)}
                  disabled={isPreloading}
                  className="flex items-center justify-center transition-all"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                    setHoveredBadge(badge);
                  }}
                  onMouseLeave={() => setHoveredBadge(null)}
                >
                  <div
                    className={`badge-medal-frame badge-medal-hover w-28 h-28 rounded-full ${claimed ? 'badge-medal-claimed opacity-70 grayscale-[40%]' : 'badge-medal-breathe'}`}
                    style={badge.color ? { '--badge-color': badge.color } : undefined}
                  >
                    {badge.imageUrl ? (
                      isPreloading ? (
                        <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
                          <span className="material-symbols-outlined text-xl text-primary/40 animate-spin">progress_activity</span>
                        </div>
                      ) : (
                        <img
                          src={apiClient.resolveMediaUrl(badge.imageUrl)}
                          alt={badge.name}
                          className="w-full h-full object-cover opacity-85"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-container-high/60">
                        <span className="material-symbols-outlined text-2xl text-primary/40">{badge.icon || 'shield'}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hoveredBadge && tooltipPos && createPortal(
        <div
          className="badge-holo-tooltip pointer-events-none fixed whitespace-nowrap px-3 py-1.5 rounded text-center z-[9999] animate-fade-in"
          style={{
            '--badge-color': hoveredBadge.color || 'rgba(197, 154, 255, 0.9)',
            left: tooltipPos.x,
            top: tooltipPos.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="block text-base font-label uppercase tracking-wide leading-tight" style={{ color: hoveredBadge.color || 'rgba(197, 154, 255, 0.9)' }}>
            {hoveredBadge.name}
          </span>
          {hoveredBadge.xpAwarded != null && (
            <span className="block text-xs mt-0.5" style={{ color: hoveredBadge.color || 'rgba(197, 154, 255, 0.7)', opacity: 0.7 }}>+{hoveredBadge.xpAwarded} XP</span>
          )}
        </div>,
        document.body,
      )}

      {selectedBadge && createPortal(
        <BadgeModal
          badge={selectedBadge}
          onClaim={handleClaim}
          onRegenerate={handleRegenerate}
          onDelete={handleDelete}
          onClose={() => setSelectedBadge(null)}
          claiming={claiming}
          regenerating={regenerating === selectedBadge.id}
        />,
        document.body,
      )}
    </>
  );
}
