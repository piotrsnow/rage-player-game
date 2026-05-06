import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { useModals } from '../../contexts/ModalContext';
import { useGameCampaign } from '../../stores/gameSelectors';
import { getGameState } from '../../stores/gameStore';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { storage } from '../../services/storage';
import Tooltip from '../ui/Tooltip';

/** Flat “control rail” look — no hatch; aside keeps diagonal stripes. */
const HEADER_CHROME_STYLE = {
  background: 'rgba(14, 14, 16, 0.82)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.5)',
};

export default function Header() {
  const location = useLocation();
  const { t } = useTranslation();
  const { settings, backendUser } = useSettings();
  const music = useGlobalMusic();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys, openImageConfig, openAudioConfig, openProfile, openAdminUsers } = useModals();
  const campaign = useGameCampaign();
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
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimeoutRef = useRef(null);

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

  return (
    <header
      className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 backdrop-blur-md border-b border-primary/[0.12]"
      style={HEADER_CHROME_STYLE}
    >
      <div className="flex items-center gap-4">
        {location.pathname.startsWith('/play') && (
          <Tooltip content={t('nav.lobby')} placement="bottom" variant="compact" asChild>
            <Link
              to="/"
              className="flex items-center gap-2 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(197,154,255,0.5)]"
            >
              <img src={t('common.logoPath', '/nikczemnu_logo.png')} alt={t('common.appName')} className="h-[6.5rem] w-auto relative top-2 left-2" />
            </Link>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-6">
        {backendUser && (
          <nav className="hidden md:flex gap-1 items-center text-on-surface-variant font-medieval text-[15px] lowercase">
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
                  className="material-symbols-outlined text-base text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                >
                  {vol === 0 ? 'volume_off' : vol < 40 ? 'volume_down' : 'volume_up'}
                </button>
              </Tooltip>
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

        {backendUser && (
          <div className="flex items-center gap-1">
            {showMpStatus && (
              <span className={`hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border ${mpStatusClass}`}>
                <span className="material-symbols-outlined text-sm">{mp.state.connected ? 'wifi' : 'wifi_off'}</span>
                {mpStatusLabel}
              </span>
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
                  <Link
                    to="/admin/living-world"
                    aria-label={t('admin.livingWorld')}
                    className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-all active:scale-95 duration-200 cursor-pointer w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-high/40"
                  >
                    public
                  </Link>
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
            <Tooltip content={t('credits.title', 'Credits')} placement="bottom" variant="compact" asChild>
              <button
                type="button"
                onClick={openProfile}
                aria-label={t('nav.credits', 'Credits')}
                className="flex items-center gap-1 px-2.5 h-9 rounded-full border border-primary/20 bg-surface-container-high text-xs font-label text-primary hover:border-primary/40 hover:shadow-[0_0_12px_rgba(197,154,255,0.2)] transition-all duration-300"
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
  );
}
