import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useModals } from '../../contexts/ModalContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useGameCampaign } from '../../stores/gameSelectors';
import { useMultiplayer } from '../../contexts/MultiplayerContext';

export default function MobileNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { backendUser } = useSettings();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys, openAudioConfig, openProfile, openAdminUsers } = useModals();
  const campaign = useGameCampaign();
  const mp = useMultiplayer();
  const hasActiveGame = !!campaign || (mp.state.isMultiplayer && mp.state.phase === 'playing');

  if (!backendUser) return null;

  const modalActions = {
    '/character': openCharacterSheet,
    '/tasks-info': openTasksInfo,
    '/settings': openSettings,
    '/keys': openKeys,
    '/audio': openAudioConfig,
    '/profile': openProfile,
    '/admin-users': openAdminUsers,
  };

  const mobileItems = [
    hasActiveGame && { path: '/play', icon: 'casino', label: t('nav.play') },
    { path: '/character', icon: 'backpack', label: t('nav.characterSheet') },
    hasActiveGame && { path: '/tasks-info', icon: 'assignment', label: t('nav.tasksInfo') },
    { path: '/keys', icon: 'vpn_key', label: t('nav.keys') },
    { path: '/audio', icon: 'graphic_eq', label: t('nav.audioConfig') },
    { path: '/settings', icon: 'psychology', label: t('nav.settings') },
    backendUser?.isAdmin && { path: '/admin-users', icon: 'admin_panel_settings', label: t('admin.users') },
    { path: '/profile', icon: 'account_circle', label: t('nav.profile') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ].filter(Boolean);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 mx-3 mb-3 h-[72px] bg-[rgba(14,14,16,0.82)] backdrop-blur-2xl border border-primary/[0.10] rounded-2xl flex justify-around items-center px-2 z-50 shadow-[0_-6px_24px_rgba(0,0,0,0.5)]">
      {mobileItems.map((item) => {
        const isActive = location.pathname === item.path;
        const modalAction = modalActions[item.path];
        const className = `relative flex flex-col items-center justify-center py-2 px-3 transition-all active:scale-90 duration-150 rounded-xl ${
          isActive && !modalAction
            ? 'text-primary'
            : 'text-on-surface-variant hover:text-tertiary'
        }`;
        if (modalAction) {
          return (
            <button key={item.path} onClick={modalAction} className={className}>
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              <span className="font-label font-medium text-[9px] uppercase tracking-widest mt-0.5">
                {item.label}
              </span>
            </button>
          );
        }
        return (
          <Link key={item.path} to={item.path} className={className}>
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            <span className="font-label font-medium text-[9px] uppercase tracking-widest mt-0.5">
              {item.label}
            </span>
            {isActive && (
              <span className="absolute -bottom-0.5 w-1 h-1 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.8)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
