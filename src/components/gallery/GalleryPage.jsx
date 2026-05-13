import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import GalleryTabs from './GalleryTabs';
import DiscoverFeed from './DiscoverFeed';
import MyChronicles from './MyChronicles';
import CampaignBrowser from './CampaignBrowser';
import SceneLightbox from './SceneLightbox';

function readHashTab() {
  const h = window.location.hash.replace('#', '');
  if (['discover', 'chronicles', 'campaigns'].includes(h)) return h;
  return 'discover';
}

export default function GalleryPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('gallery.title'));
  const [activeTab, setActiveTab] = useState(readHashTab);
  const [lightboxScene, setLightboxScene] = useState(null);
  const [lightboxScenes, setLightboxScenes] = useState([]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  const resolveImage = useCallback((url) => apiClient.resolveMediaUrl(url), []);

  const openLightbox = useCallback((scene, allScenes) => {
    setLightboxScene(scene);
    setLightboxScenes(allScenes || [scene]);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxScene(null);
    setLightboxScenes([]);
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 sm:px-6 lg:px-10 py-8 relative">
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 left-0 w-[400px] h-[400px] bg-tertiary/[0.04] rounded-full blur-[90px] pointer-events-none" />

      <header className="relative z-10 max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-primary text-3xl">auto_stories</span>
          <h1 className="font-headline text-3xl md:text-4xl text-on-surface tracking-tight">
            {t('gallery.title')}
          </h1>
        </div>
        <p className="text-on-surface-variant text-sm max-w-xl">
          {t('gallery.subtitle')}
        </p>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto">
        <GalleryTabs activeTab={activeTab} onTabChange={handleTabChange} />

        {activeTab === 'discover' && (
          <DiscoverFeed onOpenLightbox={openLightbox} resolveImage={resolveImage} />
        )}
        {activeTab === 'chronicles' && (
          <MyChronicles onOpenLightbox={openLightbox} resolveImage={resolveImage} />
        )}
        {activeTab === 'campaigns' && (
          <CampaignBrowser />
        )}
      </div>

      {lightboxScene && (
        <SceneLightbox
          scene={lightboxScene}
          scenes={lightboxScenes}
          onClose={closeLightbox}
          onNavigate={(s) => setLightboxScene(s)}
          resolveImage={resolveImage}
        />
      )}
    </div>
  );
}
