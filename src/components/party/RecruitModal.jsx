import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModalShell from '../admin/adminLivingWorld/shared/ModalShell';
import { apiClient } from '../../services/apiClient';
import { speciesIcon } from '../../utils/speciesIcons';
import {
  getAllKnownNpcsForModal,
  getDispositionTier,
  calculateRecruitChance,
  rollD100,
} from '../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../../stores/handlers/partyHandlers';
import { generateNpcPortrait } from '../../services/npcPortraitGen';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { calculateCost } from '../../services/costTracker';

const BLOCK_REASON_KEYS = {
  dead: 'party.blockReason.dead',
  in_party: 'party.blockReason.inParty',
  low_disposition: 'party.blockReason.lowDisposition',
  cooldown: 'party.blockReason.cooldown',
  not_recent: 'party.blockReason.notRecent',
};

const BLOCK_REASON_DEFAULTS = {
  dead: 'Nie żyje',
  in_party: 'Już w drużynie',
  low_disposition: 'Niska sympatia',
  cooldown: 'Jeszcze nie teraz',
  not_recent: 'Dawno niewidziany',
};

function NpcCard({ npc, partySize, onAttempt, lastResult, isGenerating }) {
  const { t } = useTranslation();
  const portraitUrl = npc?.portraitUrl ? apiClient.resolveMediaUrl(npc.portraitUrl) : null;
  const speciesLabel = t(`species.${npc.race}`, { defaultValue: npc.race || npc.creatureKind || '' });
  const partyFull = partySize >= MAX_COMPANIONS;
  const tier = getDispositionTier(npc.disposition);
  const dispositionPct = Math.max(0, Math.min(100, ((npc.disposition || 0) + 50) / 100 * 100));
  const recruitable = npc.canRecruit;

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all ${
      recruitable
        ? 'bg-surface-container/50 border-tertiary/30 shadow-sm shadow-tertiary/5 hover:shadow-md hover:shadow-tertiary/10'
        : 'bg-surface-container/20 border-outline-variant/15 opacity-60'
    }`}>
      {/* Portrait */}
      <div className={`w-20 h-20 rounded-lg overflow-hidden shrink-0 relative border-2 ${
        recruitable ? 'border-tertiary/40' : 'border-outline-variant/20'
      }`}>
        {isGenerating ? (
          <div className="absolute inset-0 bg-surface-container animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-br from-tertiary/10 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary/60 text-lg animate-spin">progress_activity</span>
            </div>
          </div>
        ) : portraitUrl ? (
          <img
            src={portraitUrl}
            alt={npc.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/50">{speciesIcon(npc.race)}</span>
          </div>
        )}
        {npc.alive === false && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="material-symbols-outlined text-error text-xl">skull</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-on-surface truncate">{npc.name}</div>
        <div className="text-xs text-on-surface-variant truncate mt-0.5">
          {speciesLabel}{npc.role ? ` · ${npc.role}` : ''}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs font-semibold ${tier.colorClass}`}>{tier.label}</span>
          <span className="text-[11px] text-on-surface-variant tabular-nums">({npc.disposition || 0})</span>
          <div className="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (npc.disposition || 0) >= 15 ? 'bg-tertiary' :
                (npc.disposition || 0) >= 0 ? 'bg-on-surface-variant/50' : 'bg-error/60'
              }`}
              style={{ width: `${dispositionPct}%` }}
            />
          </div>
        </div>

        {recruitable && (
          <div className="text-xs text-on-surface-variant mt-1">
            <span className="tabular-nums text-tertiary font-bold">{t('party.recruitChance', { chance: calculateRecruitChance(npc.disposition || 0) })}</span>
          </div>
        )}

        {!recruitable && npc.blockReason && (
          <div className="mt-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 text-on-surface-variant">
              {t(BLOCK_REASON_KEYS[npc.blockReason], BLOCK_REASON_DEFAULTS[npc.blockReason] || npc.blockReason)}
            </span>
          </div>
        )}

        {lastResult && (
          <div className={`mt-1.5 text-xs font-medium ${lastResult.success ? 'text-tertiary' : 'text-error'}`}>
            {lastResult.message}
          </div>
        )}
      </div>

      {/* Action */}
      {recruitable && (
        <button
          type="button"
          onClick={() => onAttempt(npc)}
          disabled={partyFull}
          className="px-4 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors bg-tertiary/15 text-tertiary border-tertiary/30 hover:bg-tertiary/25 hover:border-tertiary/50 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {t('party.recruit', 'Werbuj')}
        </button>
      )}
    </div>
  );
}

export default function RecruitModal({ scenes, world, party, dispatch, onClose }) {
  const { t } = useTranslation();
  const [results, setResults] = useState({});
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const generationTriggered = useRef(false);
  const { state, autoSave } = useGame();
  const { settings } = useSettings();

  const imageProvider = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'].includes(settings.sceneImageTier)
    ? settings.sceneImageTier
    : (settings.imageProvider || 'dalle');
  const imageStyle = settings.dmSettings?.imageStyle || 'painting';
  const darkPalette = settings.dmSettings?.darkPalette || false;
  const imageSeriousness = settings.dmSettings?.narratorSeriousness ?? null;
  const sdWebuiModel = settings.sdWebuiModel || '';
  const sdWebuiSeed = settings.sdWebuiSeed ?? null;

  const allNpcs = useMemo(
    () => getAllKnownNpcsForModal(scenes || [], world || {}, party || []),
    [scenes, world, party],
  );

  const partySize = Array.isArray(party) ? party.length : 0;

  const triggerPortraitGeneration = useCallback(async () => {
    if (generationTriggered.current) return;
    generationTriggered.current = true;

    const missing = allNpcs.filter((npc) => npc && !npc.portraitUrl);
    if (missing.length === 0) return;

    setGeneratingIds(new Set(missing.map((n) => n.id)));

    for (const npc of missing) {
      try {
        const result = await generateNpcPortrait(npc, {
          genre: state.campaign?.genre,
          provider: imageProvider,
          imageStyle,
          darkPalette,
          seriousness: imageSeriousness,
          sdModel: sdWebuiModel,
          sdSeed: Number.isInteger(sdWebuiSeed) ? sdWebuiSeed : null,
        });
        const portraitUrl = typeof result === 'string' ? result : result?.url;
        if (portraitUrl) {
          dispatch({ type: 'UPDATE_NPC_PORTRAIT', payload: { npcId: npc.id, portraitUrl } });
          dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        }
      } catch (err) {
        console.warn('NPC portrait generation failed:', npc.name, err?.message || err);
      }
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(npc.id);
        return next;
      });
    }

    autoSave();
  }, [allNpcs, state.campaign?.genre, imageProvider, imageStyle, darkPalette, imageSeriousness, sdWebuiModel, sdWebuiSeed, dispatch, autoSave]);

  useEffect(() => {
    triggerPortraitGeneration();
  }, [triggerPortraitGeneration]);

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
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span>
            {t('party.partySize', 'Drużyna')}: <span className="tabular-nums text-on-surface font-bold">{partySize}/{MAX_COMPANIONS}</span>
          </span>
          {partyFull && (
            <span className="text-error font-medium">{t('party.partyFull', 'Drużyna pełna')}</span>
          )}
        </div>

        {allNpcs.length === 0 ? (
          <div className="text-xs text-on-surface-variant py-8 text-center">
            {t('party.noKnownNpcs', 'Nie poznałeś jeszcze żadnych postaci w tej kampanii.')}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {allNpcs.map((npc) => (
              <NpcCard
                key={npc.id}
                npc={npc}
                partySize={partySize}
                onAttempt={handleAttempt}
                lastResult={results[npc.id]}
                isGenerating={generatingIds.has(npc.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
