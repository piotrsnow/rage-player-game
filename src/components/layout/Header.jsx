import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { useModals } from '../../contexts/ModalContext';
import { useDictationContext } from '../../contexts/DictationContext';
import { useGameCampaign } from '../../stores/gameSelectors';
import { getGameState } from '../../stores/gameStore';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { storage } from '../../services/storage';
import { peekEntryIntent, consumeEntryIntent } from '../../services/entryIntent';
import Tooltip from '../ui/Tooltip';
import FullCallLogModal from './FullCallLogModal';
import AiCallLogModal from './AiCallLogModal';
import { APP_VERSION } from '../../version';

function HeaderVersionPopover({ wrapperClassName = '', wrapperStyle }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`relative flex items-center shrink-0 justify-center ${wrapperClassName}`.trim()}
      style={wrapperStyle}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="text-on-surface-variant font-body text-[15px] hover:text-tertiary transition-colors px-1 tabular-nums"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        v{APP_VERSION}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] z-[60] bg-surface-container border border-outline-variant/20 rounded-sm shadow-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-base">info</span>
            <span className="text-xs font-bold text-on-surface tracking-wide">{t('common.appName')}</span>
          </div>
          <div className="space-y-1.5 text-[11px] text-on-surface-variant">
            <div className="flex justify-between">
              <span className="opacity-60">Wersja</span>
              <span className="font-mono font-bold text-primary">{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Stack</span>
              <span>React + Fastify</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">System</span>
              <span>WFRP 4e</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Flat “control rail” look — no hatch; aside keeps diagonal stripes. */
const HEADER_CHROME_STYLE = {
  background: 'rgba(14, 14, 16, 0.82)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5)',
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entryRoute, setEntryRoute] = useState(() => peekEntryIntent());
  const { settings, updateSettings, backendUser } = useSettings();
  const music = useGlobalMusic();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys, openImageConfig, openAudioConfig, openProfile, openAdminUsers, openLocationGraph, openGmModal, openPrivacy } = useModals();
  const { dictation } = useDictationContext() ?? {};
  const campaign = useGameCampaign();
  const aiLogSidebarVisible = useAiCallLogStore((s) => s.sidebarVisible);
  const aiFullLogOpen = useAiCallLogStore((s) => s.fullLogOpen);
  const aiLogs = useAiCallLogStore((s) => s.logs);
  const aiBackendLogs = useAiCallLogStore((s) => s.backendLogs);
  const toggleAiSidebar = useAiCallLogStore((s) => s.toggleSidebarVisible);
  const openAiFullLog = useAiCallLogStore((s) => s.openFullLog);
  const closeAiFullLog = useAiCallLogStore((s) => s.closeFullLog);
  const mp = useMultiplayer();
  const hasActiveGame = !!campaign || (mp.state.isMultiplayer && mp.state.phase === 'playing');
  const showMpStatus = mp.state.isMultiplayer;
  const mpReconnectState = mp.state.reconnectState || { status: 'disconnected' };
  const mpStatusLabel = !mp.state.connected
    ? (mpReconnectState.status === 'reconnecting' ? 'Reconnecting' : 'Disconnected')
    : 'Connected';
  const mpStatusClass = !mp.state.connected
    ? 'text-error border-error/30'
    : 'text-primary border-primary/30';

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const campaignLogoSrc = t('common.logoPathCampaign', '/nikczemny_logo_chain_2.png');
  const campaignLogoMaskStyle = {
    WebkitMaskImage: `url(${campaignLogoSrc})`,
    maskImage: `url(${campaignLogoSrc})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'bottom',
    maskPosition: 'bottom',
  };
  const headerRef = useRef(null);
  const playLogoLinkRef = useRef(null);
  const [campaignLogoCenterX, setCampaignLogoCenterX] = useState(null);
  const [logoHoverVignette, setLogoHoverVignette] = useState(null);
  const updatePlayLogoVignette = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const el = playLogoLinkRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setLogoHoverVignette({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  }, []);
  const clearPlayLogoVignette = useCallback(() => setLogoHoverVignette(null), []);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const preMuteVolumesRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimeoutRef = useRef(null);

  const aiMergedLogs = useMemo(() => {
    const clientIds = new Set(aiLogs.map((l) => l.id));
    const combined = [...aiLogs];
    for (const bl of aiBackendLogs) {
      if (!clientIds.has(bl.id)) combined.push(bl);
    }
    combined.sort((a, b) => b.startedAt - a.startedAt);
    return combined.slice(0, 100);
  }, [aiLogs, aiBackendLogs]);
  const aiPendingCount = useMemo(() => aiLogs.filter((l) => l.status === 'pending').length, [aiLogs]);
  const [aiDetailId, setAiDetailId] = useState(null);
  const aiDetailEntry = useMemo(() => aiMergedLogs.find((l) => l.id === aiDetailId) || null, [aiMergedLogs, aiDetailId]);

  const handleSaveCampaign = useCallback(async () => {
    const snapshot = getGameState();
    if (saveStatus === 'saving' || !snapshot.campaign) return;
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    try {
      await storage.saveCampaign(snapshot);
      setSaveStatus('saved');
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[Header] Manual save error:', err);
      setSaveStatus('idle');
    }
  }, [saveStatus]);

  useEffect(() => {
    const handleClick = (e) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const playPath = `/play/${campaign?.id || ''}`;
  const navLinks = [
    { path: '/', label: t('nav.lobby'), icon: 'home' },
    { path: '/character', label: t('nav.characterSheet'), icon: 'backpack', action: openCharacterSheet },
    hasActiveGame && { path: '/tasks-info', label: t('nav.tasksInfo'), icon: 'assignment', action: openTasksInfo },
  ].filter(Boolean);

  const vol = settings.musicVolume ?? 40;
  const dlgVol = settings.dialogueVolume ?? 80;
  const maxVol = Math.max(vol, dlgVol);
  const volumeIcon = isMuted ? 'volume_off' : maxVol === 0 ? 'volume_off' : maxVol < 40 ? 'volume_down' : 'volume_up';
  const isPlayRoute = location.pathname.startsWith('/play');

  useEffect(() => {
    if (!isPlayRoute) setLogoHoverVignette(null);
  }, [isPlayRoute]);

  const updateCampaignLogoCenter = useCallback(() => {
    if (!isPlayRoute) {
      setCampaignLogoCenterX(null);
      return;
    }
    const linkEl = playLogoLinkRef.current;
    const headerEl = headerRef.current;
    if (!linkEl || !headerEl) return;
    const lr = linkEl.getBoundingClientRect();
    const hr = headerEl.getBoundingClientRect();
    const cx = lr.left - hr.left + lr.width / 2;
    setCampaignLogoCenterX(cx);
  }, [isPlayRoute]);

  useLayoutEffect(() => {
    updateCampaignLogoCenter();
  }, [updateCampaignLogoCenter, campaignLogoSrc]);

  useEffect(() => {
    if (!isPlayRoute) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateCampaignLogoCenter()) : null;
    const linkEl = playLogoLinkRef.current;
    if (ro && linkEl) ro.observe(linkEl);
    window.addEventListener('resize', updateCampaignLogoCenter);
    return () => {
      window.removeEventListener('resize', updateCampaignLogoCenter);
      if (ro && linkEl) ro.unobserve(linkEl);
    };
  }, [isPlayRoute, updateCampaignLogoCenter]);

  const appZoom = settings.appZoom ?? 100;
  const canZoomIn = appZoom < 140;
  const canZoomOut = appZoom > 80;

  const handleAppZoomClick = useCallback(() => {
    if (!canZoomIn) return;
    updateSettings({ appZoom: Math.min(140, appZoom + 10) });
  }, [appZoom, canZoomIn, updateSettings]);

  const handleAppZoomContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      if (!canZoomOut) return;
      updateSettings({ appZoom: Math.max(80, appZoom - 10) });
    },
    [appZoom, canZoomOut, updateSettings]
  );

  return (
    <>
    <header
      ref={headerRef}
      className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 backdrop-blur-md border-b border-primary/[0.12] overflow-visible"
      style={HEADER_CHROME_STYLE}
    >
      {isPlayRoute && (
        <Tooltip content={t('nav.lobby')} placement="bottom" variant="compact" asChild>
          <Link
            ref={playLogoLinkRef}
            to="/"
            onMouseEnter={updatePlayLogoVignette}
            onMouseLeave={clearPlayLogoVignette}
            onFocus={updatePlayLogoVignette}
            onBlur={clearPlayLogoVignette}
            className="absolute left-6 bottom-0 z-[51] block leading-none translate-x-[10px] translate-y-[120px] transition-opacity duration-300"
          >
            <span className="relative inline-block origin-top leading-none motion-reduce:animate-none animate-campaign-logo-float will-change-transform">
              <img
                src={campaignLogoSrc}
                alt={t('common.appName')}
                onLoad={updateCampaignLogoCenter}
                className="relative z-0 block h-[12rem] w-auto max-w-[min(62vw,44rem)] object-contain object-bottom select-none pointer-events-auto brightness-[0.9] contrast-[1.22]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1] motion-reduce:animate-none animate-campaign-logo-holo bg-[length:400%_400%] opacity-[0.92] mix-blend-color"
                style={{
                  ...campaignLogoMaskStyle,
                  willChange: 'filter, background-position',
                  backgroundImage:
                    'linear-gradient(128deg, #12081f 0%, #2a0a28 10%, #1a0f3d 22%, #351848 34%, #0f2438 46%, #2a1548 58%, #3a1030 70%, #1a1530 82%, #22102a 100%)',
                }}
              />
            </span>
          </Link>
        </Tooltip>
      )}
      {logoHoverVignette &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-hidden
            className="fixed inset-0 z-[49] pointer-events-none motion-reduce:hidden bg-transparent transition-opacity duration-300 ease-out"
            style={{
              background: `radial-gradient(ellipse min(52vmin, 64vw) min(44vmin, 56vh) at ${logoHoverVignette.cx}px ${logoHoverVignette.cy}px,
                rgba(0,0,0,0.88) 0%,
                rgba(0,0,0,0.72) 18%,
                rgba(0,0,0,0.42) 38%,
                rgba(0,0,0,0.16) 58%,
                rgba(0,0,0,0) 78%,
                rgba(0,0,0,0) 100%)`,
            }}
          />,
          document.body,
        )}
      {isPlayRoute && campaignLogoCenterX != null && (
        <HeaderVersionPopover
          wrapperClassName="absolute top-0 z-[52] h-16 pointer-events-auto -translate-x-1/2"
          wrapperStyle={{ left: `${campaignLogoCenterX - 26}px` }}
        />
      )}
      <div
        className={`flex gap-2 min-w-0 items-center min-h-16 ${
          isPlayRoute ? 'pl-[max(13rem,min(34rem,calc(46vw+7rem)))] ml-3 md:ml-5' : ''
        }`}
      >
        {!isPlayRoute && (
          <Tooltip content={t('nav.lobby')} placement="bottom" variant="compact" asChild>
            <Link
              to="/"
              className="flex items-center gap-2 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(197,154,255,0.5)]"
            >
              <img
                src={t('common.logoPath', '/nikczemnu_logo.png')}
                alt={t('common.appName')}
                className="h-10 w-auto"
              />
            </Link>
          </Tooltip>
        )}
        {!isPlayRoute && <HeaderVersionPopover />}
        {!backendUser && (
          <Tooltip content={t('privacy.linkLabel')} placement="bottom" variant="compact" asChild>
            <button
              type="button"
              onClick={openPrivacy}
              aria-label={t('privacy.linkLabel')}
              className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
            >
              privacy_tip
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-6">
        {backendUser && (
          <nav className="hidden md:flex gap-1 items-center text-on-surface-variant font-body text-[15px] lowercase">
            {navLinks.map((link) =>
              link.action ? (
                <button
                  key={link.path}
                  onClick={link.action}
                  className="relative flex items-center gap-1.5 px-4 py-2 transition-colors duration-300 hover:text-tertiary rounded-sm hover:bg-surface-container-high/30"
                >
                  <span className="material-symbols-outlined text-base text-tertiary/60">{link.icon}</span>
                  <span>{link.label.toLowerCase()}</span>
                </button>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`relative flex items-center gap-1.5 px-4 py-2 transition-all duration-300 rounded-sm ${
                    location.pathname === link.path
                      ? 'text-primary'
                      : 'hover:text-tertiary hover:bg-surface-container-high/30'
                  }`}
                >
                  <span className={`material-symbols-outlined text-base ${location.pathname === link.path ? 'text-primary/70' : 'text-tertiary/60'}`}>{link.icon}</span>
                  <span>{link.label.toLowerCase()}</span>
                </Link>
              )
            )}
          </nav>
        )}

        {entryRoute && (
          <button
            type="button"
            onClick={() => {
              const route = consumeEntryIntent();
              setEntryRoute(null);
              if (route) navigate(route);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-label lowercase rounded-sm border border-primary/40 text-primary animate-pulse hover:bg-primary/10 transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-base">play_arrow</span>
            Przejdź do kampanii
          </button>
        )}

        {settings.localMusicEnabled && music.hasMusic && (
          <div className="flex items-center gap-2">
            <Tooltip content={music.isPlaying ? t('common.pause', 'Pause') : t('common.play', 'Play')} placement="bottom" variant="compact" asChild>
              <button
                onClick={music.togglePlayPause}
                className="material-symbols-outlined text-lg text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                {music.isPlaying ? 'pause' : 'play_arrow'}
              </button>
            </Tooltip>
            <Tooltip content={t('gameplay.musicSkip', 'Next')} placement="bottom" variant="compact" asChild>
              <button
                onClick={music.skip}
                className="material-symbols-outlined text-base text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                skip_next
              </button>
            </Tooltip>
            <div className="relative" ref={volumeRef}>
              <Tooltip content={t('settings.musicVolume', 'Volume')} placement="bottom" variant="compact" asChild>
                <button
                  onClick={() => setVolumeOpen((v) => !v)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isMuted) {
                      preMuteVolumesRef.current = { musicVolume: vol, dialogueVolume: dlgVol, sfxVolume: settings.sfxVolume ?? 70 };
                      updateSettings({ musicVolume: 0, dialogueVolume: 0, sfxVolume: 0 });
                      music.setVolume(0);
                      setIsMuted(true);
                    } else {
                      const saved = preMuteVolumesRef.current || {};
                      const restored = {
                        musicVolume: saved.musicVolume || 25,
                        dialogueVolume: saved.dialogueVolume || 25,
                        sfxVolume: saved.sfxVolume || 25,
                      };
                      updateSettings(restored);
                      music.setVolume(restored.musicVolume);
                      setIsMuted(false);
                      preMuteVolumesRef.current = null;
                    }
                  }}
                  className="material-symbols-outlined text-base text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                >
                  {volumeIcon}
                </button>
              </Tooltip>
              {volumeOpen && (
                <div className="absolute right-0 top-full mt-2 px-3 py-2.5 rounded-sm bg-surface-container-high/95 backdrop-blur-xl border border-outline-variant/15 shadow-xl space-y-2 animate-scale-in w-52">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-on-surface-variant/70 shrink-0">music_note</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={vol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        music.setVolume(v);
                        if (isMuted && v > 0) { setIsMuted(false); preMuteVolumesRef.current = null; }
                      }}
                      className="flex-1 h-1 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] text-on-surface-variant font-mono w-7 text-right">{vol}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-on-surface-variant/70 shrink-0">record_voice_over</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={dlgVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateSettings({ dialogueVolume: v });
                        if (isMuted && v > 0) { setIsMuted(false); preMuteVolumesRef.current = null; }
                      }}
                      className="flex-1 h-1 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] text-on-surface-variant font-mono w-7 text-right">{dlgVol}%</span>
                  </div>
                </div>
              )}
            </div>
            {music.currentTrack && (
              <span className="hidden lg:block text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 truncate max-w-[120px]">
                {music.currentTrack.name}
              </span>
            )}
          </div>
        )}

        {backendUser && (
          <div className="flex items-center gap-1">
            {showMpStatus && (
              <span className={`hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border ${mpStatusClass}`}>
                <span className="material-symbols-outlined text-sm">{mp.state.connected ? 'wifi' : 'wifi_off'}</span>
                {mpStatusLabel}
              </span>
            )}
            {dictation?.supported && (
              <Tooltip content={t(dictation.enabled ? 'gameplay.dictationDisable' : 'gameplay.dictationEnable')} placement="bottom" variant="compact" asChild>
                <button
                  type="button"
                  onClick={dictation.toggleEnabled}
                  aria-label={t(dictation.enabled ? 'gameplay.dictationDisable' : 'gameplay.dictationEnable')}
                  className={`material-symbols-outlined transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40 ${
                    dictation.enabled ? 'text-primary hover:text-tertiary' : 'text-on-surface-variant hover:text-tertiary'
                  }`}
                >
                  {dictation.enabled ? 'mic' : 'mic_off'}
                </button>
              </Tooltip>
            )}
            {hasActiveGame && !isMultiplayer && (
              <Tooltip content={saveStatus === 'saved' ? t('nav.campaignSaved') : t('nav.saveCampaign')} placement="bottom" variant="compact" asChild>
                <button
                  type="button"
                  onClick={handleSaveCampaign}
                  disabled={saveStatus === 'saving'}
                  aria-label={t('nav.saveCampaign')}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-95 duration-200 ${
                    saveStatus === 'saved'
                      ? 'text-primary bg-primary/15'
                      : 'text-on-surface-variant hover:text-tertiary hover:bg-surface-container-high/40'
                  }`}
                >
                  <span className={`material-symbols-outlined text-lg ${saveStatus === 'saving' ? 'animate-spin' : ''}`}>
                    {saveStatus === 'saving' ? 'progress_activity' : saveStatus === 'saved' ? 'check_circle' : 'save'}
                  </span>
                </button>
              </Tooltip>
            )}
            {hasActiveGame && (
              <Tooltip content={t('nav.locationGraph')} placement="bottom" variant="compact" asChild>
                <button
                  type="button"
                  onClick={openLocationGraph}
                  aria-label={t('nav.locationGraph')}
                  className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                >
                  hub
                </button>
              </Tooltip>
            )}
            {hasActiveGame && (
              <Tooltip content={t('nav.grimoire')} placement="bottom" variant="compact" asChild>
                <Link
                  to={playPath}
                  aria-label={t('nav.play')}
                  className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                >
                  auto_awesome
                </Link>
              </Tooltip>
            )}
            <Tooltip content={t('nav.gallery')} placement="bottom" variant="compact" asChild>
              <Link
                to="/gallery"
                aria-label={t('nav.gallery')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                photo_library
              </Link>
            </Tooltip>
            <Tooltip content={t('nav.imageConfig')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openImageConfig}
                aria-label={t('nav.imageConfig')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                brush
              </button>
            </Tooltip>
            <Tooltip content={t('nav.audioConfig')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openAudioConfig}
                aria-label={t('nav.audioConfig')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                graphic_eq
              </button>
            </Tooltip>
            <Tooltip content={t('nav.keys')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openKeys}
                aria-label={t('nav.keys')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                vpn_key
              </button>
            </Tooltip>
            {backendUser?.isAdmin && (
              <>
                <Tooltip content={t('admin.livingWorld')} placement="bottom" variant="compact" asChild>
                  <button
                    type="button"
                    onClick={openGmModal}
                    aria-label={t('admin.livingWorld')}
                    className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                  >
                    auto_stories
                  </button>
                </Tooltip>
                <Tooltip content={t('admin.userManagement')} placement="bottom" variant="compact" asChild>
                  <button
                    type="button"
                    onClick={openAdminUsers}
                    aria-label={t('admin.userManagement')}
                    className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                  >
                    admin_panel_settings
                  </button>
                </Tooltip>
              </>
            )}
            <Tooltip content="LLM Calls" placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openAiFullLog}
                onContextMenu={(e) => { e.preventDefault(); toggleAiSidebar(); }}
                aria-label="LLM Calls"
                className={`relative material-symbols-outlined transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40 ${
                  aiLogSidebarVisible ? 'text-primary' : 'text-on-surface-variant hover:text-tertiary'
                }`}
              >
                terminal
                {aiPendingCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                )}
              </button>
            </Tooltip>
            <Tooltip content={t('nav.appZoomTooltip', { percent: appZoom })} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={handleAppZoomClick}
                onContextMenu={handleAppZoomContextMenu}
                aria-label={t('nav.appZoomAria', { percent: appZoom })}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                search
              </button>
            </Tooltip>
            <Tooltip content={t('nav.settings')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openSettings}
                aria-label={t('nav.settings')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                settings
              </button>
            </Tooltip>
            <Tooltip content={t('privacy.linkLabel')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openPrivacy}
                aria-label={t('privacy.linkLabel')}
                className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                privacy_tip
              </button>
            </Tooltip>
            <Tooltip content={(backendUser.credits ?? 0) < 0 ? t('credits.negativeBalance') : t('credits.title', 'Credits')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openProfile}
                aria-label={t('nav.credits', 'Credits')}
                className={`flex items-center gap-1 px-2.5 h-9 rounded-full border text-xs font-label transition-all duration-300 ${
                  (backendUser.credits ?? 0) < 0
                    ? 'border-error/40 bg-error/10 text-error hover:border-error/60 animate-pulse'
                    : 'border-primary/20 bg-surface-container-high text-primary hover:border-primary/40 hover:shadow-[0_0_12px_rgba(197,154,255,0.2)]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">payments</span>
                <span>${((backendUser.credits ?? 0) / 100).toFixed(2)}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('nav.profile')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openProfile}
                aria-label={t('nav.profile')}
                className="w-9 h-9 rounded-full border border-primary/20 overflow-hidden bg-surface-container-high flex items-center justify-center hover:border-primary/40 hover:shadow-[0_0_12px_rgba(197,154,255,0.2)] transition-all duration-300"
              >
                <span className="material-symbols-outlined text-primary text-sm">person</span>
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </header>
    {aiFullLogOpen && (
      <FullCallLogModal logs={aiMergedLogs} onClose={closeAiFullLog} onOpenEntry={setAiDetailId} />
    )}
    {aiDetailEntry && (
      <AiCallLogModal entry={aiDetailEntry} onClose={() => setAiDetailId(null)} />
    )}
    </>
  );
}
