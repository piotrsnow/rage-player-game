import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

const ROTATION_INTERVAL_MS = 4000;

export default function CampaignCardCover({ images = [], genre = 'Fantasy', campaignName = '' }) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const validImages = useMemo(
    () => images.filter((src) => typeof src === 'string' && src.trim().length > 0),
    [images],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [validImages.length]);

  useEffect(() => {
    if (validImages.length <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % validImages.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [validImages.length]);

  if (validImages.length === 0) {
    return (
      <div className="w-24 h-24 bg-surface-container-high rounded-sm flex items-center justify-center border border-primary/10 shrink-0 group-hover:border-primary/25 transition-colors">
        <span className="material-symbols-outlined text-primary-dim group-hover:text-primary transition-colors">
          {genreIcons[genre] || 'book_5'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-24 h-24 overflow-hidden rounded-sm border border-primary/10 shrink-0 group-hover:border-primary/25 transition-colors">
      {validImages.map((src, index) => (
        <img
          key={`${src}-${index}`}
          src={apiClient.resolveMediaUrl(src)}
          alt={t('lobby.campaignCoverAlt', {
            name: campaignName || 'Untitled',
          })}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            index === activeIndex ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}
