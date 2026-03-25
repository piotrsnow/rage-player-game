import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { useModals } from '../../contexts/ModalContext';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';

export default function Header() {
  const location = useLocation();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const music = useGlobalMusic();
  const { openCharacterSheet, openSettings, openKeys } = useModals();
  const { state } = useGame();
  const mp = useMultiplayer();
  const hasActiveGame = !!state.campaign || (mp.state.isMultiplayer && mp.state.phase === 'playing');

  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target)) {
        setVolumeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navLinks = [
    { path: '/', label: t('nav.lobby') },
    hasActiveGame && { path: '/play', label: t('nav.grimoire') },
    { path: '/character', label: t('nav.armory'), action: openCharacterSheet },
  ].filter(Boolean);

  const vol = settings.musicVolume ?? 40;

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0e0e10]/80 backdrop-blur-xl border-b border-[#48474a]/10 flex justify-between items-center px-6 h-16">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(197,154,255,0.5)]"
        >
          <img src={t('common.logoPath', '/nikczemnu_logo.png')} alt={t('common.appName')} className="h-[6.5rem] w-auto relative top-2 left-2" />
        </Link>
      </div>
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex gap-1 items-center text-on-surface-variant font-label text-sm tracking-widest uppercase">
          {navLinks.map((link) =>
            link.action ? (
              <button
                key={link.path}
                onClick={link.action}
                className="relative px-4 py-2 transition-colors duration-300 hover:text-tertiary rounded-sm hover:bg-surface-container-high/30"
              >
                {link.label}
              </button>
            ) : (
              <Link
                key={link.path}
                to={link.path}
                className={`relative px-4 py-2 transition-all duration-300 rounded-sm ${
                  location.pathname === link.path
                    ? 'text-primary'
                    : 'hover:text-tertiary hover:bg-surface-container-high/30'
                }`}
              >
                {link.label}
                {location.pathname === link.path && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(197,154,255,0.6)]" />
                )}
              </Link>
            )
          )}
        </nav>

        {/* Global Music Controls */}
        {settings.localMusicEnabled && music.hasMusic && (
          <div className="flex items-center gap-2">
            <button
              onClick={music.togglePlayPause}
              className="material-symbols-outlined text-lg text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              title={music.isPlaying ? t('common.pause', 'Pause') : t('common.play', 'Play')}
            >
              {music.isPlaying ? 'pause' : 'play_arrow'}
            </button>
            <button
              onClick={music.skip}
              className="material-symbols-outlined text-base text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
              title={t('gameplay.musicSkip', 'Next')}
            >
              skip_next
            </button>
            <div className="relative" ref={volumeRef}>
              <button
                onClick={() => setVolumeOpen((v) => !v)}
                className="material-symbols-outlined text-base text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                title={t('settings.musicVolume', 'Volume')}
              >
                {vol === 0 ? 'volume_off' : vol < 40 ? 'volume_down' : 'volume_up'}
              </button>
              {volumeOpen && (
                <div className="absolute right-0 top-full mt-2 px-3 py-2 rounded-sm bg-surface-container-high/95 backdrop-blur-xl border border-outline-variant/15 shadow-xl flex items-center gap-2 animate-scale-in">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={vol}
                    onChange={(e) => music.setVolume(Number(e.target.value))}
                    className="w-24 h-1 accent-primary cursor-pointer"
                  />
                  <span className="text-[10px] text-on-surface-variant font-mono w-7 text-right">{vol}%</span>
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

        <div className="flex items-center gap-1">
          {hasActiveGame && (
            <Link
              to="/play"
              aria-label={t('nav.play')}
              className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
            >
              auto_awesome
            </Link>
          )}
          <button
            type="button"
            onClick={openKeys}
            aria-label={t('nav.keys')}
            className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
          >
            vpn_key
          </button>
          <button
            type="button"
            onClick={openSettings}
            aria-label={t('nav.settings')}
            className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
          >
            settings
          </button>
          <button
            type="button"
            onClick={openCharacterSheet}
            aria-label={t('nav.character')}
            className="w-9 h-9 rounded-full border border-primary/20 overflow-hidden bg-surface-container-high flex items-center justify-center hover:border-primary/40 hover:shadow-[0_0_12px_rgba(197,154,255,0.2)] transition-all duration-300"
          >
            <span className="material-symbols-outlined text-primary text-sm">person</span>
          </button>
        </div>
      </div>
    </header>
  );
}
