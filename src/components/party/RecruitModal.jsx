import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ModalShell from '../admin/adminLivingWorld/shared/ModalShell';
import { apiClient } from '../../services/apiClient';
import { speciesIcon } from '../../utils/speciesIcons';
import {
  getAllKnownNpcsForModal,
  getDispositionTier,
  calculateRecruitChance,
  rollD100,
  MIN_DISPOSITION_TO_RECRUIT,
} from '../../services/partyRecruitment';
import { MAX_COMPANIONS } from '../../stores/handlers/partyHandlers';
import { generateNpcPortrait } from '../../services/npcPortraitGen';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useModals } from '../../contexts/ModalContext';
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

const RECENT_SCENE_WINDOW = 3;

function pluralScenes(n) {
  if (n === 1) return 'scenę';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'sceny';
  return 'scen';
}

function buildBlockHint(npc, blockReason, currentSceneIndex, t) {
  if (blockReason === 'low_disposition') {
    const missing = Math.max(1, MIN_DISPOSITION_TO_RECRUIT - (npc.disposition || 0));
    return t('party.blockReason.lowDispositionDelta', 'Brakuje +{{missing}} sympatii (min. {{min}})', {
      missing,
      min: MIN_DISPOSITION_TO_RECRUIT,
    });
  }
  if (blockReason === 'cooldown') {
    const target = typeof npc.recruitCooldownUntilSceneIndex === 'number'
      ? npc.recruitCooldownUntilSceneIndex
      : currentSceneIndex;
    const left = Math.max(1, target - currentSceneIndex);
    return t('party.blockReason.cooldownScenes', 'Spróbuj za {{count}} {{noun}}', {
      count: left,
      noun: pluralScenes(left),
    });
  }
  if (blockReason === 'not_recent') {
    return t('party.blockReason.notRecentHint', 'Pojaw się w ostatnich {{window}} scenach', {
      window: RECENT_SCENE_WINDOW,
    });
  }
  return null;
}

function ExpandedPortrait({ src, alt, startRect, onClose }) {
  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const targetSize = Math.min(window.innerHeight * 0.7, 480);
  const targetLeft = (window.innerWidth - targetSize) / 2;
  const targetTop = (window.innerHeight - targetSize) / 2;

  const imgStyle = open
    ? {
        left: `${targetLeft}px`,
        top: `${targetTop}px`,
        width: `${targetSize}px`,
        height: `${targetSize}px`,
      }
    : {
        left: `${startRect.left}px`,
        top: `${startRect.top}px`,
        width: `${startRect.width}px`,
        height: `${startRect.height}px`,
      };

  return (
    <div className="fixed inset-0 z-[60]" onClick={handleClose}>
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <img
        src={src}
        alt={alt}
        style={imgStyle}
        className="absolute object-cover rounded-2xl shadow-2xl border-2 border-tertiary/50 transition-all duration-300 ease-out cursor-zoom-out"
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
      />
    </div>
  );
}

function NpcCard({ npc, partySize, currentSceneIndex, onAttempt, lastResult, isGenerating, onOpenNpcSheet }) {
  const { t } = useTranslation();
  const portraitUrl = npc?.portraitUrl ? apiClient.resolveMediaUrl(npc.portraitUrl) : null;
  const speciesLabel = t(`species.${npc.race}`, { defaultValue: npc.race || npc.creatureKind || '' });
  const partyFull = partySize >= MAX_COMPANIONS;
  const tier = getDispositionTier(npc.disposition);
  const dispositionPct = Math.max(0, Math.min(100, ((npc.disposition || 0) + 50) / 100 * 100));
  const recruitable = npc.canRecruit && !lastResult?.success;
  const portraitRef = useRef(null);
  const [expandedRect, setExpandedRect] = useState(null);

  const handlePortraitClick = (e) => {
    if (!portraitUrl || isGenerating) return;
    e.stopPropagation();
    const node = portraitRef.current;
    if (!node) return;
    setExpandedRect(node.getBoundingClientRect());
  };

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
        recruitable
          ? 'bg-surface-container/50 border-tertiary/30 shadow-sm shadow-tertiary/5 hover:shadow-md hover:shadow-tertiary/10'
          : 'bg-surface-container/20 border-outline-variant/15 opacity-60'
      }`}
      onClick={() => onOpenNpcSheet?.(npc.name)}
    >
      {/* Portrait */}
      <div
        ref={portraitRef}
        onClick={handlePortraitClick}
        className={`w-28 h-28 rounded-lg overflow-hidden shrink-0 relative border-2 transition-transform ${
          recruitable ? 'border-tertiary/40' : 'border-outline-variant/20'
        } ${portraitUrl && !isGenerating ? 'cursor-zoom-in hover:scale-[1.03]' : ''}`}
      >
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
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/50">{speciesIcon(npc.race)}</span>
          </div>
        )}
        {npc.alive === false && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="material-symbols-outlined text-error text-2xl">skull</span>
          </div>
        )}
      </div>

      {expandedRect && portraitUrl && createPortal(
        <ExpandedPortrait
          src={portraitUrl}
          alt={npc.name}
          startRect={expandedRect}
          onClose={() => setExpandedRect(null)}
        />,
        document.body,
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-on-surface truncate">{npc.name}</div>
        <div className="text-xs text-on-surface-variant truncate mt-0.5">
          {speciesLabel}{npc.role ? ` · ${npc.role}` : ''}
        </div>
        {npc.personality && (
          <div
            className="text-[11px] text-on-surface-variant/70 italic truncate mt-0.5"
            title={npc.personality}
          >
            {npc.personality}
          </div>
        )}

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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 text-on-surface-variant">
              {t(BLOCK_REASON_KEYS[npc.blockReason], BLOCK_REASON_DEFAULTS[npc.blockReason] || npc.blockReason)}
            </span>
            {(() => {
              const hint = buildBlockHint(npc, npc.blockReason, currentSceneIndex, t);
              if (!hint) return null;
              return (
                <span className="text-[10px] text-on-surface-variant/80 tabular-nums">
                  {hint}
                </span>
              );
            })()}
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
          onClick={(e) => {
            e.stopPropagation();
            onAttempt(npc);
          }}
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
  const { openNpcSheet } = useModals();
  const [results, setResults] = useState({});
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const generationTriggered = useRef(false);
  const successIds = useRef(new Set());
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
  const currentSceneIndex = Array.isArray(scenes) ? scenes.length : 0;

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
    if (npc?.id && successIds.current.has(npc.id)) return;
    const chance = calculateRecruitChance(npc.disposition || 0);
    const roll = rollD100();
    const success = roll <= chance;
    if (success) {
      const criticalSuccess = roll <= 5;
      if (npc.id) successIds.current.add(npc.id);
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
                currentSceneIndex={currentSceneIndex}
                onAttempt={handleAttempt}
                lastResult={results[npc.id]}
                isGenerating={generatingIds.has(npc.id)}
                onOpenNpcSheet={openNpcSheet}
              />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
