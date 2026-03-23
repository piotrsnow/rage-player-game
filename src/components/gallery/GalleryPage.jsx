import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { storage } from '../../services/storage';
import { createCampaignId, createSceneId, getCampaignSummary } from '../../services/gameState';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';

const PAGE_SIZE = 9;

const GENRES = ['Fantasy', 'Sci-Fi', 'Horror'];
const TONES = ['Dark', 'Epic', 'Humorous'];
const SORT_OPTIONS = [
  { value: 'newest', key: 'gallery.sortNewest' },
  { value: 'rating', key: 'gallery.sortRating' },
  { value: 'plays', key: 'gallery.sortPlays' },
];

const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

const genreBorderColors = {
  Fantasy: 'border-l-primary-dim',
  'Sci-Fi': 'border-l-blue-400',
  Horror: 'border-l-error',
};

function excerpt(text, max = 200) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function normalizePublicListResponse(json) {
  if (Array.isArray(json)) {
    return { list: json, total: json.length };
  }
  const list = json?.campaigns ?? json?.items ?? json?.data ?? [];
  const total = json?.total ?? list.length;
  return {
    list,
    total,
    page: json?.page,
    pageSize: json?.pageSize,
  };
}

/** Build a display + optional full gameState from one API row. */
function rowToGalleryEntry(row) {
  const parsedData =
    row.data && typeof row.data === 'string'
      ? (() => {
          try {
            return JSON.parse(row.data);
          } catch {
            return null;
          }
        })()
      : row.data;

  if (parsedData && typeof parsedData === 'object' && parsedData.campaign) {
    const gs = parsedData;
    const summary = getCampaignSummary(gs);
    return {
      id: row.id || gs.campaign?.id,
      name: row.name || summary.name,
      genre: row.genre || summary.genre,
      tone: row.tone || summary.tone,
      sceneCount: summary.sceneCount,
      createdAt: row.createdAt || gs.lastSaved || Date.now(),
      description: excerpt(gs.campaign?.worldDescription || gs.campaign?.hook || ''),
      rating: Number(row.rating ?? row.avgRating ?? 0) || 0,
      playCount: Number(row.playCount ?? row.plays ?? 0) || 0,
      gameState: gs,
    };
  }

  return {
    id: row.id,
    name: row.name || 'Untitled',
    genre: row.genre || 'Fantasy',
    tone: row.tone || 'Dark',
    sceneCount: Number(row.sceneCount ?? row.scenesCount ?? 0) || 0,
    createdAt: row.createdAt || row.created_at || Date.now(),
    description: excerpt(row.description || row.worldSummary || row.summary || ''),
    rating: Number(row.rating ?? row.avgRating ?? 0) || 0,
    playCount: Number(row.playCount ?? row.plays ?? 0) || 0,
    gameState: row.gameState || row.snapshot || null,
  };
}

function forkPlayFromStart(sourceState) {
  const newCampaignId = createCampaignId();
  const first = sourceState.scenes?.[0];
  const newScenes = first
    ? [
        {
          ...first,
          id: createSceneId(),
          timestamp: Date.now(),
          chosenAction: null,
        },
      ]
    : [];

  const newChat =
    first && (first.narrative || (first.dialogueSegments && first.dialogueSegments.length))
      ? [
          {
            id: `msg_${Date.now()}_dm`,
            role: 'dm',
            content: first.narrative || '',
            dialogueSegments: first.dialogueSegments || [],
            soundEffect: first.soundEffect ?? null,
            timestamp: Date.now(),
          },
        ]
      : [];

  return {
    ...sourceState,
    campaign: {
      ...sourceState.campaign,
      id: newCampaignId,
      backendId: undefined,
    },
    scenes: newScenes,
    chatHistory: newChat,
    quests: { active: [], completed: [] },
    undoStack: [],
    lastSaved: Date.now(),
    aiCosts: {
      total: 0,
      breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 },
      history: [],
    },
  };
}

