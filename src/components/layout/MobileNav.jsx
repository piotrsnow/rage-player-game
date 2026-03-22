import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useModals } from '../../contexts/ModalContext';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';

export default function MobileNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { openCharacterSheet, openSettings } = useModals();
  const { state } = useGame();
  const mp = useMultiplayer();
  const hasActiveGame = !!state.campaign || (mp.state.isMultiplayer && mp.state.phase === 'playing');

  const modalActions = {
    '/character': openCharacterSheet,
    '/settings': openSettings,
  };

  const mobileItems = [
    hasActiveGame && { path: '/play', icon: 'casino', label: t('nav.play') },
    { path: '/character', icon: 'backpack', label: t('nav.character') },
    { path: '/settings', icon: 'psychology', label: t('nav.settings') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ].filter(Boolean);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 mx-3 mb-3 h-[72px] bg-[#0e0e10]/90 backdrop-blur-2xl border border-primary/[0.08] rounded-2xl flex justify-around items-center px-2 z-50 shadow-[0_-8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(72,71,74,0.1)]">
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
