import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModalShell from '../admin/adminLivingWorld/shared/ModalShell';
import { apiClient } from '../../services/apiClient';
import { speciesIcon } from '../../utils/speciesIcons';
import {
  getRecentNpcsForRecruitment,
  calculateRecruitChance,
  rollD100,
} from '../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../../stores/handlers/partyHandlers';

function CandidateRow({ npc, partySize, onAttempt, lastResult }) {
  const { t } = useTranslation();
  const portraitUrl = npc?.portraitUrl ? apiClient.resolveMediaUrl(npc.portraitUrl) : null;
  const chance = calculateRecruitChance(npc.disposition || 0);
  const speciesLabel = t(`species.${npc.race}`, { defaultValue: npc.race || npc.creatureKind || '' });
  const partyFull = partySize >= MAX_COMPANIONS;

  return (
    <div className="flex items-center gap-3 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
      <div className="w-12 h-12 rounded-sm overflow-hidden bg-surface-container border border-outline-variant/15 shrink-0 relative">
        {portraitUrl ? (
          <img
            src={portraitUrl}
            alt={npc.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined">{speciesIcon(npc.race)}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-on-surface truncate">{npc.name}</div>
        <div className="text-[10px] text-on-surface-variant truncate">
          {speciesLabel}{npc.role ? ` · ${npc.role}` : ''}
        </div>
        <div className="text-[10px] text-on-surface-variant mt-0.5">
          {t('party.disposition', 'Sympatia')}: <span className="tabular-nums text-on-surface">{npc.disposition || 0}</span>
          {' · '}
          {t('party.recruitChance', 'Szansa werbunku')}: <span className="tabular-nums text-tertiary font-bold">{chance}%</span>
        </div>
        {lastResult && (
          <div className={`mt-1 text-[10px] ${lastResult.success ? 'text-tertiary' : 'text-error'}`}>
            {lastResult.message}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onAttempt(npc)}
        disabled={partyFull}
        className="px-3 py-1.5 rounded-sm border text-[10px] font-bold uppercase tracking-widest transition-colors bg-tertiary/15 text-tertiary border-tertiary/30 hover:bg-tertiary/25 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('party.recruit', 'Werbuj')}
      </button>
    </div>
  );
}

export default function RecruitModal({ scenes, world, party, dispatch, onClose }) {
  const { t } = useTranslation();
  const [results, setResults] = useState({});

  const candidates = useMemo(
    () => getRecentNpcsForRecruitment(scenes || [], world || {}, party || []),
    [scenes, world, party],
  );

  const partySize = Array.isArray(party) ? party.length : 0;

  const handleAttempt = (npc) => {
    const chance = calculateRecruitChance(npc.disposition || 0);
    const roll = rollD100();
    const success = roll <= chance;
    if (success) {
      const criticalSuccess = roll <= 5;
      dispatch({
        type: 'RECRUIT_NPC_SUCCESS',
        payload: { npcId: npc.id, npcName: npc.name, criticalSuccess },
      });
      setResults((prev) => ({
        ...prev,
        [npc.id]: {
          success: true,
          message: t('party.recruitSuccess', '{{name}} dołącza do drużyny!', { name: npc.name }),
        },
      }));
    } else {
      const criticalFailure = roll >= 96;
      dispatch({
        type: 'RECRUIT_NPC_FAILURE',
        payload: { npcId: npc.id, npcName: npc.name, criticalFailure },
      });
      setResults((prev) => ({
        ...prev,
        [npc.id]: {
          success: false,
          message: criticalFailure
            ? t('party.recruitCriticalFailure', '{{name}} czuje się urażony i odchodzi', { name: npc.name })
            : t('party.recruitFailure', '{{name}} odmawia. Spróbuj później', { name: npc.name }),
        },
      }));
    }
  };

  const partyFull = partySize >= MAX_COMPANIONS;

  return (
    <ModalShell onClose={onClose} title={t('party.recruitTitle', 'Werbunek towarzysza')}>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
          <span>
            {t('party.partySize', 'Drużyna')}: <span className="tabular-nums text-on-surface font-bold">{partySize}/{MAX_COMPANIONS}</span>
          </span>
          {partyFull && (
            <span className="text-error">{t('party.partyFull', 'Drużyna pełna')}</span>
          )}
        </div>
        {candidates.length === 0 ? (
          <div className="text-[11px] text-on-surface-variant py-6 text-center">
            {t('party.noCandidates', 'Brak kandydatów do werbunku w ostatnich scenach. Postaraj się o lepsze relacje z napotkanymi NPC.')}
          </div>
        ) : (
          <div className="space-y-2">
            {candidates.map((npc) => (
              <CandidateRow
                key={npc.id}
                npc={npc}
                partySize={partySize}
                onAttempt={handleAttempt}
                lastResult={results[npc.id]}
              />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
