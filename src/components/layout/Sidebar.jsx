import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import StatusBar from '../ui/StatusBar';
import NeedsPanel from '../gameplay/NeedsPanel';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { state } = useGame();
  const mp = useMultiplayer();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const character = isMultiplayer
    ? (mp.state.gameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mp.state.gameState?.characters?.[0])
    : state.character;
  const timeState = isMultiplayer
    ? mp.state.gameState?.world?.timeState
    : state.world?.timeState;

  const navItems = [
    { path: '/play', icon: 'book_5', label: t('nav.grimoire') },
    { path: '/character', icon: 'shield', label: t('nav.armory') },
    { path: '/settings', icon: 'settings', label: t('nav.settings') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ];

  return (
    <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 bg-surface-container-low shadow-[20px_0_40px_rgba(0,0,0,0.5)] pt-20">
      {character && (
        <div className="px-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20">
              <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
            </div>
            <div>
              <div className="font-headline text-tertiary text-sm font-bold">{character.name}</div>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                {t('common.level')} {character.level} {character.class}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <StatusBar label={t('common.health')} current={character.hp} max={character.maxHp} color="error" />
            <StatusBar label={t('common.mana')} current={character.mana} max={character.maxMana} color="primary" />
          </div>
          <div className="mt-4">
            <NeedsPanel needs={character.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }} timeState={timeState} />
          </div>
        </div>
      )}

      <nav className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-3 transition-all duration-300 ease-in-out ${
                isActive
                  ? 'text-primary bg-surface-container-high border-l-2 border-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-tertiary border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-headline text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-6">
        <Link
          to="/play"
          className="w-full py-3 bg-surface-tint text-on-primary font-bold text-xs tracking-widest uppercase rounded-sm shadow-[0_0_15px_rgba(197,154,255,0.3)] active:scale-95 duration-200 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">auto_fix_high</span>
          {t('nav.play')}
        </Link>
      </div>
    </aside>
  );
}
