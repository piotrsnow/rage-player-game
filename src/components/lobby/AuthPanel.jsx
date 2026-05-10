import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { storage } from '../../services/storage';
import { findLastDiceRollInScenes } from '../../services/characterHistory.js';
import { normalizeDiceRoll } from '../../utils/normalizeDiceRoll.js';
import { translateSkill } from '../../utils/rpgTranslate.js';
import { apiClient } from '../../services/apiClient';
import { elevenlabsService } from '../../services/elevenlabs';
import { SKILLS, SPECIES } from '../../data/rpgSystem';
import GlassCard from '../ui/GlassCard';

function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-2 sm:my-3 lg:my-4">
      <div className="h-px w-10 bg-gradient-to-r from-transparent to-primary/30" />
      <span className="material-symbols-outlined text-primary/30 text-[10px]">diamond</span>
      <div className="h-px w-10 bg-gradient-to-l from-transparent to-primary/30" />
    </div>
  );
}

const BADGE_SESSION_KEY = 'rpgon_badge_fetched';

function characterIdsMatch(a, b) {
  const ia = a?.backendId ?? a?.id;
  const ib = b?.backendId ?? b?.id;
  return ia != null && ib != null && String(ia) === String(ib);
}

function getCharacterId(character) {
  const id = character?.backendId ?? character?.id;
  return id != null ? String(id) : null;
}

const ATTR_LABELS = {
  sila: { icon: 'fitness_center', short: 'STR', label: 'Siła' },
  inteligencja: { icon: 'psychology', short: 'INT', label: 'Inteligencja' },
  charyzma: { icon: 'record_voice_over', short: 'CHA', label: 'Charyzma' },
  zrecznosc: { icon: 'directions_run', short: 'DEX', label: 'Zręczność' },
  wytrzymalosc: { icon: 'shield', short: 'CON', label: 'Wytrzymałość' },
  szczescie: { icon: 'casino', short: 'LCK', label: 'Szczęście' },
};

/** Material Symbols icon per skill attribute pillar — reused for all skills tied to that attribute. */
const SKILL_ATTR_ICON = {
  sila: 'swords',
  zrecznosc: 'sprint',
  inteligencja: 'menu_book',
  charyzma: 'groups',
  wytrzymalosc: 'security',
  szczescie: 'diamond',
};

const MAX_TILT = 18;
const TILT_COOLDOWN_MS = 3000;
/** Slight overshoot for return-to-neutral after drag release */
const SPRING_RESET_TRANSITION =
  'transform 0.55s cubic-bezier(0.34, 1.45, 0.56, 1)';

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStatHoloVisual(value, max = 25) {
  const safeMax = Number(max) > 0 ? Number(max) : 25;
  const normalized = clamp(Number(value) || 0, 0, safeMax) / safeMax;
  const stops = [
    { t: 0, h: 270, s: 60, l: 30 },   // dark purple
    { t: 0.33, h: 325, s: 75, l: 55 }, // pink
    { t: 0.66, h: 205, s: 80, l: 55 }, // blue
    { t: 1, h: 175, s: 65, l: 48 },    // sea teal
  ];

  let left = stops[0];
  let right = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (normalized >= stops[i].t && normalized <= stops[i + 1].t) {
      left = stops[i];
      right = stops[i + 1];
      break;
    }
  }

  const segmentLength = right.t - left.t || 1;
  const segmentT = clamp((normalized - left.t) / segmentLength, 0, 1);
  const hue = lerp(left.h, right.h, segmentT);
  const sat = lerp(left.s, right.s, segmentT);
  const lit = lerp(left.l, right.l, segmentT);

  const shimmerProgress = normalized <= 0.2 ? 0 : (normalized - 0.2) / 0.8;
  const shimmerOpacity = shimmerProgress > 0 ? lerp(0.15, 0.7, shimmerProgress) : 0;
  const shimmerDuration = shimmerProgress > 0 ? lerp(8, 3, shimmerProgress) : 0;
  return { normalized, hue, sat, lit, shimmerProgress, shimmerOpacity, shimmerDuration };
}

