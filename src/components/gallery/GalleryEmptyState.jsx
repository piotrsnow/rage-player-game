import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';

export default function GalleryEmptyState({ backendReady, fetchError }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div data-testid="gallery-empty" className="relative z-10 max-w-lg mx-auto text-center py-16 px-6">
      <GlassCard elevated className="p-10 border border-outline-variant/20">
        <span className="material-symbols-outlined text-6xl text-outline/30 mb-4 block">travel_explore</span>
        {!backendReady ? (
          <>
            <p className="font-headline text-on-surface mb-2">{t('gallery.backendOff', 'Backend not connected')}</p>
            <p className="text-sm text-on-surface-variant mb-6">
              {t(
                'gallery.backendOffHint',
                'Turn on “Use backend” and set your server URL in settings to load the public gallery.',
              )}
            </p>
          </>
        ) : fetchError ? (
          <>
            <p className="font-headline text-error mb-2">{t('gallery.loadError', 'Could not load gallery')}</p>
            <p className="text-sm text-on-surface-variant mb-6">{fetchError}</p>
          </>
        ) : (
          <>
            <p className="font-headline text-on-surface mb-2">{t('gallery.empty', 'No public campaigns yet')}</p>
            <p className="text-sm text-on-surface-variant mb-6">
              {t('gallery.emptyHint', 'Check back later, or verify the /campaigns/public API is available.')}
            </p>
          </>
        )}
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('gallery.backToLobby', 'Back to lobby')}
        </Button>
      </GlassCard>
    </div>
  );
}