const iconFill = { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" };
const iconOutline = { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" };

function StarRow({ rating, max = 5, className = '' }) {
  const full = Math.floor(Math.min(rating, max));
  const half = rating - full >= 0.5 && full < max;
  const empty = max - full - (half ? 1 : 0);
  return (
    <div className={`flex items-center gap-0.5 text-primary ${className}`} aria-label={`${rating} / ${max}`}>
      {Array.from({ length: full }, (_, i) => (
        <span key={`f-${i}`} className="material-symbols-outlined text-[18px]" style={iconFill}>
          star
        </span>
      ))}
      {half && (
        <span className="material-symbols-outlined text-[18px] text-primary" style={iconFill}>
          star_half
        </span>
      )}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e-${i}`} className="material-symbols-outlined text-[18px] text-outline-variant" style={iconOutline}>
          star
        </span>
      ))}
    </div>
  );
}

function GalleryCampaignCard({ entry, onOpen, onView }) {
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

function CampaignDetailModal({ entry, onClose, onPlayFromStart, resolveImage }) {
  const { t, i18n } = useTranslation();
  const gs = entry.gameState;
  const summary = gs ? getCampaignSummary(gs) : null;
  const scenes = gs?.scenes || [];
  const character = gs?.character ?? gs?.characters?.[0];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const created = new Date(entry.createdAt).toLocaleString(i18n.language === 'pl' ? 'pl-PL' : undefined);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-panel-elevated max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col rounded-sm border border-outline-variant/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-outline-variant/20 shrink-0">
          <div className="min-w-0">
            <h2 id="gallery-modal-title" className="font-headline text-xl text-on-surface truncate">
              {entry.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-surface-container text-primary text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.genre}
              </span>
              <span className="px-2 py-0.5 bg-surface-container text-tertiary-dim text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.tone}
              </span>
              <StarRow rating={entry.rating} className="ml-1" />
              <span className="text-[10px] text-on-surface-variant">
                {entry.playCount} {t('gallery.plays', 'plays')}
              </span>
            </div>
            <p className="text-[10px] text-outline mt-1">{t('gallery.created', 'Created')}: {created}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface p-1 rounded-sm hover:bg-surface-container-high/80"
            aria-label={t('common.close', 'Close')}
          >
            close
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          <section>
            <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">public</span>
              {t('gallery.worldSummary', 'World summary')}
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
              {gs?.campaign?.worldDescription ||
                gs?.campaign?.hook ||
                entry.description ||
                t('gallery.noSummary', 'No summary available.')}
            </p>
          </section>

          {character && (
            <section>
              <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-base">person</span>
                {t('gallery.featuredCharacter', 'Featured character')}
              </h3>
              <div className="bg-surface-container rounded-sm border border-outline-variant/20 p-4 text-sm text-on-surface-variant">
                <p className="font-headline text-on-surface">
                  {character.name}
                  <span className="text-on-surface-variant font-normal text-xs ml-2">
                    {character.species} · {character.career?.name || summary?.characterCareer}
                    {character.career?.tier != null && (
                      <>
                        {' '}
                        ({t('common.tier')} {character.career.tier})
                      </>
                    )}
                  </span>
                </p>
                {character.backstory ? (
                  <p className="mt-2 text-xs leading-relaxed line-clamp-6">{character.backstory}</p>
                ) : null}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">history_edu</span>
              {t('gallery.sceneReplay', 'Scene replay')}
            </h3>
            {scenes.length === 0 ? (
              <p className="text-xs text-on-surface-variant italic">{t('gallery.noScenesReplay', 'No scenes to replay for this listing.')}</p>
            ) : (
              <div className="space-y-6 max-h-[320px] overflow-y-auto pr-1 border border-outline-variant/15 rounded-sm bg-surface-dim/50 p-4">
                {scenes.map((scene, idx) => {
                  const img = scene.image ? resolveImage(scene.image) : null;
                  return (
                    <article key={scene.id || idx} className="border-b border-outline-variant/10 pb-6 last:border-0 last:pb-0">
                      <p className="text-[10px] text-outline uppercase tracking-wider mb-2">
                        {t('common.scene')} {idx + 1}
                      </p>
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          className="w-full max-h-48 object-cover rounded-sm border border-outline-variant/20 mb-3"
                        />
                      ) : null}
                      <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                        {scene.narrative ||
                          (scene.dialogueSegments || [])
                            .map((seg) => (seg.type === 'dialogue' ? `“${seg.text}” — ${seg.character}` : seg.text))
                            .join('\n\n')}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="p-5 border-t border-outline-variant/20 flex flex-wrap gap-3 justify-end shrink-0 bg-surface-container-low/40">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          <Button
            disabled={!gs}
            onClick={() => gs && onPlayFromStart(gs)}
            title={!gs ? t('gallery.playDisabledHint', 'Full game data required') : undefined}
          >
            {t('gallery.playFromStart', 'Play from start')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
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
    (gameState) => {
      const forked = forkPlayFromStart(gameState);
      storage.saveCampaign(forked);
      dispatch({ type: 'LOAD_CAMPAIGN', payload: forked });
      setSelected(null);
      navigate('/play');
    },
    [dispatch, navigate],
  );

  const showEmpty =
    !backendReady || fetchError || (!loading && filteredSorted.length === 0);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 sm:px-6 lg:px-10 py-8 relative">
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 left-0 w-[400px] h-[400px] bg-tertiary/[0.04] rounded-full blur-[90px] pointer-events-none" />

      <header className="relative z-10 max-w-7xl mx-auto mb-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-3xl">grid_view</span>
              <h1 className="font-headline text-3xl md:text-4xl text-on-surface tracking-tight">
                {t('gallery.title', 'Campaign Gallery')}
              </h1>
            </div>
            <p className="text-on-surface-variant text-sm max-w-xl">
              {t('gallery.subtitle', 'Browse community campaigns — like a workshop library for your next WFRP tale.')}
            </p>
          </div>

          <div className="w-full lg:max-w-md">
            <label className="sr-only" htmlFor="gallery-search">
              {t('gallery.search', 'Search')}
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl">
                search
              </span>
              <input
                id="gallery-search"
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('gallery.searchPlaceholder', 'Search campaigns…')}
                className="w-full pl-11 pr-4 py-3 rounded-sm bg-surface-container border border-outline-variant/30 text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-8 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.genre', 'Genre')}</span>
            <select
              value={genreFilter}
              onChange={(e) => {
                setGenreFilter(e.target.value);
                setPage(1);
              }}
              className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">{t('gallery.allGenres', 'All genres')}</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.tone', 'Tone')}</span>
            <select
              value={toneFilter}
              onChange={(e) => {
                setToneFilter(e.target.value);
                setPage(1);
              }}
              className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">{t('gallery.allTones', 'All tones')}</option>
              {TONES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] uppercase tracking-widest text-outline">{t('gallery.sortBy', 'Sort by')}</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="bg-surface-container border border-outline-variant/30 text-on-surface text-xs rounded-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.key, o.value === 'newest' ? 'Newest' : o.value === 'rating' ? 'Rating' : 'Most played')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-20 relative z-10">
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
        <div className="relative z-10 max-w-lg mx-auto text-center py-16 px-6">
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
      )}

      {selected && (
        <CampaignDetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          onPlayFromStart={handlePlayFromStart}
          resolveImage={resolveImage}
        />
      )}
    </div>
  );
}