function getStatHoloStyle(value, max = 25) {
  const { hue, sat, lit, shimmerProgress, shimmerOpacity, shimmerDuration } = getStatHoloVisual(value, max);
  const baseColor = `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${lit.toFixed(1)}%)`;
  if (shimmerProgress <= 0) {
    return {
      '--shimmer-duration': '0s',
      '--stat-holo-gradient': 'none',
      color: baseColor,
      WebkitTextFillColor: baseColor,
      backgroundImage: 'none',
    };
  }

  const glowColor = `hsl(${hue.toFixed(1)} ${Math.min(100, sat + 6).toFixed(1)}% ${Math.min(95, lit + 16).toFixed(1)}% / ${Math.min(1, shimmerOpacity + 0.08).toFixed(2)})`;
  const shineColor = `hsl(${hue.toFixed(1)} ${Math.min(100, sat + 4).toFixed(1)}% ${Math.min(98, lit + 24).toFixed(1)}% / ${Math.min(1, shimmerOpacity + 0.14).toFixed(2)})`;
  const holoGradient = `linear-gradient(90deg, ${baseColor} 0%, ${baseColor} 18%, ${glowColor} 38%, ${shineColor} 50%, ${glowColor} 62%, ${baseColor} 82%, ${baseColor} 100%)`;

  return {
    '--shimmer-duration': `${shimmerDuration.toFixed(2)}s`,
    '--stat-holo-gradient': holoGradient,
    backgroundImage: holoGradient,
    color: baseColor,
  };
}

function getStatChipStyle(value, max = 25, highlighted = false) {
  const { normalized, hue, sat, lit } = getStatHoloVisual(value, max);
  const borderAlpha = lerp(0.45, 0.82, normalized);
  const borderColor = `hsl(${hue.toFixed(1)} ${Math.max(46, sat - 6).toFixed(1)}% ${Math.min(88, lit + 22).toFixed(1)}% / ${borderAlpha.toFixed(2)})`;
  const panelBase = `hsl(${hue.toFixed(1)} ${Math.max(20, sat - 32).toFixed(1)}% ${Math.max(7, lit - 30).toFixed(1)}% / ${lerp(0.28, 0.42, normalized).toFixed(2)})`;
  const panelTint = `hsl(${hue.toFixed(1)} ${Math.max(26, sat - 18).toFixed(1)}% ${Math.min(68, lit - 2).toFixed(1)}% / ${lerp(0.03, 0.09, normalized).toFixed(2)})`;
  const panelGlow = `hsl(${hue.toFixed(1)} ${Math.min(100, sat).toFixed(1)}% ${Math.min(84, lit + 10).toFixed(1)}% / ${lerp(0.02, 0.06, normalized).toFixed(2)})`;
  const outerGlow = `hsl(${hue.toFixed(1)} ${Math.min(100, sat + 6).toFixed(1)}% ${Math.min(95, lit + 18).toFixed(1)}% / ${(highlighted ? lerp(0.28, 0.44, normalized) : lerp(0.1, 0.24, normalized)).toFixed(2)})`;
  const backgroundImage = `linear-gradient(145deg, ${panelTint} 0%, ${panelBase} 50%, ${panelTint} 100%), radial-gradient(80% 80% at 25% 18%, ${panelGlow} 0%, transparent 75%)`;
  return {
    borderColor,
    backgroundImage,
    boxShadow: highlighted
      ? `0 0 0 1px ${borderColor}, 0 0 12px ${outerGlow}, inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)`
      : `0 0 0 1px ${borderColor}, inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)`,
  };
}

