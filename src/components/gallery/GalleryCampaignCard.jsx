import { useTranslation } from 'react-i18next';
import GlassCard from '../ui/GlassCard';
import Button from '../ui/Button';
import StarRow from './StarRow';
import { genreIcons, genreBorderColors } from './galleryHelpers';

export default function GalleryCampaignCard({ entry, onOpen, onView }) {
  const { t, i18n } = useTranslation();
  const borderColor = genreBorderColors[entry.genre] || 'border-l-primary-dim';
  const icon = genreIcons[entry.genre] || 'book_5';
  const created = new Date(entry.createdAt).toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <GlassCard
      elevated
      data-testid="gallery-campaign-card"
      onClick={() => onOpen(entry)}
      className={`overflow-hidden border-l-2 ${borderColor} flex flex-col h-full`}
    >
      <div className="p-5 flex flex-col flex-1 min-h-0">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 bg-surface-container rounded-sm flex items-center justify-center border border-outline-variant/20 shrink-0">
            <span className="material-symbols-outlined text-primary-dim">{icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-headline text-on-surface text-base leading-tight truncate">{entry.name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="px-2 py-0.5 bg-surface-container-high text-primary text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.genre}
              </span>
              <span className="px-2 py-0.5 bg-surface-container-high text-tertiary-dim text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.tone}
              </span>
            </div>
          </div>
        </div>

        <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-4 flex-1 mb-4">
          {entry.description || t('gallery.noDescription', 'No description yet.')}
        </p>

        <div className="flex items-center justify-between gap-2 text-[10px] text-on-surface-variant mt-auto pt-3 border-t border-outline-variant/20">
          <span>
            {entry.sceneCount} {t('common.scenes')}
          </span>
          <span>{created}</span>
        </div>

        <div className="flex items-center justify-between mt-3 gap-2">
          <StarRow rating={entry.rating} />
          <Button
            size="sm"
            variant="secondary"
            className="!px-3 !py-2 !text-[10px]"
            onClick={(e) => {
              e.stopPropagation();
              onView(entry);
            }}
          >
            {t('gallery.view', 'View')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
