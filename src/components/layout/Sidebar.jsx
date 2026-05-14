import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUltrawideBonus } from '../../hooks/useUltrawideBonus';
import {
  useGameCampaign,
  useGameCharacter,
  useGameParty,
  useGameSlice,
  useGameIsGeneratingScene,
  useGameDispatch,
} from '../../stores/gameSelectors';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAI } from '../../hooks/useAI';
import { apiClient } from '../../services/apiClient';
import { useAiCallLogStore } from '../../stores/aiCallLogStore';
import StatusBar from '../ui/StatusBar';
import ActiveEffectsRow from '../ui/ActiveEffectsRow';
import NeedsPanel from '../gameplay/NeedsPanel';
import SidebarPartyList from './SidebarPartyList';
import SidebarAiCallLog from './SidebarAiCallLog';
import BadgeModal from '../character/BadgeModal';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { backendUser } = useSettings();
  const uwBonus = useUltrawideBonus();
  const campaign = useGameCampaign();
  const soloCharacter = useGameCharacter();
  const soloParty = useGameParty();
  const soloActiveId = useGameSlice((s) => s.activeCharacterId);
  const timeStateSolo = useGameSlice((s) => s.world?.timeState);
  const sceneCount = useGameSlice((s) => (Array.isArray(s.scenes) ? s.scenes.length : 0));
  const isGeneratingScene = useGameIsGeneratingScene();
  const dispatch = useGameDispatch();
  const mp = useMultiplayer();
  const { generateScene } = useAI();
  const [activeNeedKey, setActiveNeedKey] = useState(null);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);

  const aiLogVisible = useAiCallLogStore((s) => s.sidebarVisible);
  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const character = isMultiplayer
    ? (mp.state.gameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mp.state.gameState?.characters?.[0])
    : soloCharacter;
  const party = isMultiplayer
    ? (mp.state.gameState?.party || [])
    : (soloParty || []);
  const activeId = isMultiplayer
    ? mp.state.gameState?.activeCharacterId
    : soloActiveId;
  const mana = character?.mana || { current: 0, max: 0 };
  const timeState = isMultiplayer
    ? mp.state.gameState?.world?.timeState
    : timeStateSolo;
  const canTriggerNeedAction = useMemo(() => (
    Boolean(campaign)
    && location.pathname.startsWith('/play')
    && !isMultiplayer
    && !isGeneratingScene
    && (campaign?.status || 'active') === 'active'
    && character?.status !== 'dead'
  ), [
    campaign,
    isGeneratingScene,
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

  const badgeCharacterId = character?.backendId || character?.id;

  const portraitRef = useRef(null);
  const portraitRaf = useRef(null);

  const handlePortraitPointerMove = useCallback((e) => {
    const el = portraitRef.current;
    if (!el) return;
    if (portraitRaf.current) return;
    portraitRaf.current = requestAnimationFrame(() => {
      portraitRaf.current = null;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + rect.width / 2);
      const offsetY = e.clientY - (rect.top + rect.height / 2);
      const angle = Math.atan2(offsetY, offsetX) * (180 / Math.PI) + 180;
      el.style.setProperty('--portrait-holo-angle', `${angle.toFixed(1)}deg`);
    });
  }, []);

  const handlePortraitPointerLeave = useCallback(() => {
    const el = portraitRef.current;
    if (!el) return;
    el.style.removeProperty('--portrait-holo-angle');
  }, []);

  const isPlaying = location.pathname.startsWith('/play');
  if (!backendUser || !isPlaying || !character) return null;

  return (
    <aside
      className="hidden lg:flex flex-col h-screen w-[320px] fixed left-0 top-0 z-40 backdrop-blur-xl sidebar-ambient sidebar-torn-edge sidebar-play-metallic pt-16 overflow-hidden"
      style={uwBonus.sidebar > 0 ? { width: 320 + uwBonus.sidebar } : undefined}
    >
      <div className="px-6 mb-8">
        <div
          ref={portraitRef}
          className="mt-[140px] mb-4 aspect-[3/4] bg-surface-container-high sidebar-portrait-magic"
          onPointerMove={handlePortraitPointerMove}
          onPointerLeave={handlePortraitPointerLeave}
        >
          {character.portraitUrl ? (
            <img
              src={apiClient.resolveMediaUrl(character.portraitUrl)}
              alt={character.name}
              className="h-full w-full object-cover relative z-[1]"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-surface-container relative z-[1]">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-6xl">person</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mb-4 p-3 -mx-3 rounded-sm bg-surface-container/30 hover:bg-surface-container/50 transition-all duration-300 group">
          {backendUser?.isAdmin ? (
            <button
              type="button"
              onClick={() => { setBadgeData(null); setBadgeModalOpen(true); }}
              title="Generuj badge"
              className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20 group-hover:border-tertiary/40 group-hover:shadow-[0_0_12px_rgba(255,239,213,0.1)] hover:bg-tertiary/10 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
            </button>
          ) : (
            <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20 group-hover:border-tertiary/40 group-hover:shadow-[0_0_12px_rgba(255,239,213,0.1)] transition-all duration-300">
              <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-headline text-tertiary text-[1.70625rem] font-bold truncate leading-tight">{character.name}</div>
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest truncate">
              {t(`species.${character.species}`, { defaultValue: character.species })}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <StatusBar label={t('common.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
          {mana.max > 0 && (
            <StatusBar label="Mana" current={mana.current} max={mana.max} color="blue" />
          )}
        </div>
        {(character.activeEffects || []).length > 0 && (
          <div className="mt-2">
            <ActiveEffectsRow effects={character.activeEffects} />
          </div>
        )}
        <div className="mt-4">
          <NeedsPanel
            needs={character.needs || { hunger: 100, thirst: 100, bladder: 100, rest: 100 }}
            timeState={timeState}
            onNeedAction={canTriggerNeedAction ? handleInstantNeedAction : null}
            actionLocked={Boolean(activeNeedKey)}
            activeNeedKey={activeNeedKey}
          />
        </div>
        <SidebarPartyList party={party} activeCharacterId={activeId} isMultiplayer={isMultiplayer} />
        {aiLogVisible && <SidebarAiCallLog />}
      </div>

      {badgeModalOpen && badgeCharacterId && createPortal(
        <BadgeModal
          characterId={badgeCharacterId}
          sceneCount={sceneCount}
          onClose={() => setBadgeModalOpen(false)}
        />,
        document.body,
      )}
    </aside>
  );
}