function LoggedInBanner({ user }) {
  const { t, i18n } = useTranslation();
  const { voicePools, hasApiKey } = useSettings();
  const [topChar, setTopChar] = useState(null);
  const [fullChar, setFullChar] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [badgeLegend, setBadgeLegend] = useState('');
  const [badgeSnark, setBadgeSnark] = useState('');
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [diceStats, setDiceStats] = useState(null);
  const [ttsState, setTtsState] = useState('idle');

  const cardRef = useRef(null);
  const tiltRef = useRef({ x: 0, y: 0, holoAngle: 0 });
  const hovering = useRef(false);
  const rafId = useRef(null);
  const cooldownUntilMsRef = useRef(0);
  const primaryHeldFromCardRef = useRef(false);
  const draggedWhilePrimaryRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const audioRef = useRef(null);

  const [charCount, setCharCount] = useState(0);
  const [lastLobbyDiceRoll, setLastLobbyDiceRoll] = useState(null);

  const resolveFallbackCharacter = useCallback(async (preferredId = null) => {
    let chars = [];
    try {
      chars = await apiClient.get('/characters');
    } catch {
      return null;
    }
    if (!Array.isArray(chars) || chars.length === 0) return null;
    const preferred = preferredId
      ? chars.find((candidate) => getCharacterId(candidate) === String(preferredId))
      : null;
    if (preferred) return preferred;
    const sorted = [...chars].sort(
      (a, b) => (b.characterLevel || b.level || 1) - (a.characterLevel || a.level || 1),
    );
    return sorted[0] || null;
  }, []);

  useEffect(() => {
    const chars = storage.getCharacters();
    setCharCount(chars.length);
    if (chars.length > 0) {
      const sorted = [...chars].sort(
        (a, b) => (b.characterLevel || 1) - (a.characterLevel || 1),
      );
      setTopChar(sorted[0]);
    }
  }, []);

  const refreshLastLobbyDice = useCallback(() => {
    if (!topChar) {
      setLastLobbyDiceRoll(null);
      return;
    }
    const snap = storage.loadLocalSnapshot();
    const snapChar = snap?.character;
    if (!snapChar || !characterIdsMatch(snapChar, topChar)) {
      setLastLobbyDiceRoll(null);
      return;
    }
    setLastLobbyDiceRoll(findLastDiceRollInScenes(snap?.scenes));
  }, [topChar]);

  useEffect(() => {
    refreshLastLobbyDice();
  }, [refreshLastLobbyDice]);

  useEffect(() => {
    const onFocus = () => refreshLastLobbyDice();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshLastLobbyDice]);

  const fetchBadge = useCallback(async (charId, force = false, canRetryFallback = true) => {
    if (!charId || !apiClient.isConnected()) return;
    setBadgeLoading(true);
    try {
      const res = await apiClient.post(`/characters/${charId}/badge`, {
        force,
        language: i18n.language || 'pl',
      });
      if (res?.legend) setBadgeLegend(res.legend);
      if (res?.snark) setBadgeSnark(res.snark);
      if (res?.diceStats) setDiceStats(res.diceStats);
      sessionStorage.setItem(BADGE_SESSION_KEY, '1');
    } catch (error) {
      const message = String(error?.message || '');
      if (canRetryFallback && message.includes('Character not found')) {
        const fallback = await resolveFallbackCharacter();
        if (!fallback) {
          setTopChar(null);
          setFullChar(null);
          setBadgeLegend('');
          setBadgeSnark('');
          setDiceStats(null);
          setBadgeLoading(false);
          return;
        }
        const fallbackId = getCharacterId(fallback);
        if (fallbackId && fallbackId !== String(charId)) {
          setTopChar(fallback);
          await fetchBadge(fallbackId, force, false);
          return;
        }
      }
    }
    setBadgeLoading(false);
  }, [i18n.language, resolveFallbackCharacter]);

  useEffect(() => {
    if (!topChar) return;
    const charId = getCharacterId(topChar);
    const alreadyFetched = sessionStorage.getItem(BADGE_SESSION_KEY);
    fetchBadge(charId, !alreadyFetched);
  }, [topChar, fetchBadge]);

  // Pull the full character snapshot (skills, etc.) — list endpoint stubs
  // skills:{} for performance, so we need this extra hop to render the
  // skills grid alongside attributes.
  useEffect(() => {
    if (!topChar || !apiClient.isConnected()) return;
    const charId = getCharacterId(topChar);
    if (!charId) return;
    let cancelled = false;
    apiClient.get(`/characters/${charId}`)
      .then((data) => { if (!cancelled && data) setFullChar(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [topChar]);

  const handleRefresh = (e) => {
    e.stopPropagation();
    if (!topChar || badgeLoading) return;
    fetchBadge(getCharacterId(topChar), true);
  };

  const stopSnarkAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      try { a.pause(); } catch {}
      try { a.removeAttribute('src'); a.load(); } catch {}
      audioRef.current = null;
    }
    setTtsState('idle');
  }, []);

  const handlePlaySnark = useCallback(async (e) => {
    e.stopPropagation();
    if (ttsState === 'playing' || ttsState === 'loading') {
      stopSnarkAudio();
      return;
    }
    const text = (badgeSnark || '').trim();
    if (!text) return;
    const voiceId = voicePools?.narratorVoiceId;
    const provider = 'elevenlabs';
    if (!voiceId || !hasApiKey(provider)) {
      setTtsState('error');
      setTimeout(() => setTtsState('idle'), 2000);
      return;
    }
    setTtsState('loading');
    try {
      const { audioUrl } = await elevenlabsService.textToSpeechWithTimestamps(
        undefined, voiceId, text, undefined, null, null,
      );
      if (!audioUrl) throw new Error('no audio url');
      const resolved = apiClient.resolveMediaUrl(audioUrl);
      const audio = new Audio(resolved);
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setTtsState('idle');
        }
      });
      audio.addEventListener('error', () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setTtsState('error');
          setTimeout(() => setTtsState('idle'), 2000);
        }
      });
      await audio.play();
      setTtsState('playing');
    } catch {
      audioRef.current = null;
      setTtsState('error');
      setTimeout(() => setTtsState('idle'), 2000);
    }
  }, [badgeSnark, ttsState, stopSnarkAudio, voicePools, hasApiKey]);

  useEffect(() => () => stopSnarkAudio(), [stopSnarkAudio]);

  const applyTilt = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const inner = el.querySelector('.flip-card-inner');
    if (!inner) return;
    const { x, y, holoAngle } = tiltRef.current;
    const flipBase = flipped ? 180 : 0;
    inner.style.transform = `rotateY(${flipBase + y}deg) rotateX(${x}deg)`;
    inner.style.setProperty('--holo-angle', `${holoAngle}deg`);
  }, [flipped]);

  const handlePointerMove = useCallback((e) => {
    if ((e.buttons & 1) !== 0) {
      draggedWhilePrimaryRef.current = true;
      return;
    }
    if (Date.now() < cooldownUntilMsRef.current) return;

    const el = cardRef.current;
    if (!el) return;
    const inner = el.querySelector('.flip-card-inner');
    if (inner) inner.style.transition = 'transform 0.1s ease-out';

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const offsetX = e.clientX - cx;
    const offsetY = e.clientY - cy;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    tiltRef.current = {
      x: -(offsetY / halfH) * MAX_TILT,
      y: (offsetX / halfW) * MAX_TILT,
      holoAngle: Math.atan2(offsetY, offsetX) * (180 / Math.PI) + 180,
    };
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        applyTilt();
        rafId.current = null;
      });
    }
  }, [applyTilt]);

  const handlePointerEnter = useCallback(() => {
    hovering.current = true;
    const inner = cardRef.current?.querySelector('.flip-card-inner');
    if (inner) inner.style.transition = 'transform 0.1s ease-out';
  }, []);

  const handlePointerLeave = useCallback(() => {
    hovering.current = false;
    tiltRef.current = { x: 0, y: 0, holoAngle: tiltRef.current.holoAngle };
    const inner = cardRef.current?.querySelector('.flip-card-inner');
    if (inner) {
      inner.style.transition = 'transform 0.5s ease-out';
      const flipBase = flipped ? 180 : 0;
      inner.style.transform = `rotateY(${flipBase}deg) rotateX(0deg)`;
    }
  }, [flipped]);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    primaryHeldFromCardRef.current = true;
    draggedWhilePrimaryRef.current = false;
  }, []);

  const handleWindowPointerUp = useCallback((e) => {
    const isCancel = e.type === 'pointercancel';
    if (!isCancel && e.button !== 0) return;
    if (!primaryHeldFromCardRef.current) return;
    primaryHeldFromCardRef.current = false;

    const didDrag = draggedWhilePrimaryRef.current;
    draggedWhilePrimaryRef.current = false;

    if (!didDrag) return;

    suppressNextClickRef.current = true;
    cooldownUntilMsRef.current = Date.now() + TILT_COOLDOWN_MS;

    tiltRef.current = { x: 0, y: 0, holoAngle: 0 };
    const inner = cardRef.current?.querySelector('.flip-card-inner');
    if (inner) {
      inner.style.transition = SPRING_RESET_TRANSITION;
      const flipBase = flipped ? 180 : 0;
      inner.style.transform = `rotateY(${flipBase}deg) rotateX(0deg)`;
      inner.style.setProperty('--holo-angle', '0deg');
    }
  }, [flipped]);

  useEffect(() => {
    const onUp = (e) => {
      handleWindowPointerUp(e);
    };
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [handleWindowPointerUp]);

  const handleClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setFlipped((f) => {
      const next = !f;
      const inner = cardRef.current?.querySelector('.flip-card-inner');
      if (inner) {
        inner.style.transition = 'transform 0.7s cubic-bezier(0.4, 0.0, 0.2, 1)';
        const { x, y } = hovering.current ? tiltRef.current : { x: 0, y: 0 };
        const flipBase = next ? 180 : 0;
        inner.style.transform = `rotateY(${flipBase + y}deg) rotateX(${x}deg)`;
      }
      return next;
    });
  }, []);

  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current); }, []);

  const [recentHovered, setRecentHovered] = useState([]);

  const handleChipHover = useCallback((chip) => {
    setRecentHovered((prev) => [chip, ...prev.filter((c) => c.key !== chip.key)].slice(0, 3));
  }, []);

  const displayName = topChar?.name || t('lobby.adventurer');
  const level = topChar?.characterLevel || topChar?.level || 1;
  const species = topChar?.species;
  const speciesLabel = species ? (SPECIES[species]?.name || species) : null;
  const portraitRaw = fullChar?.portraitUrl || topChar?.portraitUrl;
  const portraitSrc = portraitRaw
    ? apiClient.resolveMediaUrl(portraitRaw)
    : null;
  const attrs = (fullChar?.attributes || topChar?.attributes) || null;

  const skillsObj = fullChar?.skills && typeof fullChar.skills === 'object' ? fullChar.skills : {};
  const attrChips = attrs && typeof attrs === 'object'
    ? Object.entries(ATTR_LABELS).flatMap(([key, meta]) => {
        const val = attrs[key];
        if (val == null) return [];
        return [{
          kind: 'attr',
          key: `attr-${key}`,
          icon: meta.icon,
          label: meta.label,
          value: val,
        }];
      })
    : [];
  const skillChips = SKILLS.flatMap((s) => {
    const entry = skillsObj[s.name];
    const lvl = typeof entry === 'number' ? entry : Number(entry?.level || 0);
    if (!lvl || lvl <= 0) return [];
    return [{
      kind: 'skill',
      key: `skill-${s.name}`,
      icon: SKILL_ATTR_ICON[s.attribute] || 'auto_awesome',
      label: s.name,
      value: lvl,
    }];
  });
  const statChips = [...attrChips, ...skillChips];

  const highlightedKey = recentHovered[0]?.key || null;

  const ttsAvailable = !!(voicePools?.narratorVoiceId && hasApiKey('elevenlabs'));
  const ttsBusy = ttsState === 'loading' || ttsState === 'playing';

  const ndLastLobby = normalizeDiceRoll(lastLobbyDiceRoll);
  const lastRollSummary = ndLastLobby
    ? (() => {
        const skill = translateSkill(ndLastLobby.skill, t);
        const th = ndLastLobby.threshold;
        const mark = ndLastLobby.success ? '✓' : '✗';
        return th != null
          ? `${skill} ${ndLastLobby.roll} vs ${th} ${mark}`
          : `${skill} ${ndLastLobby.roll} ${mark}`;
      })()
    : null;
  const successRate = diceStats?.totalRolls > 0 ? diceStats.successes / diceStats.totalRolls : 0;
  const avgRoll = Number(diceStats?.avgRoll) || 0;
  const diceChips = diceStats && diceStats.totalRolls > 0
    ? [
        {
          icon: 'casino',
          value: diceStats.totalRolls,
          label: `Rzuty: ${diceStats.totalRolls}`,
          border: 'border-primary/20',
          hoverBorder: 'hover:border-primary/45',
          statValue: Math.min((diceStats.totalRolls || 0) / 4, 25),
        },
        {
          icon: 'check_circle',
          value: `${Math.round(successRate * 100)}%`,
          label: `Sukces: ${diceStats.successes}/${diceStats.totalRolls}`,
          border: 'border-emerald-500/20',
          hoverBorder: 'hover:border-emerald-500/45',
          statValue: successRate * 25,
        },
        {
          icon: 'bar_chart',
          value: diceStats.avgRoll,
          label: `Średni rzut: ${diceStats.avgRoll}`,
          border: 'border-tertiary/20',
          hoverBorder: 'hover:border-tertiary/45',
          statValue: (1 - clamp(avgRoll, 0, 50) / 50) * 25,
        },
        {
          icon: 'star',
          value: diceStats.critSuccesses,
          label: `Kryty (1): ${diceStats.critSuccesses}`,
          border: 'border-amber-500/20',
          hoverBorder: 'hover:border-amber-500/45',
          statValue: Math.min((diceStats.critSuccesses || 0) * 5, 25),
        },
        {
          icon: 'dangerous',
          value: diceStats.critFailures,
          label: `Fumble (50): ${diceStats.critFailures}`,
          border: 'border-error/20',
          hoverBorder: 'hover:border-error/45',
          statValue: Math.min((diceStats.critFailures || 0) * 5, 25),
        },
        ...(diceStats.bestSkill
          ? [{
              icon: 'trending_up',
              value: '',
              label: `Najlepsza: ${diceStats.bestSkill}`,
              border: 'border-emerald-500/20',
              hoverBorder: 'hover:border-emerald-500/45',
              statValue: 20,
            }]
          : []),
        ...(diceStats.worstSkill
          ? [{
              icon: 'trending_down',
              value: '',
              label: `Najgorsza: ${diceStats.worstSkill}`,
              border: 'border-error/20',
              hoverBorder: 'hover:border-error/45',
              statValue: 20,
            }]
          : []),
      ]
    : [];

  if (!topChar) {
    return null;
  }

  return (
    <div
      ref={cardRef}
      data-testid="logged-in-banner"
      className="flip-card w-full"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div className="flip-card-inner" style={{ aspectRatio: '1.586 / 1' }}>
        {/* ===== FRONT ===== */}
        <div className="flip-card-front holo-card p-3 sm:p-5 lg:p-8 flex flex-col overflow-hidden">
          {/* Header: portrait + identity */}
          <div className="flex gap-3 sm:gap-4 lg:gap-5 items-start mb-1 sm:mb-2 lg:mb-3">
            <div className="badge-portrait-frame w-20 sm:w-28 lg:w-36 shrink-0 rounded-lg overflow-visible bg-surface-container-lowest/60 flex items-center justify-center aspect-[3/4]">
              {portraitSrc ? (
                <img
                  src={portraitSrc}
                  alt={displayName}
                  className="w-full h-full object-cover rounded-lg badge-portrait-hologram"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <span className="material-symbols-outlined text-6xl text-primary/40">person</span>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h2 className="font-headline text-xl sm:text-2xl lg:text-4xl text-tertiary tracking-wide truncate leading-tight mb-1 sm:mb-2 lg:mb-3">
                {displayName}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-7 sm:h-8 lg:h-9 rounded-full bg-primary/10 border border-primary/25 text-xs sm:text-sm font-headline">
                  <span className="material-symbols-outlined text-sm sm:text-lg text-primary">star</span>
                  <span className="text-on-surface-variant/80 text-[10px] sm:text-xs uppercase tracking-wider">Lvl</span>
                  <span className="text-on-surface font-headline">{level}</span>
                </span>
                {speciesLabel && (
                  <span className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-7 sm:h-8 lg:h-9 rounded-full bg-primary/10 border border-primary/25 text-xs sm:text-sm font-headline">
                    <span className="material-symbols-outlined text-sm sm:text-lg text-primary">groups</span>
                    <span className="text-on-surface-variant/80 text-[10px] sm:text-xs uppercase tracking-wider">{speciesLabel}</span>
                  </span>
                )}
              </div>

              {/* Legend (AI-generated) — directly below lvl/species */}
              {badgeLegend && (
                <p className="mt-1 sm:mt-2 lg:mt-3 text-xs sm:text-sm leading-snug italic animate-text-shimmer">
                  &ldquo;{badgeLegend}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Stats grid — full badge width, with tooltip on hover */}
          {statChips.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:gap-1.5 lg:gap-2 mb-2 sm:mb-3 lg:mb-4">
              {statChips.map((chip) => (
                <div
                  key={chip.key}
                  onPointerEnter={() => handleChipHover(chip)}
                  className={[
                    'group relative flex items-center h-8 w-8 sm:h-9 sm:w-9 lg:h-11 lg:w-11 rounded-md justify-center',
                    'border',
                    'transition-[border-color,box-shadow,filter] duration-200 ease-out hover:brightness-110',
                  ].join(' ')}
                  style={getStatChipStyle(chip.value, 25, highlightedKey === chip.key)}
                >
                  <span
                    className="material-symbols-outlined stat-icon-holo text-base sm:text-lg lg:text-xl"
                    style={getStatHoloStyle(chip.value)}
                  >
                    {chip.icon}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-headline text-on-surface bg-surface-dim/80 rounded px-0.5 leading-tight">
                    {chip.value}
                  </span>
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap px-4 py-2 rounded bg-surface-dim/95 border border-primary/25 text-xl text-on-surface font-headline shadow-lg z-50">
                    {chip.label} {chip.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {badgeLoading && !badgeLegend && (
            <div className="flex-1 flex items-center justify-center gap-2.5 text-outline/30 text-base">
              <span className="material-symbols-outlined text-lg animate-spin">sync</span>
              {t('common.loading')}
            </div>
          )}

          {/* Footer (awers) */}
          <div className="flex items-center gap-2 sm:gap-3 mt-auto pt-2 sm:pt-3 lg:pt-4 border-t border-outline-variant/8">
         
            {lastRollSummary && (
              <span
                className="min-w-0 flex-1 inline-flex items-center gap-1.5 text-xs text-on-surface-variant/70"
                title={lastRollSummary}
              >
                <span className="material-symbols-outlined text-sm text-primary/40 shrink-0">casino</span>
                <span className="truncate">
                  <span className="text-on-surface-variant/50">{t('lobby.lastRollShort', 'Ostatni rzut:')}</span>
                  {' '}
                  <span className="font-headline text-on-surface-variant/85">{lastRollSummary}</span>
                </span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={handleRefresh}
                title={t('lobby.refreshBadge', 'Refresh')}
                className="text-outline/30 hover:text-primary transition-colors"
              >
                <span className={`material-symbols-outlined text-lg ${badgeLoading ? 'animate-spin' : ''}`}>refresh</span>
              </button>
            </div>
          </div>

          {/* Flip hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-outline/20 font-label uppercase tracking-widest flex items-center gap-1.5 pointer-events-none">
            <span className="material-symbols-outlined text-sm">360</span>
            {t('lobby.flipHint', 'Click to flip')}
          </div>
        </div>

        {/* ===== BACK — snark + dice stats ===== */}
        <div className="flip-card-back holo-card p-3 sm:p-5 lg:p-8 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-2.5 mb-1 sm:mb-2">
            <h3 className="font-headline text-tertiary text-base sm:text-lg lg:text-xl flex items-center gap-2 sm:gap-2.5">
              <span className="material-symbols-outlined text-primary-dim text-xl sm:text-2xl">theater_comedy</span>
              {t('lobby.snarkTitle', 'Twoje wybryki')}
            </h3>
            {ttsAvailable && (
              <button
                type="button"
                onClick={handlePlaySnark}
                disabled={!badgeSnark}
                title={ttsBusy ? t('lobby.stopSnark', 'Zatrzymaj') : t('lobby.playSnark', 'Posłuchaj')}
                className={[
                  'ml-auto inline-flex items-center justify-center w-9 h-9 rounded-full',
                  'border border-primary/25 bg-primary/8 hover:bg-primary/15 hover:border-primary/45',
                  'text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed',
                ].join(' ')}
              >
                <span className={`material-symbols-outlined text-lg ${ttsState === 'loading' ? 'animate-spin' : ''}`}>
                  {ttsState === 'loading' ? 'sync' : ttsState === 'playing' ? 'stop_circle' : 'volume_up'}
                </span>
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center text-center">
            {badgeSnark ? (
              <p className="text-sm sm:text-base leading-relaxed italic animate-text-shimmer max-w-md">
                {badgeSnark}
              </p>
            ) : badgeLoading ? (
              <div className="flex items-center justify-center gap-2.5 text-outline/30 text-base py-4">
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                {t('common.loading')}
              </div>
            ) : (
              <div className="text-on-surface-variant/40 py-4">
                <span className="material-symbols-outlined text-4xl text-outline/15 block mb-3">sentiment_neutral</span>
                <p className="text-base">{t('lobby.snarkEmpty', 'Brak materiału do drwin... na razie.')}</p>
              </div>
            )}
            {ttsState === 'error' && (
              <p className="mt-2 text-xs text-error/70">
                {t('lobby.snarkTtsError', 'Nie udało się odtworzyć narracji.')}
              </p>
            )}
          </div>

          {diceChips.length > 0 && (
            <div className="mt-auto">
              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                {diceChips.map((chip) => (
                  <div
                    key={chip.icon}
                    className={`group relative flex items-center h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 rounded-md justify-center border transition-[border-color,box-shadow,filter] duration-200 ease-out hover:brightness-110 ${chip.border} ${chip.hoverBorder}`}
                    style={getStatChipStyle(chip.statValue)}
                  >
                    <span
                      className="material-symbols-outlined stat-icon-holo text-lg sm:text-xl lg:text-2xl"
                      style={getStatHoloStyle(chip.statValue)}
                    >
                      {chip.icon}
                    </span>
                    {chip.value !== '' && (
                      <span className="absolute -bottom-0.5 -right-0.5 text-[10px] font-headline text-on-surface bg-surface-dim/80 rounded px-0.5 leading-tight">
                        {chip.value}
                      </span>
                    )}
                    <span className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap px-4 py-2 rounded bg-surface-dim/95 border border-primary/25 text-xl text-on-surface font-headline shadow-lg z-50">
                      {chip.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SessionCheckBanner() {
  const { t } = useTranslation();

  return (
    <div className="text-center py-6">
      <span className="material-symbols-outlined text-primary/50 text-4xl mb-3 block animate-spin">
        progress_activity
      </span>
      <h3 className="font-headline text-tertiary text-lg tracking-wide">
        {t('common.loading')}
      </h3>
    </div>
  );
}

function LoginForm() {
  const { t } = useTranslation();
  const { backendLogin, backendRegister, settings } = useSettings();

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const defaultUrl = isLocalhost ? 'http://localhost:3001' : window.location.origin;

  const [serverUrl, setServerUrl] = useState(() => settings?.backendUrl || defaultUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const canSubmit = serverUrl.trim() && email && password && !loading;

  useEffect(() => {
    setServerUrl(settings?.backendUrl || defaultUrl);
  }, [settings?.backendUrl, defaultUrl]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await backendLogin(serverUrl.trim(), email, password);
      setSuccess(t('settings.backendLoginSuccess'));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setSuccess(null);
    if (password.length < 6) {
      setError(t('settings.backendPasswordTooShort'));
      return;
    }
    setLoading(true);
    try {
      await backendRegister(serverUrl.trim(), email, password);
      setSuccess(t('settings.backendRegisterSuccess'));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) handleLogin();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto" autoComplete="on">
      <div className="text-center mb-3 sm:mb-4 lg:mb-6">
        <span className="material-symbols-outlined text-primary/40 text-3xl sm:text-4xl mb-1.5 sm:mb-2 block">
          shield_person
        </span>
        <h3 className="font-headline text-tertiary text-base sm:text-lg tracking-wide">
          {t('lobby.loginTitle')}
        </h3>
        <p className="text-on-surface-variant/50 text-[10px] sm:text-xs mt-1 max-w-xs mx-auto">
          {t('lobby.loginSubtitle')}
        </p>
      </div>

      <OrnamentalDivider />

      <input type="hidden" name="serverUrl" value={serverUrl} readOnly />

      <div className="space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="auth-email" className="block text-[10px] text-on-surface-variant/60 font-label uppercase tracking-widest mb-1.5">
            {t('settings.backendEmail')}
          </label>
          <input
            id="auth-email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full bg-transparent border-0 border-b border-outline-variant/15 focus:border-primary/40 focus:ring-0 text-sm py-2.5 px-1 placeholder:text-on-surface-variant/60 font-mono text-on-surface"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-[10px] text-on-surface-variant/60 font-label uppercase tracking-widest mb-1.5">
            {t('settings.backendPassword')}
          </label>
          <input
            id="auth-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            minLength={6}
            className="w-full bg-transparent border-0 border-b border-outline-variant/15 focus:border-primary/40 focus:ring-0 text-sm py-2.5 px-1 placeholder:text-on-surface-variant/60 text-on-surface-variant"
          />
          <p className="text-[10px] text-outline/30 mt-1">{t('settings.backendPasswordHint')}</p>
        </div>

        <div className="flex gap-3 pt-1 sm:pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-2 sm:py-3 rounded-sm border bg-surface-tint/10 border-primary/25 text-primary text-[10px] sm:text-xs font-headline uppercase tracking-widest hover:bg-surface-tint/20 hover:border-primary/40 transition-all disabled:opacity-30 disabled:hover:bg-surface-tint/10"
          >
            {loading ? t('common.loading') : t('settings.backendLogin')}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={!canSubmit}
            className="flex-1 py-2 sm:py-3 rounded-sm border border-outline-variant/15 text-on-surface-variant text-[10px] sm:text-xs font-headline uppercase tracking-widest hover:border-primary/25 hover:text-primary transition-all disabled:opacity-30"
          >
            {t('settings.backendRegister')}
          </button>
        </div>

        {error && (
          <div data-testid="auth-error" className="flex items-center gap-2 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-xs font-headline animate-slide-up">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}
        {success && (
          <div data-testid="auth-success" className="flex items-center gap-2 p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs font-headline animate-slide-up">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            {success}
          </div>
        )}
      </div>
    </form>
  );
}

export default function AuthPanel() {
  const { backendUser, backendAuthChecking } = useSettings();

  if (!backendAuthChecking && backendUser) {
    return (
      <div className="w-full animate-slide-up relative z-10" style={{ animationDelay: '0.1s' }}>
        <LoggedInBanner user={backendUser} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-slide-up relative z-10" style={{ animationDelay: '0.1s' }}>
      <GlassCard elevated className="p-4 sm:p-6 md:p-8 lg:p-10">
        {backendAuthChecking ? (
          <SessionCheckBanner />
        ) : (
          <LoginForm />
        )}
      </GlassCard>
    </div>
  );
}
