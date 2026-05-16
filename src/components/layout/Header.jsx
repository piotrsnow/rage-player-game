import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, Children } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { useModals } from '../../contexts/ModalContext';
import { useDictationContext } from '../../contexts/DictationContext';
import { useGameCampaign } from '../../stores/gameSelectors';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import { useDevEventLogStore } from '../../stores/devEventLogStore';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { peekEntryIntent, consumeEntryIntent } from '../../services/entryIntent';
import Tooltip from '../ui/Tooltip';
import FullCallLogModal from './FullCallLogModal';
import AiCallLogModal from './AiCallLogModal';
import { APP_VERSION } from '../../version';

const MOMENTUM_FRICTION = 0.96;
const MOMENTUM_GAIN_X = 0.007;
const MOMENTUM_GAIN_Y = 0.74;
const DICE_ROTATION_FACTOR = 0.8;
const DICE_MIN_PLAYBACK = 0.4;
const DICE_MAX_PLAYBACK = 4.0;
const DICE_SPEED_FOR_MAX = 18;

function HeaderDice({ className, ariaLabel }) {
  const ref = useRef(null);
  const momentum = useRef({ spin: 0, play: 0, rotation: 0, prevX: null, prevY: null });
  const raf = useRef(null);

  useEffect(() => {
    const m = momentum.current;
    const onMove = (e) => {
      if (m.prevX !== null) {
        m.spin += Math.abs(e.clientX - m.prevX) * MOMENTUM_GAIN_X;
        m.play += Math.abs(e.clientY - m.prevY) * MOMENTUM_GAIN_Y;
      }
      m.prevX = e.clientX;
      m.prevY = e.clientY;
    };

    const tick = () => {
      m.spin *= MOMENTUM_FRICTION;
      m.play *= MOMENTUM_FRICTION;
      m.rotation += m.spin * DICE_ROTATION_FACTOR;

      const el = ref.current;
      if (el) {
        el.style.transformOrigin = 'calc(49%) calc(48%)';
        el.style.transform = `rotate(${m.rotation}deg)`;
        const t = Math.min(m.play / DICE_SPEED_FOR_MAX, 1);
        el.playbackRate = DICE_MIN_PLAYBACK + t * (DICE_MAX_PLAYBACK - DICE_MIN_PLAYBACK);
      }
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <video
      ref={ref}
      src="/video/dice.webm"
      className={className}
      autoPlay
      loop
      muted
      playsInline
      aria-label={ariaLabel}
    />
  );
}

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
        className="text-on-surface-variant font-headline text-[15px] hover:text-tertiary transition-colors px-1 tabular-nums"
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

function ZigzagDivider() {
  return (
    <svg width="6" height="28" viewBox="0 0 6 28" className="shrink-0 text-on-surface-variant/20 mx-3" aria-hidden>
      <path d="M3 0 L6 3.5 L0 7 L6 10.5 L0 14 L6 17.5 L0 21 L6 24.5 L3 28" fill="none" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

function GroupItem({ icon, label, onClick, to, active, badge, ...rest }) {
  const cls = `relative material-symbols-outlined text-[26px] transition-all active:scale-95 duration-150 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40 ${
    active ? 'text-[#ddbcff] bg-surface-container-high/20' : 'text-[#ffd4e6] hover:text-[#e0c4ff]'
  }`;
  const inner = (
    <>
      {icon}
      {badge && <span className="absolute -top-0.5 -right-0.5 pointer-events-none">{badge}</span>}
    </>
  );
  if (to) {
    return (
      <Tooltip content={label} placement="bottom" variant="compact" asChild>
        <Link to={to} className={cls} aria-label={label} {...rest}>{inner}</Link>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label} placement="bottom" variant="compact" asChild>
      <button type="button" onClick={onClick} className={cls} aria-label={label} {...rest}>{inner}</button>
    </Tooltip>
  );
}

// status: 'closed' | 'open' | 'closing'
function HeaderActionGroup({ id, icon, label, isOpen, dimmed, onOpen, onClose, children }) {
  const statusRef = useRef('closed');
  const [status, setStatus] = useState('closed');
  const railRef = useRef(null);
  const rafRef = useRef(0);
  const widthRef = useRef(0);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (isOpen && (statusRef.current === 'closed' || statusRef.current === 'closing')) {
      cancelAnimationFrame(rafRef.current);
      statusRef.current = 'open';
      setStatus('open');
    } else if (!isOpen && statusRef.current === 'open') {
      cancelAnimationFrame(rafRef.current);
      if (widthRef.current === 0) {
        statusRef.current = 'closed';
        setStatus('closed');
      } else {
        statusRef.current = 'closing';
        setStatus('closing');
        widthRef.current = 0;
        setWidth(0);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (status !== 'open') return;
    const el = railRef.current;
    if (!el) return;
    rafRef.current = requestAnimationFrame(() => {
      if (statusRef.current !== 'open') return;
      const w = el.scrollWidth;
      widthRef.current = w;
      setWidth(w);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  const handleTransitionEnd = useCallback((e) => {
    if (e.target !== railRef.current || e.propertyName !== 'width') return;
    if (statusRef.current === 'closing') {
      statusRef.current = 'closed';
      setStatus('closed');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(id); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, id, onClose]);

  const childArray = Children.toArray(children).filter(Boolean);
  if (!childArray.length) return null;
  const N = childArray.length;
  const dur = `${(0.26 + N * 0.05).toFixed(2)}s`;

  const showRail = status !== 'closed';
  const expanded = status === 'open' && width > 0;

  return (
    <div className="flex items-center">
      <Tooltip content={label} placement="bottom" variant="compact" disabled={isOpen} asChild>
        <button
          type="button"
          onClick={() => { if (isOpen) onClose(id); else onOpen(id); }}
          aria-expanded={isOpen}
          aria-controls={showRail ? `hdr-group-${id}` : undefined}
          className={`material-symbols-outlined text-[30px] transition-all active:scale-95 duration-200 cursor-pointer w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/40 ${
            isOpen ? 'text-[#b08ad4] bg-surface-container-high/20' : dimmed ? 'text-on-surface-variant/20 hover:text-on-surface-variant/40' : 'text-on-surface-variant/60 hover:text-[#e0c4ff]'
          }`}
        >
          {icon}
        </button>
      </Tooltip>
      {showRail && (
        <div
          ref={railRef}
          id={`hdr-group-${id}`}
          onClick={() => { if (status === 'open') onClose(id); }}
          onTransitionEnd={handleTransitionEnd}
          style={{
            width: expanded ? width : 0,
            opacity: expanded ? 1 : 0,
            transition: `width ${dur} cubic-bezier(0.4,0,0.2,1), opacity ${dur} cubic-bezier(0.4,0,0.2,1)`,
          }}
          className={`overflow-hidden ${status === 'closing' ? 'pointer-events-none' : ''}`}
        >
          <div className="flex items-center gap-1 pl-1 whitespace-nowrap">
            {childArray.map((child, i) => (
              <span
                key={i}
                className="inline-flex items-center animate-group-item-in motion-reduce:animate-none"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {child}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DevEventLogGroupItem() {
  const isOpen = useDevEventLogStore((s) => s.isOpen);
  const evCount = useDevEventLogStore((s) => s.events.length);
  const toggleOpen = useDevEventLogStore((s) => s.toggleOpen);
  return (
    <GroupItem
      icon="monitoring"
      label="Dev Event Log"
      onClick={toggleOpen}
      active={isOpen}
      badge={evCount > 0 ? (
        <span className="min-w-[14px] h-[14px] rounded-full bg-tertiary/80 text-[8px] text-white flex items-center justify-center px-0.5 leading-none">
          {evCount > 99 ? '99+' : evCount}
        </span>
      ) : null}
    />
  );
}

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entryRoute, setEntryRoute] = useState(() => peekEntryIntent());

  useEffect(() => {
    if (entryRoute && (location.pathname.startsWith('/play') || location.pathname.startsWith('/create'))) {
      consumeEntryIntent();
      setEntryRoute(null);
    }
  }, [location.pathname, entryRoute]);
  const { settings, updateSettings, backendUser } = useSettings();
  const music = useGlobalMusic();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys, openImageConfig, openAudioConfig, openProfile, openAdminUsers, openWorldLocationGraph, openGmModal, openPrivacy } = useModals();
  const { dictation } = useDictationContext() ?? {};
  const campaign = useGameCampaign();
  const aiLogSidebarVisible = useAiCallLogStore((s) => s.sidebarVisible);
  const aiFullLogOpen = useAiCallLogStore((s) => s.fullLogOpen);
  const aiLogs = useAiCallLogStore((s) => s.logs);
  const aiBackendLogs = useAiCallLogStore((s) => s.backendLogs);
  const toggleAiSidebar = useAiCallLogStore((s) => s.toggleSidebarVisible);
  const toggleAiFullLog = useAiCallLogStore((s) => s.toggleFullLog);
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
  const preMuteVolumesRef = useRef(null);

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
  const [activeGroupId, setActiveGroupId] = useState(null);
  const handleOpenGroup = useCallback((id) => setActiveGroupId(id), []);
  const handleCloseGroup = useCallback((id) => setActiveGroupId(prev => (prev === id ? null : prev)), []);


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
  const sfxVol = settings.sfxVolume ?? 70;
  const currentlyMuted = vol === 0 && dlgVol === 0 && sfxVol === 0;
  const maxVol = Math.max(vol, dlgVol);
  const volumeIcon = currentlyMuted ? 'volume_off' : maxVol < 40 ? 'volume_down' : 'volume_up';
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
      className="fixed top-0 w-full z-50 flex justify-between items-center pl-6 pr-10 h-16 backdrop-blur-md border-b border-primary/[0.12] overflow-visible"
      style={HEADER_CHROME_STYLE}
    >
      {isPlayRoute && (
        <Link
          ref={playLogoLinkRef}
          to="/"
          onMouseEnter={updatePlayLogoVignette}
          onMouseLeave={clearPlayLogoVignette}
          onFocus={updatePlayLogoVignette}
          onBlur={clearPlayLogoVignette}
          className="absolute left-6 bottom-0 z-[51] block leading-none translate-x-[10px] translate-y-[138px] transition-opacity duration-300"
        >
          <span className="relative inline-block origin-top leading-none motion-reduce:animate-none animate-campaign-logo-float will-change-transform">
            <img
              src={campaignLogoSrc}
              alt={t('common.appName')}
              onLoad={updateCampaignLogoCenter}
              className="relative z-0 block h-[16.2rem] w-auto max-w-[min(83.7vw,59.4rem)] object-contain object-bottom select-none pointer-events-auto brightness-[0.9] contrast-[1.22]"
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
          isPlayRoute ? 'pl-[max(17.55rem,min(45.9rem,calc(62.1vw_+_9.45rem)))] ml-3 md:ml-5' : ''
        }`}
      >
        {!isPlayRoute && (
          <Link
            to="/"
            className="flex items-center gap-2 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(197,154,255,0.5)]"
          >
            <HeaderDice className="h-[3.75rem] w-auto" ariaLabel={t('common.appName')} />
          </Link>
        )}
        {!isPlayRoute && <HeaderVersionPopover />}
        {!backendUser && (
          <Tooltip content={t('privacy.linkLabel')} placement="bottom" variant="compact" asChild>
            <button
              type="button"
              onClick={openPrivacy}
              aria-label={t('privacy.linkLabel')}
              className="material-symbols-outlined text-[30px] text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
            >
              privacy_tip
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center">
        {backendUser && (
          <nav className="hidden md:flex gap-1 items-center text-on-surface-variant font-body text-[15px] lowercase pr-4">
            {navLinks.map((link) =>
              link.action ? (
                <button
                  key={link.path}
                  onClick={link.action}
                  className="relative flex items-center gap-1.5 px-4 py-2 transition-colors duration-300 hover:text-tertiary rounded-sm hover:bg-surface-container-high/30"
                >
                  <span className="material-symbols-outlined text-xl text-tertiary/60">{link.icon}</span>
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
                  <span className={`material-symbols-outlined text-xl ${location.pathname === link.path ? 'text-primary/70' : 'text-tertiary/60'}`}>{link.icon}</span>
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
            <span className="material-symbols-outlined text-xl">play_arrow</span>
            Przejdź do kampanii
          </button>
        )}

        {settings.localMusicEnabled && music.hasMusic && (<>
          <ZigzagDivider />
          <div className="flex items-center gap-2">
            <Tooltip content={music.isPlaying ? t('common.pause', 'Pause') : t('common.play', 'Play')} placement="bottom" variant="compact" asChild>
              <button
                onClick={music.togglePlayPause}
                className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              >
                {music.isPlaying ? 'pause' : 'play_arrow'}
              </button>
            </Tooltip>
            <Tooltip content={t('gameplay.musicSkip', 'Next')} placement="bottom" variant="compact" asChild>
              <button
                onClick={music.skip}
                className="material-symbols-outlined text-xl text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
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
                    if (!currentlyMuted) {
                      preMuteVolumesRef.current = { musicVolume: vol, dialogueVolume: dlgVol, sfxVolume: sfxVol };
                      updateSettings({ musicVolume: 0, dialogueVolume: 0, sfxVolume: 0 });
                      music.setVolume(0);
                    } else {
                      const saved = preMuteVolumesRef.current || {};
                      const restored = {
                        musicVolume: saved.musicVolume || 25,
                        dialogueVolume: saved.dialogueVolume || 25,
                        sfxVolume: saved.sfxVolume || 25,
                      };
                      updateSettings(restored);
                      music.setVolume(restored.musicVolume);
                      preMuteVolumesRef.current = null;
                    }
                  }}
                  className="material-symbols-outlined text-xl text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                >
                  {volumeIcon}
                </button>
              </Tooltip>
              {volumeOpen && (
                <div className="absolute right-0 top-full mt-2 px-3 py-2.5 rounded-sm bg-surface-container-high/95 backdrop-blur-xl border border-outline-variant/15 shadow-xl space-y-2 animate-scale-in w-52">
                  <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-on-surface-variant/70 shrink-0">music_note</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={vol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        music.setVolume(v);
                        if (v > 0) preMuteVolumesRef.current = null;
                      }}
                      className="w-full min-w-0 h-1 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] text-on-surface-variant font-mono w-7 text-right">{vol}%</span>
                  </div>
                  <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-on-surface-variant/70 shrink-0">record_voice_over</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={dlgVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateSettings({ dialogueVolume: v });
                        if (v > 0) preMuteVolumesRef.current = null;
                      }}
                      className="w-full min-w-0 h-1 accent-primary cursor-pointer"
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
        </>)}

        {backendUser && (<>
          <ZigzagDivider />
          <div className="flex items-center gap-1">
            {showMpStatus && (
              <span className={`hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border ${mpStatusClass}`}>
                <span className="material-symbols-outlined text-base">{mp.state.connected ? 'wifi' : 'wifi_off'}</span>
                {mpStatusLabel}
              </span>
            )}
            <HeaderActionGroup id="game" icon="sports_esports" label="Gra" isOpen={activeGroupId === 'game'} dimmed={activeGroupId !== null && activeGroupId !== 'game'} onOpen={handleOpenGroup} onClose={handleCloseGroup}>
              {dictation?.supported && (
                <GroupItem
                  icon={dictation.enabled ? 'mic' : 'mic_off'}
                  label={t(dictation.enabled ? 'gameplay.dictationDisable' : 'gameplay.dictationEnable')}
                  onClick={dictation.toggleEnabled}
                  active={dictation.enabled}
                />
              )}
              {hasActiveGame && (
                <GroupItem icon="auto_awesome" label={t('nav.grimoire')} to={playPath} />
              )}
              <GroupItem icon="photo_library" label={t('nav.gallery')} to="/gallery" />
              <GroupItem icon="public" label={t('nav.worldLocationGraph', { defaultValue: 'Graf lokacji świata' })} onClick={openWorldLocationGraph} />
            </HeaderActionGroup>
            <HeaderActionGroup id="media" icon="tune" label="AI / Media" isOpen={activeGroupId === 'media'} dimmed={activeGroupId !== null && activeGroupId !== 'media'} onOpen={handleOpenGroup} onClose={handleCloseGroup}>
              <GroupItem icon="brush" label={t('nav.imageConfig')} onClick={openImageConfig} />
              <GroupItem icon="graphic_eq" label={t('nav.audioConfig')} onClick={openAudioConfig} />
              <GroupItem icon="vpn_key" label={t('nav.keys')} onClick={openKeys} />
            </HeaderActionGroup>
            <HeaderActionGroup id="system" icon="settings" label="System" isOpen={activeGroupId === 'system'} dimmed={activeGroupId !== null && activeGroupId !== 'system'} onOpen={handleOpenGroup} onClose={handleCloseGroup}>
              <GroupItem icon="draw" label={t('nav.settings')} onClick={openSettings} />
              <GroupItem icon="privacy_tip" label={t('privacy.linkLabel')} onClick={openPrivacy} />
              <GroupItem
                icon="search"
                label={t('nav.appZoomTooltip', { percent: appZoom })}
                onClick={handleAppZoomClick}
                onContextMenu={handleAppZoomContextMenu}
              />
            </HeaderActionGroup>
            {backendUser?.isAdmin && (
              <HeaderActionGroup id="admin" icon="shield_person" label="Admin" isOpen={activeGroupId === 'admin'} dimmed={activeGroupId !== null && activeGroupId !== 'admin'} onOpen={handleOpenGroup} onClose={handleCloseGroup}>
                <GroupItem icon="admin_panel_settings" label={t('admin.userManagement')} onClick={openAdminUsers} />
                <GroupItem icon="edit_note" label="Edytor kampanii" onClick={() => navigate('/admin')} />
                <DevEventLogGroupItem />
                <GroupItem
                  icon="terminal"
                  label="LLM Calls"
                  onClick={toggleAiFullLog}
                  onContextMenu={(e) => { e.preventDefault(); toggleAiSidebar(); }}
                  active={aiFullLogOpen || aiLogSidebarVisible}
                  badge={aiPendingCount > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                  ) : null}
                />
              </HeaderActionGroup>
            )}
            <ZigzagDivider />
            <Tooltip content={(backendUser.credits ?? 0) < 0 ? t('credits.negativeBalance') : t('credits.title', 'Credits')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openProfile}
                aria-label={t('nav.credits', 'Credits')}
                className={`relative flex items-center gap-1.5 px-3 h-9 rounded-full text-xs transition-all duration-300 ${
                  (backendUser.credits ?? 0) < 0
                    ? 'text-error animate-pulse'
                    : 'text-[#ffd4e6]'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(24,8,24,0.9) 0%, rgba(14,5,19,0.95) 100%)',
                  border: '1px solid rgba(255,140,200,0.35)',
                  boxShadow: (backendUser.credits ?? 0) < 0
                    ? 'inset 0 1px 0 rgba(255,60,80,0.1)'
                    : 'inset 0 1px 0 rgba(255,200,240,0.08)',
                }}
              >
                <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,160,210,0.8)' }}>payments</span>
                <span className="font-headline">${((backendUser.credits ?? 0) / 100).toFixed(2)}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('nav.profile')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openProfile}
                aria-label={t('nav.profile')}
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center transition-all duration-300 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, rgba(24,8,24,0.9) 0%, rgba(14,5,19,0.95) 100%)',
                  border: '1px solid rgba(255,140,200,0.35)',
                  boxShadow: 'inset 0 1px 0 rgba(255,200,240,0.08)',
                }}
              >
                <span className="material-symbols-outlined text-base" style={{ color: 'rgba(255,160,210,0.8)' }}>person</span>
              </button>
            </Tooltip>
          </div>
        </>)}
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
