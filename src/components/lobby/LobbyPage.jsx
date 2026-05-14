import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { apiClient } from '../../services/apiClient';
import { getPersistedRejoinInfo, clearPersistedRejoinInfo } from '../../services/websocket';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useModals } from '../../contexts/ModalContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLobbyHeroFit } from '../../hooks/useLobbyHeroFit';
import { useLobbyLoggedInSizing } from '../../hooks/useLobbyLoggedInSizing';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';
import CampaignCard from './CampaignCard';
import FeaturedCampaignCard from './FeaturedCampaignCard';
import AuthPanel from './AuthPanel';
import IntroOverlay from './IntroOverlay';
import VideoBackground from '../ui/VideoBackground';
import LogoVideo from '../ui/LogoVideo';
import { INTRO_SEEN_SESSION_KEY, RESUME_PLAY_CAMPAIGN_SESSION_KEY } from '../../constants/sessionIntro';

const LOBBY_SCALING_DICE_COUNT = 20;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Hold black overlay before fade; dice jolts reset this timer from parent. */
const LOBBY_SCALING_OVERLAY_HOLD_MS = 1500;
const LOBBY_SCALING_OVERLAY_FADE_MS = 300;
/** Min horizontal viewport delta (px) to treat as width-driven layout change. */
const LOBBY_SCALING_WIDTH_EPS_PX = 6;

/** Per-die visual size multiplier in [2, 5] on top of a small base (px). */
function randomLobbyDiceSizePx() {
  const base = 10 + Math.random() * 10;
  const mult = 2 + Math.random() * 3;
  return Math.max(28, Math.round(base * mult));
}

function createLobbyScalingDiceBodies() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const h = typeof window !== 'undefined' ? window.innerHeight : 768;
  const reduced = typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
  return Array.from({ length: LOBBY_SCALING_DICE_COUNT }, () => {
    if (reduced) {
      return {
        x: w * (0.06 + Math.random() * 0.88),
        y: h * (0.38 + Math.random() * 0.48),
        vx: 0,
        vy: 0,
        rot: Math.random() * 360,
        vr: 0,
        size: Math.round((12 + Math.random() * 8) * (1.8 + Math.random() * 1.4)),
      };
    }
    return {
      x: w * (0.05 + Math.random() * 0.9),
      y: h * (-0.08 - Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 7,
      vy: 1.2 + Math.random() * 5,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      size: randomLobbyDiceSizePx(),
    };
  });
}

function applyScaleImpulseToDice(dice, deltaFit) {
  const mag = Math.abs(deltaFit) * 220;
  if (mag < 0.02) return;
  for (let i = 0; i < dice.length; i += 1) {
    const d = dice[i];
    const spread = 0.65 + (i % 7) * 0.05;
    d.vx += (Math.random() - 0.5) * mag * spread;
    d.vy += (Math.random() - 0.45) * mag * 0.5 * spread;
    d.vr += (Math.random() - 0.5) * mag * 0.12;
  }
}

function applyWidthImpulseToDice(dice, deltaWidthPx) {
  if (Math.abs(deltaWidthPx) < LOBBY_SCALING_WIDTH_EPS_PX) return;
  const mag = Math.abs(deltaWidthPx) * 0.42;
  const wSign = Math.sign(deltaWidthPx) || (Math.random() > 0.5 ? 1 : -1);
  for (let i = 0; i < dice.length; i += 1) {
    const d = dice[i];
    const spread = 0.65 + (i % 7) * 0.05;
    d.vx += wSign * mag * (0.35 + Math.random() * 0.45) * spread;
    d.vy += (Math.random() - 0.52) * mag * 0.28 * spread;
    d.vr += (Math.random() - 0.5) * mag * 0.09;
  }
}

