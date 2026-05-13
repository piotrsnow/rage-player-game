import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import { useSettings } from '../../contexts/SettingsContext';
import { excerpt, genreBorderColors } from './galleryHelpers';
import GlassCard from '../ui/GlassCard';
import Button from '../ui/Button';

const TILE_W = 192 + 12; // w-48 (192px) + gap-3 (12px)

function SceneStrip({ scenes, campaign, onOpenLightbox, resolveImage, t }) {
  const stripRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [visibleRange, setVisibleRange] = useState('');

  const updateScrollState = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);

    const firstVisible = Math.floor(scrollLeft / TILE_W) + 1;
    const lastVisible = Math.min(
      Math.ceil((scrollLeft + clientWidth) / TILE_W),
      scenes.length,
    );
    setVisibleRange(`${firstVisible}–${lastVisible} / ${scenes.length}`);
  }, [scenes.length]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scroll = useCallback((dir) => {
    const el = stripRef.current;
    if (!el) return;
    const pageW = el.clientWidth;
    el.scrollBy({ left: dir * pageW, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative group/strip">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scroll(-1)}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                     bg-gradient-to-r from-surface/90 to-transparent
                     opacity-0 group-hover/strip:opacity-100 transition-opacity duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined text-on-surface text-2xl drop-shadow">chevron_left</span>
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scroll(1)}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center
                     bg-gradient-to-l from-surface/90 to-transparent
                     opacity-0 group-hover/strip:opacity-100 transition-opacity duration-200 cursor-pointer"
        >
          <span className="material-symbols-outlined text-on-surface text-2xl drop-shadow">chevron_right</span>
        </button>
      )}

      <div
        ref={stripRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth chronicles-strip"
      >
        {scenes.map((scene) => {
          const imgSrc = resolveImage(scene.imageUrl);
          return (
            <div
              key={scene.id}
              className={`
                shrink-0 w-48 snap-start rounded-sm overflow-hidden cursor-pointer group relative
                ${scene.isFavorite ? 'ring-2 ring-rose-400/60 shadow-[0_0_12px_rgba(251,113,133,0.3)]' : ''}
              `}
              onClick={() => onOpenLightbox({
                ...scene,
                campaignName: campaign.name,
                likeCount: 0,
              })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenLightbox({ ...scene, campaignName: campaign.name, likeCount: 0 });
                }
              }}
            >
              <img
                src={imgSrc}
                alt=""
                loading="lazy"
                className="w-full h-32 object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2">
                <p className="text-white text-[10px]">{t('common.scene')} {scene.sceneIndex + 1}</p>
                <p className="text-white/60 text-[9px] line-clamp-2">{excerpt(scene.narrative, 80)}</p>
              </div>
              {scene.isFavorite && (
                <span className="absolute top-1.5 right-1.5 material-symbols-outlined text-rose-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  favorite
                </span>
              )}
            </div>
          );
        })}
      </div>

      {scenes.length > 0 && (
        <span className="absolute -top-8 right-0 text-[10px] text-on-surface-variant/60 tabular-nums">
          {visibleRange}
        </span>
      )}
    </div>
  );
}

export default function MyChronicles({ onOpenLightbox, resolveImage }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const isConnected = settings.useBackend && !!settings.backendUrl && apiClient.isConnected();

  const load = useCallback(async () => {
    if (!isConnected) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiClient.get('/gallery/my-chronicles');
      setCampaigns(data.campaigns || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => { load(); }, [load]);

  const togglePublish = useCallback(async (campaignId, currentlyPublic) => {
    setTogglingId(campaignId);
    try {
      await apiClient.patch(`/campaigns/${campaignId}/publish`, { isPublic: !currentlyPublic });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, isPublic: !currentlyPublic } : c)),
      );
    } catch {
      /* silent — user can retry */
    } finally {
      setTogglingId(null);
    }
  }, []);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <span className="material-symbols-outlined text-5xl text-outline/30 mb-3 block">lock</span>
        <p className="text-on-surface-variant text-sm mb-4">{t('gallery.chroniclesLoginRequired', 'Log in to see your chronicles.')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <span className="material-symbols-outlined text-6xl text-outline/20 mb-4 block">auto_stories</span>
        <p className="text-on-surface font-headline text-lg mb-2">
          {t('gallery.chroniclesEmpty', 'Twoja kronika jest pusta')}
        </p>
        <p className="text-on-surface-variant text-sm mb-6">
          {t('gallery.chroniclesEmptyHint', 'Zagraj w kampanię, a twoje najlepsze chwile pojawią się tutaj.')}
        </p>
        <Button onClick={() => navigate('/create')}>
          {t('gallery.createCampaign', 'Stwórz kampanię')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {campaigns.map((campaign) => {
        const borderColor = genreBorderColors[campaign.genre] || 'border-l-primary-dim';
        const scenesWithImages = campaign.scenes.filter((s) => s.imageUrl);
        const scenesWithoutImages = campaign.scenes.filter((s) => !s.imageUrl);

        return (
          <section key={campaign.id}>
            <GlassCard elevated className={`p-4 border-l-2 ${borderColor} mb-4`}>
              <div className="flex items-center gap-3">
                <h3 className="font-headline text-on-surface text-base flex-1 truncate">{campaign.name}</h3>
                <span className="px-2 py-0.5 bg-surface-container text-primary text-[10px] font-bold rounded-full border border-outline-variant/20">
                  {campaign.genre}
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  {campaign.sceneCount} {t('common.scenes', 'scenes')}
                </span>
                <button
                  type="button"
                  onClick={() => togglePublish(campaign.id, campaign.isPublic)}
                  disabled={togglingId === campaign.id}
                  title={campaign.isPublic
                    ? t('gallery.unpublish', 'Ukryj z galerii')
                    : t('gallery.publish', 'Opublikuj w galerii')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    campaign.isPublic
                      ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                      : 'bg-surface-container text-outline border-outline-variant/20 hover:text-on-surface hover:border-outline-variant/40'
                  } ${togglingId === campaign.id ? 'opacity-50' : ''}`}
                >
                  {togglingId === campaign.id
                    ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                    : <span className="material-symbols-outlined text-xs" style={campaign.isPublic ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                        {campaign.isPublic ? 'visibility' : 'visibility_off'}
                      </span>}
                  {campaign.isPublic
                    ? t('gallery.published', 'Publiczna')
                    : t('gallery.notPublished', 'Prywatna')}
                </button>
              </div>
            </GlassCard>

            {scenesWithImages.length > 0 && (
              <SceneStrip
                scenes={scenesWithImages}
                campaign={campaign}
                onOpenLightbox={onOpenLightbox}
                resolveImage={resolveImage}
                t={t}
              />
            )}

            {scenesWithImages.length === 0 && scenesWithoutImages.length > 0 && (
              <p className="text-on-surface-variant text-xs italic pl-2">
                {t('gallery.noImages', 'No scene images for this campaign.')}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
