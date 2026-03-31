import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useModals } from '../../contexts/ModalContext';
import { useAI } from '../../hooks/useAI';
import { apiClient } from '../../services/apiClient';
import StatusBar from '../ui/StatusBar';
import NeedsPanel from '../gameplay/NeedsPanel';
import { translateCareer, translateTierName } from '../../utils/wfrpTranslate';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const mp = useMultiplayer();
  const { generateScene } = useAI();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys } = useModals();
  const [activeNeedKey, setActiveNeedKey] = useState(null);

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const hasActiveGame = !!state.campaign || isMultiplayer;
  const character = isMultiplayer
    ? (mp.state.gameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mp.state.gameState?.characters?.[0])
    : state.character;
  const fate = character?.fate ?? 0;
  const resilience = character?.resilience ?? 0;
  const fortune = character?.fortune ?? fate;
  const resolve = character?.resolve ?? resilience;
  const timeState = isMultiplayer
    ? mp.state.gameState?.world?.timeState
    : state.world?.timeState;
  const canTriggerNeedAction = useMemo(() => (
    Boolean(state.campaign)
    && location.pathname.startsWith('/play')
    && !isMultiplayer
    && !state.isGeneratingScene
    && (state.campaign?.status || 'active') === 'active'
    && character?.status !== 'dead'
  ), [
    state.campaign,
    state.isGeneratingScene,
    location.pathname,
    isMultiplayer,
    character?.status,
  ]);

  const handleInstantNeedAction = async (needKey) => {
    if (!canTriggerNeedAction || !character || activeNeedKey) return;

    const currentNeed = Number(character.needs?.[needKey] ?? 0);
    const safeCurrentNeed = Number.isFinite(currentNeed) ? Math.max(0, Math.min(100, currentNeed)) : 0;

    const needLabel = t(`needs.${needKey}`);
    const actionText = `[INSTANT_NEED_OVERRIDE]
Potrzeba "${needLabel}" musi zostać spełniona natychmiast, nawet kosztem absurdalnych, ryzykownych i skrajnych działań.
Licznik tej potrzeby jest już wyzerowany do 0 i to jest fakt kanoniczny.
Opisz bardzo konkretne konsekwencje tej decyzji dla fabuły: relacji, zasobów, reputacji, położenia postaci i kolejnych scen.
`;

    setActiveNeedKey(needKey);
    dispatch({
      type: 'APPLY_STATE_CHANGES',
      payload: {
        needsChanges: { [needKey]: -safeCurrentNeed },
        journalEntries: [
          `Instant need override used: ${needLabel} set to 0 through extreme immediate actions.`,
        ],
      },
    });

    try {
      await generateScene(actionText, false, true, false);
    } finally {
      setActiveNeedKey(null);
    }
  };

  const modalActions = {
    '/character': openCharacterSheet,
    '/tasks-info': openTasksInfo,
    '/settings': openSettings,
    '/keys': openKeys,
  };

  const navItems = [
    hasActiveGame && { path: '/play', icon: 'book_5', label: t('nav.grimoire') },
    { path: '/character', icon: 'shield', label: t('nav.characterSheet') },
    hasActiveGame && { path: '/tasks-info', icon: 'assignment', label: t('nav.tasksInfo') },
    { path: '/keys', icon: 'vpn_key', label: t('nav.keys') },
    { path: '/gallery', icon: 'photo_library', label: t('nav.gallery') },
    { path: '/settings', icon: 'settings', label: t('nav.settings') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ].filter(Boolean);

  return (
    <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 bg-surface-container-low shadow-[20px_0_40px_rgba(0,0,0,0.5)] pt-20">
      {character && (
        <div className="px-6 mb-8">
          {character.portraitUrl && (
            <div className="mt-[60px] mb-4 aspect-[3/4] overflow-hidden rounded-sm border border-outline-variant/20 bg-surface-container-high shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <img
                src={apiClient.resolveMediaUrl(character.portraitUrl)}
                alt={character.name}
                className="h-full w-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
          <div className="flex items-center gap-3 mb-4 p-3 -mx-3 rounded-sm bg-gradient-to-r from-surface-container-high/40 to-transparent hover:from-surface-container-high/60 transition-all duration-300 group">
            <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20 group-hover:border-tertiary/40 group-hover:shadow-[0_0_12px_rgba(255,239,213,0.1)] transition-all duration-300">
              <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
            </div>
            <div className="min-w-0">
              <div className="font-headline text-tertiary text-sm font-bold truncate">{character.name}</div>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest truncate">
                {translateCareer(character.career?.name, t)} · {translateTierName(character.career?.tierName, t)}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <StatusBar label={t('common.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-on-surface-variant mt-2">
              <span>{t('common.fortune')} {fortune}/{fate}</span>
              <span>{t('common.resolve')} {resolve}/{resilience}</span>
            </div>
          </div>
          <div className="mt-4">
            <NeedsPanel
              needs={character.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }}
              timeState={timeState}
              onNeedAction={canTriggerNeedAction ? handleInstantNeedAction : null}
              actionLocked={Boolean(activeNeedKey)}
              activeNeedKey={activeNeedKey}
            />
          </div>
        </div>
      )}

      {character && <div className="mx-6 mb-4 h-px bg-gradient-to-r from-transparent via-outline-variant/20 to-transparent" />}

      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const modalAction = modalActions[item.path];
          const className = `relative flex items-center gap-4 px-4 py-3 rounded-sm transition-all duration-300 ease-in-out ${
            isActive && !modalAction
              ? 'text-primary bg-surface-container-high/80'
              : 'text-on-surface-variant hover:bg-surface-container-high/40 hover:text-tertiary'
          }`;
          if (modalAction) {
            return (
              <button key={item.path} onClick={modalAction} className={className}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-headline text-sm">{item.label}</span>
              </button>
            );
          }
          return (
            <Link key={item.path} to={item.path} className={className}>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-full shadow-[0_0_8px_rgba(197,154,255,0.6)]" />
              )}
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-headline text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
