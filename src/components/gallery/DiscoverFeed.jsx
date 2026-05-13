import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { GENRES, TONES } from './galleryHelpers';
import MasonryGrid from './MasonryGrid';
import SceneTile from './SceneTile';

/**
 * Assigns a visual size to each tile in the gallery grid.
 * Uses a repeating pattern + likeCount boost so some tiles
 * are larger (wide = 2 cols, tall = 2 rows). ~25% of tiles
 * are featured for visual variety without chaos.
 */
function assignTileSizes(scenes) {
  return scenes.map((scene, i) => {
    if (scene.likeCount >= 3 && i % 4 === 0) return 'tall';
    const pos = i % 11;
    if (pos === 0) return 'tall';
    if (pos === 4) return 'wide';
    if (pos === 8) return 'tall';
    return 'normal';
  });
}

export default function DiscoverFeed({ onOpenLightbox, resolveImage }) {
  const { t } = useTranslation();
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [sort, setSort] = useState('newest');
  const [genre, setGenre] = useState('');
  const [tone, setTone] = useState('');
  const sentinelRef = useRef(null);

  const fetchPage = useCallback(async (cursor, append) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('limit', '20');
      if (cursor) qs.set('cursor', cursor);
      if (sort !== 'newest') qs.set('sort', sort);
      if (genre) qs.set('genre', genre);
      if (tone) qs.set('tone', tone);
      const data = await apiClient.get(`/gallery/feed?${qs}`);
      if (append) {
        setScenes((prev) => [...prev, ...(data.scenes || [])]);
      } else {
        setScenes(data.scenes || []);
      }
      setNextCursor(data.nextCursor || null);
    } catch {
      if (!append) setScenes([]);
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [sort, genre, tone]);

  useEffect(() => {
    fetchPage(null, false);
  }, [fetchPage]);

  const tileSizes = useMemo(() => assignTileSizes(scenes), [scenes]);

  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && nextCursor && !loadingMore) {
          fetchPage(nextCursor, true);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchPage]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.genre')}</span>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t('gallery.allGenres')}</option>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.tone')}</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t('gallery.allTones')}</option>
            {TONES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.sortBy')}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="newest">{t('gallery.sortNewest')}</option>
            <option value="popular">{t('gallery.sortPopular', 'Popular')}</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <span className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && scenes.length === 0 && (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-5xl text-outline/30 mb-3 block">image_not_supported</span>
          <p className="text-on-surface-variant text-sm">{t('gallery.noSceneImages', 'No scene images found yet.')}</p>
        </div>
      )}

      {!loading && scenes.length > 0 && (
        <MasonryGrid>
          {scenes.map((scene, i) => (
            <SceneTile
              key={scene.id}
              scene={scene}
              size={tileSizes[i] || 'normal'}
              onOpenLightbox={onOpenLightbox}
              resolveImage={resolveImage}
            />
          ))}
        </MasonryGrid>
      )}

      {loadingMore && (
        <div className="flex justify-center py-8">
          <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
