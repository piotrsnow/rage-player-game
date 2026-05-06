import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import StatusBar from '../ui/StatusBar';
import NeedsPanel from '../gameplay/NeedsPanel';
import SidebarPartyList from './SidebarPartyList';

const SIDEBAR_PLAY_SURFACE_STYLE = {
  background: 'rgba(12, 10, 18, 0.88)',
};

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { backendUser } = useSettings();
  const campaign = useGameCampaign();
  const soloCharacter = useGameCharacter();
  const soloParty = useGameParty();
  const soloActiveId = useGameSlice((s) => s.activeCharacterId);
  const timeStateSolo = useGameSlice((s) => s.world?.timeState);
  const isGeneratingScene = useGameIsGeneratingScene();
  const dispatch = useGameDispatch();
  const mp = useMultiplayer();
  const { generateScene } = useAI();
  const [activeNeedKey, setActiveNeedKey] = useState(null);

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

  const isPlaying = location.pathname.startsWith('/play');
  if (!backendUser || !isPlaying || !character) return null;

  return (
    <aside
      className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 border-r border-primary/[0.10] shadow-[6px_0_24px_rgba(0,0,0,0.5)] backdrop-blur-xl sidebar-ambient pt-16"
      style={SIDEBAR_PLAY_SURFACE_STYLE}
    >
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
        <div className="flex items-center gap-3 mb-4 p-3 -mx-3 rounded-sm bg-surface-container/30 hover:bg-surface-container/50 transition-all duration-300 group">
          <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20 group-hover:border-tertiary/40 group-hover:shadow-[0_0_12px_rgba(255,239,213,0.1)] transition-all duration-300">
            <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
          </div>
          <div className="min-w-0">
            <div className="font-headline text-tertiary text-sm font-bold truncate">{character.name}</div>
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
        <div className="mt-4">
          <NeedsPanel
            needs={character.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }}
            timeState={timeState}
            onNeedAction={canTriggerNeedAction ? handleInstantNeedAction : null}
            actionLocked={Boolean(activeNeedKey)}
            activeNeedKey={activeNeedKey}
          />
        </div>
        <SidebarPartyList party={party} activeCharacterId={activeId} isMultiplayer={isMultiplayer} />
      </div>
    </aside>
  );
}