/** Full-screen black overlay while lobby hero rescales: many dice “spilled” and jostled by scale changes. */
function ScalingDiceOverlay({ fading, fitScale, innerWidth }) {
  const diceRef = useRef(createLobbyScalingDiceBodies());
  const wrapRefs = useRef([]);
  const videoRefs = useRef([]);
  const lastFitScaleRef = useRef(fitScale);
  const lastInnerWidthRef = useRef(null);
  const reducedMotionRef = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    reducedMotionRef.current = mql.matches;
    const onChange = (e) => { reducedMotionRef.current = e.matches; };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const dice = diceRef.current;
    for (let i = 0; i < dice.length; i += 1) {
      const el = wrapRefs.current[i];
      if (!el) continue;
      const d = dice[i];
      el.style.transform = `translate3d(${d.x - d.size / 2}px, ${d.y - d.size / 2}px, 0) rotate(${d.rot}deg)`;
    }
    const vids = videoRefs.current;
    for (let i = 0; i < vids.length; i += 1) {
      const v = vids[i];
      if (!v) continue;
      v.playbackRate = 0.78 + (i % 6) * 0.07;
    }
  }, []);

  useEffect(() => {
    const prev = lastFitScaleRef.current;
    lastFitScaleRef.current = fitScale;
    if (prev == null || Math.abs(prev - fitScale) < 1e-6) return;
    applyScaleImpulseToDice(diceRef.current, fitScale - prev);
  }, [fitScale]);

  useEffect(() => {
    if (innerWidth <= 0) return;
    const prev = lastInnerWidthRef.current;
    lastInnerWidthRef.current = innerWidth;
    if (prev == null) return;
    if (Math.abs(innerWidth - prev) < LOBBY_SCALING_WIDTH_EPS_PX) return;
    applyWidthImpulseToDice(diceRef.current, innerWidth - prev);
  }, [innerWidth]);

  useEffect(() => {
    if (typeof window === 'undefined' || reducedMotionRef.current) return undefined;

    const dice = diceRef.current;
    let rafId = 0;
    let running = true;

    const step = () => {
      if (!running) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const floorY = h - 6;

      for (let i = 0; i < dice.length; i += 1) {
        const d = dice[i];
        d.vy += 0.42;
        d.x += d.vx;
        d.y += d.vy;
        d.rot += d.vr;

        d.vx *= 0.997;
        d.vy *= 0.9985;
        d.vr *= 0.998;

        const half = d.size * 0.5;
        if (d.x < half) {
          d.x = half;
          d.vx *= -0.62;
          d.vr += (Math.random() - 0.5) * 6;
        } else if (d.x > w - half) {
          d.x = w - half;
          d.vx *= -0.62;
          d.vr += (Math.random() - 0.5) * 6;
        }

        if (d.y > floorY - half) {
          d.y = floorY - half;
          if (d.vy > 0.35) {
            d.vy *= -0.38;
            d.vx *= 0.9;
            d.vr += (Math.random() - 0.5) * 8;
          } else {
            d.vy = 0;
            d.vx *= 0.94;
            d.vr *= 0.92;
          }
        }

        const el = wrapRefs.current[i];
        if (el) {
          el.style.transform = `translate3d(${d.x - d.size / 2}px, ${d.y - d.size / 2}px, 0) rotate(${d.rot}deg)`;
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[60] bg-black transition-opacity duration-300 ease-out ${fading ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden="true"
    >
      {diceRef.current.map((d, i) => (
        <div
          key={i}
          ref={(el) => { wrapRefs.current[i] = el; }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ width: d.size, height: d.size }}
        >
          <video
            ref={(el) => { videoRefs.current[i] = el; }}
            src="/video/dice.webm"
            className="h-full w-full object-contain opacity-[0.92] drop-shadow-[0_2px_6px_rgba(255,255,255,0.12)]"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      ))}
    </div>
  );
}

function FloatingRune({ delay, className }) {
  return (
    <span
      className={`absolute text-primary/[0.07] font-headline select-none pointer-events-none ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      &#x2726;
    </span>
  );
}

function CharacterSummary({ char, label, icon, accent, disabled }) {
  if (!char) return null;
  const level = char.characterLevel || 1;
  return (
    <div className={`flex-1 min-w-0 p-4 rounded-sm border transition-colors ${disabled ? 'opacity-40 border-outline-variant/20 bg-surface-container-low/30' : `border-${accent}/20 bg-surface-container-low`}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-sm ${disabled ? 'text-outline' : `text-${accent}`}`}>{icon}</span>
        <span className={`font-label text-xs uppercase tracking-wider ${disabled ? 'text-outline' : `text-${accent}`}`}>{label}</span>
      </div>
      <p className="text-on-surface font-headline text-sm truncate">{char.name || '—'}</p>
      <p className="text-on-surface-variant text-xs mt-1">{char.species || '—'}</p>
      <p className="text-on-surface-variant text-[10px] mt-1">Poziom {level}</p>
    </div>
  );
}

function CharacterChoiceModal({ campaign, libraryCharacter, onChooseCampaign, onChooseLibrary, onCancel, t, locale }) {
  const campaignChar = campaign.character;
  const hasLibrary = libraryCharacter != null;

  const libraryHint = useMemo(() => {
    if (!hasLibrary) return null;
    const level = libraryCharacter.characterLevel || 1;
    const ts = libraryCharacter.updatedAt
      ? (typeof libraryCharacter.updatedAt === 'number'
        ? libraryCharacter.updatedAt
        : new Date(libraryCharacter.updatedAt).getTime())
      : null;
    const date = ts
      ? new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      : null;
    if (date) {
      return t('lobby.libraryNewerHint', 'Newer library version available (Level {{level}}, updated {{date}})', { level, date });
    }
    return t('lobby.libraryNewerHintNoDate', 'Newer library version available (Level {{level}})', { level });
  }, [hasLibrary, libraryCharacter, locale, t]);

  return (
    <div data-testid="character-choice-modal" className="relative bg-surface-container border border-outline-variant/20 rounded-sm shadow-2xl w-full max-w-md mx-4 animate-slide-up">
      {hasLibrary && (
        <button
          type="button"
          data-testid="character-choice-switch-library"
          onClick={onChooseLibrary}
          title={t('lobby.useLibraryChar', 'Use Library Version')}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider text-outline hover:text-primary hover:bg-primary/5 transition-colors z-10"
        >
          <span className="material-symbols-outlined text-xs">swap_horiz</span>
          {t('lobby.switchToLibrary', 'Use current')}
        </button>
      )}

      <div className="p-6 pr-28 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">person</span>
          <div>
            <h3 className="font-headline text-on-surface text-lg">{t('lobby.characterChoice', 'Character Version')}</h3>
            <p className="text-on-surface-variant text-xs mt-0.5">{t('lobby.characterChoiceDesc', 'Choose which character version to use')}</p>
          </div>
        </div>
        {campaign.campaign?.name && (
          <p className="text-on-surface-variant text-xs mt-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-xs text-outline">auto_stories</span>
            {campaign.campaign.name}
          </p>
        )}
      </div>

      <div className="p-6">
        <CharacterSummary
          char={campaignChar}
          label={t('lobby.campaignCharacter', 'Campaign Character')}
          icon="save"
          accent="tertiary"
        />
        {libraryHint && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-outline">
            <span className="material-symbols-outlined text-xs text-outline">schedule</span>
            {libraryHint}
          </p>
        )}
      </div>

      <div className="px-6 pb-6">
        <Button className="w-full" onClick={onChooseCampaign}>
          {t('lobby.useCampaignChar', 'Use Campaign Version')}
        </Button>
      </div>

      <div className="px-6 pb-4 flex justify-center">
        <button onClick={onCancel} className="text-xs text-outline hover:text-on-surface-variant transition-colors">
          {t('common.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { dispatch } = useGame();
  const { openSettings, openProfile } = useModals();
  useDocumentTitle(t('common.tagline'));
  const { backendUser, hasApiKey } = useSettings();
  const mp = useMultiplayer();
  const [campaigns, setCampaigns] = useState([]);

  const [syncing, setSyncing] = useState(false);
  const [rejoinInfo, setRejoinInfo] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [pendingCampaign, setPendingCampaign] = useState(null);
  const [libraryCharacter, setLibraryCharacter] = useState(undefined);
  const [campaignNotFound, setCampaignNotFound] = useState(false);
  const [loadingCampaignId, setLoadingCampaignId] = useState(null);
  const [scalingOverlay, setScalingOverlay] = useState({ visible: false, fading: false });
  const [innerWidth, setInnerWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
  const previousFitScaleRef = useRef(null);
  const previousInnerWidthForOverlayRef = useRef(null);
  const scalingFadeTimerRef = useRef(null);
  const scalingRemoveTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setInnerWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (location.state?.campaignNotFound) {
      setCampaignNotFound(true);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const resume = location.state?.resumePlayCampaignId;
    if (!resume) return;
    try {
      sessionStorage.setItem(RESUME_PLAY_CAMPAIGN_SESSION_KEY, resume);
    } catch {
      /* ignore quota / private mode */
    }
    navigate('/', { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    const tryResumePlay = () => {
      if (typeof sessionStorage === 'undefined') return;
      if (!sessionStorage.getItem(INTRO_SEEN_SESSION_KEY)) return;
      const id = sessionStorage.getItem(RESUME_PLAY_CAMPAIGN_SESSION_KEY);
      if (!id) return;
      sessionStorage.removeItem(RESUME_PLAY_CAMPAIGN_SESSION_KEY);
      navigate(`/play/${id}`, { replace: true });
    };
    tryResumePlay();
    window.addEventListener('rpgon:intro-seen', tryResumePlay);
    return () => window.removeEventListener('rpgon:intro-seen', tryResumePlay);
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success' || params.get('credits') === 'cancel') {
      openProfile();
    }
  }, [openProfile]);

  useEffect(() => {
    let cancelled = false;
    setSyncing(true);
    storage.getCampaigns()
      .then((list) => {
        if (cancelled) return;
        setCampaigns(list);
      })
      .catch(() => { if (!cancelled) setCampaigns([]); })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    if (backendUser && apiClient.isConnected()) {
      const persisted = getPersistedRejoinInfo();
      if (persisted?.roomCode) {
        apiClient.get('/multiplayer/my-sessions')
          .then((res) => {
            if (cancelled) return;
            const sessions = res?.sessions || [];
            const match = sessions.find((s) => s.roomCode === persisted.roomCode);
            if (match) {
              setRejoinInfo({ ...persisted, ...match });
            } else {
              clearPersistedRejoinInfo();
            }
          })
          .catch(() => {
            if (!cancelled) setRejoinInfo(persisted);
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [backendUser]);

  const loadCampaignDirectly = (payload) => {
    dispatch({ type: 'LOAD_CAMPAIGN', payload });
    storage.saveLocalSnapshot(payload);
    setPendingCampaign(null);
    setLibraryCharacter(undefined);
    navigate(`/play/${payload.campaign.backendId || payload.campaign.id}`);
  };

  const openCharacterChoice = async (campaignData) => {
    if (!campaignData.character) {
      loadCampaignDirectly(campaignData);
      return;
    }
    try {
      const chars = await storage.getCharactersAsync();
      const match = storage.findMatchingLibraryCharacter(campaignData.character, chars);
      if (!match || !storage.libraryCharacterDiffers(campaignData.character, match)) {
        loadCampaignDirectly(campaignData);
        return;
      }
      setLibraryCharacter(match);
      setPendingCampaign(campaignData);
    } catch {
      loadCampaignDirectly(campaignData);
    }
  };

  const confirmLoad = (useLibrary) => {
    if (!pendingCampaign) return;
    let payload = pendingCampaign;
    if (useLibrary && libraryCharacter) {
      payload = {
        ...pendingCampaign,
        character: {
          ...libraryCharacter,
          localId: pendingCampaign.character?.localId || libraryCharacter.localId,
          backendId: libraryCharacter.backendId || libraryCharacter.id || pendingCampaign.character?.backendId,
        },
      };
    }
    loadCampaignDirectly(payload);
  };

  const handleLoad = async (campaign) => {
    if (loadingCampaignId) return;
    setLoadingCampaignId(campaign.id);
    try {
      const campaignPromise = campaign.source === 'local'
        ? Promise.resolve(storage.loadLocalSnapshot())
        : storage.loadCampaign(campaign.id);
      const [data, chars] = await Promise.all([
        campaignPromise,
        storage.getCharactersAsync().catch(() => []),
      ]);
      if (!data) return;
      if (!data.character) {
        loadCampaignDirectly(data);
        return;
      }
      const match = storage.findMatchingLibraryCharacter(data.character, chars);
      if (!match || !storage.libraryCharacterDiffers(data.character, match)) {
        loadCampaignDirectly(data);
        return;
      }
      setLibraryCharacter(match);
      setPendingCampaign(data);
    } catch (err) {
      console.warn('[LobbyPage] Failed to load campaign:', err.message);
    } finally {
      setLoadingCampaignId(null);
    }
  };

  const handleTogglePublish = async (id) => {
    const target = campaigns.find((c) => c.id === id);
    if (!target || target.source === 'local') return;
    const newValue = !target.isPublic;
    try {
      await apiClient.patch(`/campaigns/${id}/publish`, { isPublic: newValue });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPublic: newValue } : c)),
      );
    } catch {
      /* silent */
    }
  };

  const handleShare = async (id) => {
    const target = campaigns.find((c) => c.id === id);
    if (!target || target.source === 'local') return;
    try {
      let token = target.shareToken;
      if (!token) {
        const res = await apiClient.post(`/campaigns/${id}/share`);
        token = res.shareToken;
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, shareToken: token } : c)),
        );
      }
      const url = `${window.location.origin}/view/${token}/read`;
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleDelete = async (id) => {
    const target = campaigns.find((c) => c.id === id);
    if (target?.source === 'local') {
      storage.clearLocalSnapshot();
    } else {
      await storage.deleteCampaign(id);
    }
    try {
      setCampaigns(await storage.getCampaigns());
    } catch { setCampaigns([]); }
  };

  const handleContinue = async () => {
    const activeId = storage.getActiveCampaignId();
    if (activeId && campaigns.length > 0) {
      const match = campaigns.find((c) => c.id === activeId);
      if (match) {
        setSyncing(true);
        try {
          const data = await storage.loadCampaign(match.id);
          if (data) { openCharacterChoice(data); return; }
        } catch { /* ignore */ } finally { setSyncing(false); }
      }
    }
    if (campaigns.length > 0) {
      setSyncing(true);
      try {
        const data = await storage.loadCampaign(campaigns[0].id);
        if (data) openCharacterChoice(data);
      } catch { /* ignore */ } finally { setSyncing(false); }
    }
  };

  useEffect(() => {
    if (rejoining && mp.state.isMultiplayer && mp.state.roomCode) {
      setRejoining(false);
      const target = mp.state.phase === 'playing' ? '/play' : '/create';
      navigate(target);
    }
  }, [rejoining, mp.state.isMultiplayer, mp.state.roomCode, mp.state.phase, navigate]);

  useEffect(() => {
    if (rejoining && mp.state.error) {
      setRejoining(false);
      clearPersistedRejoinInfo();
      setRejoinInfo(null);
    }
  }, [rejoining, mp.state.error]);

  const handleRejoin = async () => {
    setRejoining(true);
    try {
      const success = await mp.rejoinRoom();
      if (!success) {
        clearPersistedRejoinInfo();
        setRejoinInfo(null);
        setRejoining(false);
      }
    } catch {
      clearPersistedRejoinInfo();
      setRejoinInfo(null);
      setRejoining(false);
    }
  };

  const handleDismissRejoin = () => {
    clearPersistedRejoinInfo();
    setRejoinInfo(null);
  };

  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [logoVisible, setLogoVisible] = useState(
    () => !!sessionStorage.getItem(INTRO_SEEN_SESSION_KEY)
  );
  const handleVideoEnded = useCallback(() => setLogoVisible(true), []);

  useEffect(() => {
    const hide = () => setLogoVisible(false);
    window.addEventListener('rpgon:replay-intro', hide);
    return () => window.removeEventListener('rpgon:replay-intro', hide);
  }, []);

  const hasServerAi = hasApiKey('openai') || hasApiKey('anthropic');
  const isLoggedIn = !!backendUser;
  const hasCampaigns = campaigns.length > 0;
  const [isLowDesktopViewport, setIsLowDesktopViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(min-width: 1024px) and (max-height: 899px)');
    const update = () => setIsLowDesktopViewport(media.matches);

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const RECENT_COUNT = 3;
  const recentCampaigns = campaigns.slice(0, RECENT_COUNT);
  const hasMoreCampaigns = campaigns.length > RECENT_COUNT;

  const hasRejoinBanner = !!rejoinInfo;
  const [lobbyRootEl, setLobbyRootEl] = useState(null);
  const [heroSlotEl, setHeroSlotEl] = useState(null);
  const { logoMaxHeightPx, logoTranslateYPx, badgeOverlapPx } = useLobbyLoggedInSizing(isLoggedIn);
  const { outerRef, innerRef, fitScale, clipHeight } = useLobbyHeroFit({
    isLoggedIn,
    hasCampaigns,
    hasServerAi,
    logoVisible,
    hasRejoinBanner,
    lobbyRootEl,
    heroSlotEl,
  });
  const useCompactGuestHero = !isLoggedIn && isLowDesktopViewport;

  const bumpScalingOverlayLayout = useCallback(() => {
    if (scalingFadeTimerRef.current) clearTimeout(scalingFadeTimerRef.current);
    if (scalingRemoveTimerRef.current) clearTimeout(scalingRemoveTimerRef.current);
    setScalingOverlay({ visible: true, fading: false });
    scalingFadeTimerRef.current = setTimeout(() => {
      setScalingOverlay((current) => (
        current.visible ? { visible: true, fading: true } : current
      ));
      scalingRemoveTimerRef.current = setTimeout(() => {
        setScalingOverlay({ visible: false, fading: false });
      }, LOBBY_SCALING_OVERLAY_FADE_MS);
    }, LOBBY_SCALING_OVERLAY_HOLD_MS);
  }, []);

  useEffect(() => {
    const previousFitScale = previousFitScaleRef.current;
    previousFitScaleRef.current = fitScale;
    if (previousFitScale == null || Math.abs(previousFitScale - fitScale) < 0.001) return;
    bumpScalingOverlayLayout();
  }, [fitScale, bumpScalingOverlayLayout]);

  useEffect(() => {
    if (innerWidth <= 0) return;
    const prev = previousInnerWidthForOverlayRef.current;
    previousInnerWidthForOverlayRef.current = innerWidth;
    if (prev == null) return;
    if (Math.abs(innerWidth - prev) < LOBBY_SCALING_WIDTH_EPS_PX) return;
    bumpScalingOverlayLayout();
  }, [innerWidth, bumpScalingOverlayLayout]);

  useEffect(() => () => {
    if (scalingFadeTimerRef.current) clearTimeout(scalingFadeTimerRef.current);
    if (scalingRemoveTimerRef.current) clearTimeout(scalingRemoveTimerRef.current);
  }, []);

  return (
    <>
    <IntroOverlay onVideoEnded={handleVideoEnded} />
    <VideoBackground src="/video/bg_video_1.mp4" />
    {scalingOverlay.visible && (
      <ScalingDiceOverlay fading={scalingOverlay.fading} fitScale={fitScale} innerWidth={innerWidth} />
    )}
    <div ref={setLobbyRootEl} className="flex flex-col items-center min-h-[calc(100dvh-10rem)] lg:min-h-[calc(100dvh-4rem)] px-6 py-6 relative z-10 overflow-hidden w-full">
      {campaignNotFound && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm font-label shadow-lg backdrop-blur-sm animate-slide-up">
          <span className="material-symbols-outlined text-base">error</span>
          {t('lobby.campaignNotFound')}
          <button onClick={() => setCampaignNotFound(false)} className="ml-2 hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-tertiary/[0.03] rounded-full blur-[100px] pointer-events-none" />

      {/* Floating decorative runes */}
      <FloatingRune delay={0} className="text-6xl top-[15%] left-[10%] animate-float-slow" />
      <FloatingRune delay={1.5} className="text-4xl top-[20%] right-[12%] animate-float" />
      <FloatingRune delay={0.8} className="text-5xl bottom-[25%] left-[8%] animate-float-slow" />
      <FloatingRune delay={2} className="text-3xl bottom-[30%] right-[15%] animate-float" />

      {/* Multiplayer Rejoin Banner — full width above columns */}
      {rejoinInfo && (
        <div className="mb-4 max-w-5xl w-full animate-slide-up relative z-10">
          <GlassCard elevated className="p-4 border-l-2 border-primary" data-testid="rejoin-banner">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">wifi_off</span>
              <div className="flex-1 min-w-0">
                <p className="font-headline text-primary text-sm">
                  {t('lobby.activeMultiplayerSession', 'Active Multiplayer Session')}
                  {rejoinInfo.campaignName && (
                    <span className="text-on-surface/70 font-body text-xs ml-2">
                      {rejoinInfo.campaignName} &middot; {rejoinInfo.roomCode}
                    </span>
                  )}
                  {!rejoinInfo.campaignName && (
                    <span className="text-on-surface/70 font-body text-xs ml-2">
                      {rejoinInfo.roomCode}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={handleRejoin} disabled={rejoining}>
                  {rejoining
                    ? t('lobby.rejoining', 'Rejoining...')
                    : t('lobby.rejoinSession', 'Rejoin Game')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismissRejoin} disabled={rejoining}>
                  {t('lobby.dismissSession', 'Dismiss')}
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Hero fills remaining column height — stable clientHeight for fitScale (no my-auto feedback) */}
      <div
        ref={setHeroSlotEl}
        className="flex flex-1 flex-col items-center justify-center min-h-0 w-full max-w-full"
      >
        <div className="w-full max-w-5xl flex flex-col items-center relative z-10 animate-slide-up min-h-0">
        <div
          ref={outerRef}
          className="w-full overflow-hidden flex justify-center max-w-full"
          style={clipHeight != null ? { height: clipHeight } : undefined}
        >
          <div
            ref={innerRef}
            className={useCompactGuestHero
              ? 'grid w-full max-w-4xl grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] items-center gap-x-10 gap-y-3'
              : 'flex flex-col items-center w-full max-w-full gap-6'}
            style={{
              transform: `scale(${fitScale})`,
              transformOrigin: 'top center',
            }}
          >
            {/* Hero logo — animated webm, replays every 30s, holds last frame between */}
            <LogoVideo
              alt={t('lobby.title')}
              active={logoVisible}
              className={isLoggedIn
                ? 'h-auto w-auto max-w-full object-contain drop-shadow-2xl'
                : `h-60 md:h-80 w-auto drop-shadow-2xl ${useCompactGuestHero ? 'lg:h-72 justify-self-center self-end' : 'lg:h-[22rem]'}`}
              style={
                isLoggedIn && logoMaxHeightPx != null
                  ? {
                      opacity: logoVisible ? 1 : 0,
                      transition: 'opacity 2s ease-in',
                      maxHeight: logoMaxHeightPx,
                      transform: `translateY(-${logoTranslateYPx}px)`,
                    }
                  : { opacity: logoVisible ? 1 : 0, transition: 'opacity 2s ease-in' }
              }
            />

            {!isLoggedIn && (
              <>
                <div
                  className={`hidden sm:flex items-center gap-3 ${useCompactGuestHero ? 'justify-self-center' : ''}`}
                  style={{ opacity: logoVisible ? 1 : 0, transition: 'opacity 2s ease-in' }}
                >
                  <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/40" />
                  <span className="material-symbols-outlined text-primary/40 text-sm">diamond</span>
                  <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary/40" />
                </div>

                <p
                  className={`hidden sm:block text-on-surface-variant font-body text-base max-w-md leading-relaxed text-center ${useCompactGuestHero ? 'justify-self-center self-start' : ''}`}
                  style={{ opacity: logoVisible ? 1 : 0, transition: 'opacity 2s ease-in' }}
                >
                  {t('lobby.subtitle')}
                </p>
              </>
            )}

            {/* Not logged in — centered auth panel */}
            {!isLoggedIn && (
              <div className={`w-full max-w-sm ${useCompactGuestHero ? 'col-start-2 row-start-1 row-span-3 justify-self-center self-center' : 'mt-4 sm:mt-6 lg:mt-10'}`}>
                <AuthPanel />
              </div>
            )}

            {/* Logged in — single column: badge, then buttons */}
            {isLoggedIn && (
              <div
                className="w-full max-w-2xl flex flex-col items-center gap-3 sm:gap-4 lg:gap-5 relative z-20 mt-4 sm:mt-6 lg:mt-10"
                style={{ transform: `translateY(-${badgeOverlapPx}px)` }}
              >
                {/* Badge + CTAs at full CSS size; only outer hero uses fitScale when needed */}
                <AuthPanel />

                {!hasServerAi && (
                  <div
                    onClick={openSettings}
                    data-testid="api-key-warning"
                    className="w-full glass-panel-elevated p-3 rounded-sm border-l-2 border-tertiary cursor-pointer hover:border-tertiary/80 transition-all hover:translate-y-[-1px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-tertiary mt-0.5 text-sm">key</span>
                      <p className="text-on-surface-variant text-xs leading-snug">
                        {t('lobby.apiKeyRequired', 'Server AI configuration required')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-row gap-2 sm:gap-3 lg:gap-4 items-stretch w-full">
                  <Button size="lg" className="flex-1" onClick={() => navigate('/create')}>
                    {t('lobby.newCampaign')}
                  </Button>
                  {hasCampaigns && (
                    <Button size="lg" variant="secondary" className="flex-1" onClick={() => setShowAllCampaigns(true)}>
                      {t('lobby.continueCampaign')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* All Campaigns Modal */}
      {showAllCampaigns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAllCampaigns(false)}>
          <div
            className="relative bg-surface-container border border-outline-variant/20 rounded-sm shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-outline-variant/10">
              <h3 className="font-headline text-tertiary text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-dim">save</span>
                {t('lobby.savedCampaigns')}
                <span className="text-xs text-outline font-label ml-1">{campaigns.length}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAllCampaigns(false)}
                className="p-1 rounded-sm text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto p-6 pt-4 space-y-1">
              {campaigns.length > 0 && (
                <FeaturedCampaignCard
                  campaign={campaigns[0]}
                  loading={loadingCampaignId === campaigns[0].id}
                  disabled={!!loadingCampaignId}
                  onLoad={() => { handleLoad(campaigns[0]); setShowAllCampaigns(false); }}
                  onDelete={() => handleDelete(campaigns[0].id)}
                  onTogglePublish={campaigns[0].source !== 'local' ? () => handleTogglePublish(campaigns[0].id) : undefined}
                  onShare={campaigns[0].source !== 'local' ? () => handleShare(campaigns[0].id) : undefined}
                />
              )}
              {campaigns.length > 1 && (
                <div className="border-t border-outline-variant/10 mt-4 pt-3" />
              )}
              {campaigns.slice(1).map((c, i) => (
                <CampaignCard
                  key={c.id || i}
                  campaign={c}
                  loading={loadingCampaignId === c.id}
                  disabled={!!loadingCampaignId}
                  onLoad={() => { handleLoad(c); setShowAllCampaigns(false); }}
                  onDelete={() => handleDelete(c.id)}
                  onTogglePublish={c.source !== 'local' ? () => handleTogglePublish(c.id) : undefined}
                  onShare={c.source !== 'local' ? () => handleShare(c.id) : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Character Version Choice Modal */}
      {pendingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <CharacterChoiceModal
            campaign={pendingCampaign}
            libraryCharacter={libraryCharacter}
            onChooseCampaign={() => confirmLoad(false)}
            onChooseLibrary={() => confirmLoad(true)}
            onCancel={() => { setPendingCampaign(null); setLibraryCharacter(undefined); }}
            t={t}
            locale={i18n.language === 'pl' ? 'pl-PL' : undefined}
          />
        </div>
      )}
    </div>
    </>
  );
}
