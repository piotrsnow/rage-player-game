import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { storage } from '../../services/storage';
import { apiClient } from '../../services/apiClient';
import { elevenlabsService } from '../../services/elevenlabs';
import { SKILLS, SPECIES } from '../../data/rpgSystem';
import GlassCard from '../ui/GlassCard';

function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-4">
      <div className="h-px w-10 bg-gradient-to-r from-transparent to-primary/30" />
      <span className="material-symbols-outlined text-primary/30 text-[10px]">diamond</span>
      <div className="h-px w-10 bg-gradient-to-l from-transparent to-primary/30" />
    </div>
  );
}

const BADGE_SESSION_KEY = 'rpgon_badge_fetched';

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

function LoggedInBanner({ user }) {
  const { t, i18n } = useTranslation();
  const { voicePools, hasApiKey } = useSettings();
  const [topChar, setTopChar] = useState(null);
  const [fullChar, setFullChar] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [badgeLegend, setBadgeLegend] = useState('');
  const [badgeSnark, setBadgeSnark] = useState('');
  const [badgeLoading, setBadgeLoading] = useState(false);
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

  useEffect(() => {
    const chars = storage.getCharacters();
    if (chars.length > 0) {
      const sorted = [...chars].sort(
        (a, b) => (b.characterLevel || 1) - (a.characterLevel || 1),
      );
      setTopChar(sorted[0]);
    }
  }, []);

  const fetchBadge = useCallback(async (charId, force = false) => {
    if (!charId || !apiClient.isConnected()) return;
    setBadgeLoading(true);
    try {
      const res = await apiClient.post(`/characters/${charId}/badge`, {
        force,
        language: i18n.language || 'pl',
      });
      if (res?.legend) setBadgeLegend(res.legend);
      if (res?.snark) setBadgeSnark(res.snark);
      sessionStorage.setItem(BADGE_SESSION_KEY, '1');
    } catch {}
    setBadgeLoading(false);
  }, [i18n.language]);

  useEffect(() => {
    if (!topChar) return;
    const charId = topChar.backendId || topChar.id;
    const alreadyFetched = sessionStorage.getItem(BADGE_SESSION_KEY);
    fetchBadge(charId, !alreadyFetched);
  }, [topChar, fetchBadge]);

  // Pull the full character snapshot (skills, etc.) — list endpoint stubs
  // skills:{} for performance, so we need this extra hop to render the
  // skills grid alongside attributes.
  useEffect(() => {
    if (!topChar || !apiClient.isConnected()) return;
    const charId = topChar.backendId || topChar.id;
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
    fetchBadge(topChar.backendId || topChar.id, true);
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
  const portraitSrc = topChar?.portraitUrl
    ? apiClient.resolveMediaUrl(topChar.portraitUrl)
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
        <div className="flip-card-front holo-card p-8 flex flex-col overflow-hidden">
          {/* Header: portrait + identity */}
          <div className="flex gap-5 items-start mb-3">
            <div className="badge-portrait-frame w-36 shrink-0 rounded-lg overflow-visible bg-surface-container-lowest/60 flex items-center justify-center aspect-[3/4]">
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
              <h2 className="font-headline text-4xl text-tertiary tracking-wide truncate leading-tight mb-3">
                {displayName}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-sm font-headline">
                  <span className="material-symbols-outlined text-lg text-primary">star</span>
                  <span className="text-on-surface-variant/80 text-xs uppercase tracking-wider">Lvl</span>
                  <span className="text-on-surface font-headline">{level}</span>
                </span>
                {speciesLabel && (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-sm font-headline">
                    <span className="material-symbols-outlined text-lg text-primary">groups</span>
                    <span className="text-on-surface-variant/80 text-xs uppercase tracking-wider">{speciesLabel}</span>
                  </span>
                )}
              </div>

              {/* Legend (AI-generated) — directly below lvl/species */}
              {badgeLegend && (
                <p className="mt-3 text-base leading-relaxed italic animate-text-shimmer">
                  &ldquo;{badgeLegend}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Stats grid — full badge width, with tooltip on hover */}
          {statChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {statChips.map((chip) => (
                <div
                  key={chip.key}
                  onPointerEnter={() => handleChipHover(chip)}
                  className={[
                    'group relative flex items-center h-11 w-11 rounded-md justify-center',
                    'border',
                    'bg-gradient-to-br from-primary/10 via-tertiary/5 to-primary/10',
                    'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
                    'transition-[border-color,box-shadow] duration-200 ease-out',
                    highlightedKey === chip.key
                      ? 'border-primary/60 shadow-[0_0_10px_rgba(197,154,255,0.3)]'
                      : 'border-primary/20 hover:border-primary/45',
                  ].join(' ')}
                >
                  <span className={`material-symbols-outlined text-xl ${chip.kind === 'attr' ? 'text-primary' : 'text-tertiary/80'}`}>
                    {chip.icon}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-headline text-on-surface bg-surface-dim/80 rounded px-0.5 leading-tight">
                    {chip.value}
                  </span>
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap px-2 py-1 rounded bg-surface-dim/95 border border-primary/25 text-[10px] text-on-surface font-headline shadow-lg z-50">
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

          {/* Footer */}
          <div className="flex items-center gap-3 mt-auto pt-4 border-t border-outline-variant/8">
            {user?.email && (
              <span className="text-outline/40 text-sm font-mono truncate">{user.email}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
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

        {/* ===== BACK — snarky exploits + narrator ===== */}
        <div className="flip-card-back holo-card p-8 flex flex-col justify-center overflow-hidden">
          <h3 className="font-headline text-tertiary text-xl flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary-dim text-2xl">theater_comedy</span>
            {t('lobby.snarkTitle', 'Twoje wybryki')}
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
          </h3>

          <OrnamentalDivider />

          {/* Legend on back — holo style */}
          {badgeLegend && (
            <p className="text-base leading-relaxed italic animate-text-shimmer text-center mb-4">
              &ldquo;{badgeLegend}&rdquo;
            </p>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col justify-center">
            {badgeSnark ? (
              <p className="text-base leading-relaxed italic animate-text-shimmer">
                {badgeSnark}
              </p>
            ) : badgeLoading ? (
              <div className="flex items-center justify-center gap-2.5 text-outline/30 text-base py-8">
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                {t('common.loading')}
              </div>
            ) : (
              <div className="text-center text-on-surface-variant/40 py-8">
                <span className="material-symbols-outlined text-4xl text-outline/15 block mb-3">sentiment_neutral</span>
                <p className="text-base">{t('lobby.snarkEmpty', 'Brak materiału do drwin... na razie.')}</p>
              </div>
            )}
            {ttsState === 'error' && (
              <p className="mt-3 text-xs text-error/70">
                {t('lobby.snarkTtsError', 'Nie udało się odtworzyć narracji.')}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-4 border-t border-outline-variant/8">
            <span className="text-[10px] text-outline/20 font-label uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">360</span>
              {t('lobby.flipBack', 'Click to flip back')}
            </span>
          </div>
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
      <div className="text-center mb-6">
        <span className="material-symbols-outlined text-primary/40 text-4xl mb-2 block">
          shield_person
        </span>
        <h3 className="font-headline text-tertiary text-lg tracking-wide">
          {t('lobby.loginTitle')}
        </h3>
        <p className="text-on-surface-variant/50 text-xs mt-1 max-w-xs mx-auto">
          {t('lobby.loginSubtitle')}
        </p>
      </div>

      <OrnamentalDivider />

      <input type="hidden" name="serverUrl" value={serverUrl} readOnly />

      <div className="space-y-4">
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

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-sm border bg-surface-tint/10 border-primary/25 text-primary text-xs font-headline uppercase tracking-widest hover:bg-surface-tint/20 hover:border-primary/40 transition-all disabled:opacity-30 disabled:hover:bg-surface-tint/10"
          >
            {loading ? t('common.loading') : t('settings.backendLogin')}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-sm border border-outline-variant/15 text-on-surface-variant text-xs font-headline uppercase tracking-widest hover:border-primary/25 hover:text-primary transition-all disabled:opacity-30"
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
      <GlassCard elevated className="p-8 md:p-10">
        {backendAuthChecking ? (
          <SessionCheckBanner />
        ) : (
          <LoginForm />
        )}
      </GlassCard>
    </div>
  );
}
