import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { imageService } from '../../services/imageGen';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { storage } from '../../services/storage';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Button from '../ui/Button';
import {
  PAGE_SIZE,
  normalizePublicListResponse,
  rowToGalleryEntry,
  forkPlayFromStart,
} from './galleryHelpers';
import GalleryFilters from './GalleryFilters';
import GalleryCampaignCard from './GalleryCampaignCard';
import GalleryEmptyState from './GalleryEmptyState';
import CampaignDetailModal from './CampaignDetailModal';

export default function GalleryPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('gallery.title'));
  const navigate = useNavigate();
  const { settings, hasApiKey } = useSettings();
  const { dispatch } = useGame();

  const [rawList, setRawList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [toneFilter, setToneFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const backendReady = settings.useBackend && !!settings.backendUrl;

  const repairReplaySceneImage = useCallback(async (scene, sceneIndex) => {
    if (!selected?.gameState?.campaign || !scene?.narrative) return false;

    const provider = settings.imageProvider || 'dalle';
    const keyProvider = provider === 'stability'
      ? 'stability'
      : provider === 'gemini'
        ? 'gemini'
        : provider === 'sd-webui'
          ? 'sd-webui'
          : 'openai';
    const imageApiKey = null;
    const hasAccess = apiClient.isConnected() && hasApiKey(keyProvider);
    if (!hasAccess) return false;

    try {
      const { url } = await imageService.generateSceneImage(
        scene.narrative,
        selected.genre,
        selected.tone,
        imageApiKey,
        provider,
        scene.imagePrompt || null,
        selected.gameState.campaign.backendId || null,
        settings.dmSettings?.imageStyle || 'painting',
        settings.dmSettings?.darkPalette || false,
        selected.gameState.character?.age ?? null,
        selected.gameState.character?.gender ?? null,
        { sdModel: settings.sdWebuiModel || null, sdSeed: Number.isInteger(settings.sdWebuiSeed) ? settings.sdWebuiSeed : null }
      );
      if (!url) return false;

      setSelected((prev) => {
        if (!prev?.gameState?.scenes) return prev;
        const scenes = [...prev.gameState.scenes];
        const idx = scenes.findIndex((s, i) => (scene.id ? s.id === scene.id : i === sceneIndex));
        if (idx < 0) return prev;
        scenes[idx] = { ...scenes[idx], image: url };
        return {
          ...prev,
          gameState: { ...prev.gameState, scenes },
        };
      });
      setRawList((prev) => prev.map((entry) => {
        if (entry.id !== selected.id || !entry.gameState?.scenes) return entry;
        const scenes = [...entry.gameState.scenes];
        const idx = scenes.findIndex((s, i) => (scene.id ? s.id === scene.id : i === sceneIndex));
        if (idx < 0) return entry;
        scenes[idx] = { ...scenes[idx], image: url };
        return {
          ...entry,
          gameState: { ...entry.gameState, scenes },
        };
      }));
      return true;
    } catch {
      return false;
    }
  }, [selected, settings, hasApiKey]);

  const load = useCallback(async () => {
    if (!backendReady) {
      setRawList([]);
      setLoading(false);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('q', search.trim());
      if (genreFilter) qs.set('genre', genreFilter);
      if (toneFilter) qs.set('tone', toneFilter);
      if (sort) qs.set('sort', sort);
      qs.set('limit', '200');
      const path = `/campaigns/public${qs.toString() ? `?${qs}` : ''}`;
      const json = await apiClient.get(path);
      const { list } = normalizePublicListResponse(json);
      setRawList(list.map(rowToGalleryEntry));
    } catch (e) {
      setFetchError(e.message || 'Failed to load');
      setRawList([]);
    } finally {
      setLoading(false);
    }
  }, [backendReady, search, genreFilter, toneFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSorted = useMemo(() => {
    let rows = [...rawList];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.genre.toLowerCase().includes(q) ||
          r.tone.toLowerCase().includes(q),
      );
    }
    if (genreFilter) rows = rows.filter((r) => r.genre === genreFilter);
    if (toneFilter) rows = rows.filter((r) => r.tone === toneFilter);

    if (sort === 'rating') {
      rows.sort((a, b) => b.rating - a.rating || Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
    } else if (sort === 'plays') {
      rows.sort((a, b) => b.playCount - a.playCount || b.rating - a.rating);
    } else {
      rows.sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
    }
    return rows;
  }, [rawList, search, genreFilter, toneFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, page, totalPages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resolveImage = useCallback((url) => apiClient.resolveMediaUrl(url), []);

  const handlePlayFromStart = useCallback(
    async (gameState) => {
      const forked = forkPlayFromStart(gameState);
      await storage.saveCampaign(forked);
      dispatch({ type: 'LOAD_CAMPAIGN', payload: forked });
      setSelected(null);
      navigate(`/play/${forked.campaign.backendId || forked.campaign.id}`);
    },
    [dispatch, navigate],
  );

  const showEmpty = !backendReady || fetchError || (!loading && filteredSorted.length === 0);

  const resetPage = () => setPage(1);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 sm:px-6 lg:px-10 py-8 relative">
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 left-0 w-[400px] h-[400px] bg-tertiary/[0.04] rounded-full blur-[90px] pointer-events-none" />

      <GalleryFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); resetPage(); }}
        genreFilter={genreFilter}
        onGenreChange={(v) => { setGenreFilter(v); resetPage(); }}
        toneFilter={toneFilter}
        onToneChange={(v) => { setToneFilter(v); resetPage(); }}
        sort={sort}
        onSortChange={(v) => { setSort(v); resetPage(); }}
      />

      {loading && (
        <div data-testid="gallery-loading" className="flex justify-center py-20 relative z-10">
          <span className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && !showEmpty && (
        <>
          <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {pageSlice.map((entry) => (
              <GalleryCampaignCard
                key={entry.id}
                entry={entry}
                onOpen={setSelected}
                onView={setSelected}
              />
            ))}
          </div>

          <div className="max-w-7xl mx-auto mt-10 flex items-center justify-center gap-4 relative z-10">
            <Button
              variant="secondary"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
              {t('gallery.prev', 'Previous')}
            </Button>
            <span className="text-xs text-on-surface-variant font-label">
              {t('gallery.pageOf', {
                defaultValue: 'Page {{current}} of {{total}}',
                current: safePage,
                total: totalPages,
              })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('gallery.next', 'Next')}
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </Button>
          </div>
        </>
      )}

      {showEmpty && !loading && (
        <GalleryEmptyState backendReady={backendReady} fetchError={fetchError} />
      )}

      {selected && (
        <CampaignDetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          onPlayFromStart={handlePlayFromStart}
          resolveImage={resolveImage}
          onRepairSceneImage={repairReplaySceneImage}
        />
      )}
    </div>
  );
}
