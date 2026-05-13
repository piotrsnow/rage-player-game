import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import { useSettings } from '../../contexts/SettingsContext';
import { excerpt, genreBorderColors } from './galleryHelpers';
import GlassCard from '../ui/GlassCard';
import Button from '../ui/Button';

export default function MyChronicles({ onOpenLightbox, resolveImage }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

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
              </div>
            </GlassCard>

            {scenesWithImages.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-outline-variant/30">
                {scenesWithImages.map((scene) => {
                  const imgSrc = resolveImage(scene.imageUrl);
                  return (
                    <div
                      key={scene.id}
                      className={`
                        shrink-0 w-48 rounded-sm overflow-hidden cursor-pointer group relative
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
