import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PartyMemberPortrait from '../party/PartyMemberPortrait';
import PartyMemberModal from '../party/PartyMemberModal';
import RecruitModal from '../party/RecruitModal';
import { MAX_COMPANIONS } from '../../stores/handlers/partyHandlers';
import {
  useGameDispatch,
  useGameCharacter,
  useGameSlice,
} from '../../stores/gameSelectors';

function memberId(m) {
  if (!m) return '';
  return m.id ?? m.odId ?? m.name ?? '';
}

export default function SidebarPartyList({ party = [], activeCharacterId, isMultiplayer = false }) {
  const { t } = useTranslation();
  const dispatch = useGameDispatch();
  const character = useGameCharacter();
  const scenes = useGameSlice((s) => s.scenes);
  const world = useGameSlice((s) => s.world);
  const storeParty = useGameSlice((s) => s.party);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [recruitOpen, setRecruitOpen] = useState(false);

  const list = Array.isArray(party) ? party : [];
  // Player is rendered first, then companions. The player object comes from
  // `character` so the existing portrait/wounds always reflect the live state.
  const playerTile = character
    ? { ...character, type: 'player', id: character.name }
    : null;
  const tiles = playerTile ? [playerTile, ...list.filter((m) => m.type === 'companion')] : list;

  const companionCount = list.filter((m) => m.type === 'companion').length;
  const canRecruit = !isMultiplayer && companionCount < MAX_COMPANIONS;

  const openMember = tiles.find((m) => memberId(m) === openMemberId) || null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
        <span className="material-symbols-outlined text-primary text-sm">groups</span>
        <span className="text-[10px] font-label uppercase tracking-widest text-primary truncate">
          {t('party.title', 'Drużyna')}
        </span>
        <span className="text-[10px] text-on-surface-variant tabular-nums">
          ({companionCount + (playerTile ? 1 : 0)}/{MAX_COMPANIONS + 1})
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {tiles.map((m) => {
          const id = memberId(m);
          const selected = id && id === activeCharacterId;
          return (
            <PartyMemberPortrait
              key={id || m.name}
              member={m}
              selected={selected}
              onClick={() => setOpenMemberId(id)}
            />
          );
        })}
        {canRecruit && (
          <button
            type="button"
            onClick={() => setRecruitOpen(true)}
            title={t('party.recruitTitle', 'Werbunek towarzysza')}
            aria-label={t('party.recruitTitle', 'Werbunek towarzysza')}
            className="aspect-square w-full rounded-sm border border-dashed border-outline-variant/30 bg-surface-container/30 text-on-surface-variant hover:border-tertiary/50 hover:text-tertiary hover:bg-tertiary/5 transition-colors flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
        )}
      </div>

      {openMember && (
        <PartyMemberModal
          member={openMember}
          onClose={() => setOpenMemberId(null)}
          onManageCompanion={(id, updates) => dispatch({ type: 'UPDATE_PARTY_MEMBER', payload: { id, updates } })}
          dispatch={dispatch}
        />
      )}

      {recruitOpen && (
        <RecruitModal
          scenes={scenes}
          world={world}
          party={storeParty}
          dispatch={dispatch}
          onClose={() => setRecruitOpen(false)}
        />
      )}
    </div>
  );
}
