import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';
import PendingActions from '../multiplayer/PendingActions';
import Tooltip from '../ui/Tooltip';
import { parseActionSegments } from '../../services/actionParser';
import { TYPING_DRAFT_MAX_LENGTH } from '../../../shared/contracts/multiplayer.js';

const normalizeQuotes = (text) =>
  text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2018\u2019\u201A\u201B\u2039\u203A\uFF02`\u0060\u00B4]/g, '"');

const ATTITUDE_STYLES = {
  hostile: 'bg-error/20 text-error border-error/30',
  neutral: 'bg-warning/20 text-warning border-warning/30',
  friendly: 'bg-success/20 text-success border-success/30',
};

const QUICK_BUTTON_STYLES = {
  primary: 'text-primary/90 hover:text-primary bg-primary/8 hover:bg-primary/14 border-primary/20 hover:border-primary/40',
  neutral: 'text-on-surface-variant/90 hover:text-on-surface bg-surface-container-high/45 hover:bg-surface-container-high border-outline-variant/20 hover:border-outline-variant/35',
  tertiary: 'text-tertiary/85 hover:text-tertiary bg-tertiary/8 hover:bg-tertiary/14 border-tertiary/20 hover:border-tertiary/35',
  danger: 'text-error/85 hover:text-error bg-error/8 hover:bg-error/14 border-error/20 hover:border-error/35',
  indigo: 'text-indigo-300/90 hover:text-indigo-200 bg-indigo-500/8 hover:bg-indigo-500/14 border-indigo-400/20 hover:border-indigo-300/35',
};

function AnimatedTypingDraft({ text }) {
  const prevTextRef = useRef('');
  const [animateFromIndex, setAnimateFromIndex] = useState(0);

  useEffect(() => {
    const prev = prevTextRef.current;
    if (typeof text !== 'string') {
      prevTextRef.current = '';
      setAnimateFromIndex(0);
      return;
    }

    if (text.startsWith(prev) && text.length > prev.length) {
      setAnimateFromIndex(prev.length);
    } else {
      setAnimateFromIndex(0);
    }
    prevTextRef.current = text;
  }, [text]);

  if (!text) {
    return <span className="text-[11px] text-on-surface-variant/55 italic">...</span>;
  }

  return (
    <>
      <style>
        {`@keyframes mpTypingZoomOut{0%{opacity:0;transform:scale(1.35)}100%{opacity:1;transform:scale(1)}}`}
      </style>
      <span className="whitespace-pre-wrap break-words">
        {text.split('').map((char, index) => (
          <span
            key={`${char}_${index}`}
            style={index >= animateFromIndex ? { display: 'inline-block', animation: 'mpTypingZoomOut 220ms ease-out' } : undefined}
          >
            {char}
          </span>
        ))}
      </span>
    </>
  );
}

export default function ActionPanel({
  actions = [],
  onAction,
  disabled,
  npcs = [],
  autoPlayerTypingText = '',
  dialogueCooldown = 0,
  character = null,
  dilemma = null,
  lastChosenAction = null,
  multiplayerPlayers = [],
  typingPlayers = {},
}) {
  const [customAction, setCustomAction] = useState('');
  const [combatPickerOpen, setCombatPickerOpen] = useState(false);
  const [dialoguePickerOpen, setDialoguePickerOpen] = useState(false);
  const [selectedDialogueNpcs, setSelectedDialogueNpcs] = useState([]);
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mp = useMultiplayer();
  const isMultiplayer = mp.state.isMultiplayer;
  const isHost = mp.state.isHost;
  const myPlayer = mp.state.players?.find((p) => p.odId === mp.state.myOdId);
  const hasPendingAction = isMultiplayer && myPlayer?.pendingAction;
  const { isAvailable: soloAvailable, formattedTime: soloCooldownTime } = useSoloActionCooldown(myPlayer?.lastSoloActionAt);

  const onVoiceResult = useCallback((transcript) => {
    setCustomAction((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + separator + transcript;
    });
  }, []);

  const { listening, interim, supported, toggle } = useSpeechRecognition({
    lang: settings.language || 'pl',
    onResult: onVoiceResult,
  });

  const typingTimerRef = useRef(null);
  const typingBroadcastTimerRef = useRef(null);
  const queuedDraftRef = useRef('');
  const isTypingRef = useRef(false);

  const sendTypingState = useCallback((isTyping, draft = '') => {
    mp.sendTyping(isTyping, String(draft || '').slice(0, TYPING_DRAFT_MAX_LENGTH));
  }, [mp]);

  const emitTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingState(false, '');
    }
  }, [sendTypingState]);

  const scheduleTypingBroadcast = useCallback((draft) => {
    queuedDraftRef.current = String(draft || '').slice(0, TYPING_DRAFT_MAX_LENGTH);
    if (typingBroadcastTimerRef.current) return;
    typingBroadcastTimerRef.current = setTimeout(() => {
      typingBroadcastTimerRef.current = null;
      if (isTypingRef.current) {
        sendTypingState(true, queuedDraftRef.current);
      }
    }, 120);
  }, [sendTypingState]);

  const handleTypingChange = useCallback((value) => {
    setCustomAction(value);
    if (!isMultiplayer) return;

    if (value.trim()) {
      const draft = value.trim().slice(0, TYPING_DRAFT_MAX_LENGTH);
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        sendTypingState(true, draft);
      } else {
        scheduleTypingBroadcast(draft);
      }
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(emitTypingStop, 2000);
    } else {
      clearTimeout(typingTimerRef.current);
      clearTimeout(typingBroadcastTimerRef.current);
      typingBroadcastTimerRef.current = null;
      emitTypingStop();
    }
  }, [isMultiplayer, emitTypingStop, scheduleTypingBroadcast, sendTypingState]);

  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      clearTimeout(typingBroadcastTimerRef.current);
      if (isTypingRef.current) {
        sendTypingState(false, '');
      }
    };
  }, [sendTypingState]);

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    const action = normalizeQuotes(customAction.trim());
    if (action && !disabled) {
      if (listening) toggle();
      clearTimeout(typingTimerRef.current);
      emitTypingStop();
      if (isMultiplayer) {
        mp.submitAction(action, true);
      } else {
        onAction(action, true);
      }
      setCustomAction('');
    }
  };

  const handleSuggestedAction = (action) => {
    if (isMultiplayer) {
      mp.submitAction(action, false);
    } else {
      onAction(action, false);
    }
  };

  const handleWithdraw = () => {
    mp.withdrawAction();
  };

  const handleApprove = () => {
    mp.approveActions(settings.language || 'en', settings.dmSettings);
  };

  const handleSoloSuggestedAction = (action) => {
    clearTimeout(typingTimerRef.current);
    clearTimeout(typingBroadcastTimerRef.current);
    typingBroadcastTimerRef.current = null;
    emitTypingStop();
    mp.soloAction(action, false, settings.language || 'en', settings.dmSettings);
  };

  const handleSoloCustomSubmit = () => {
    const action = normalizeQuotes(customAction.trim());
    if (action) {
      if (listening) toggle();
      clearTimeout(typingTimerRef.current);
      clearTimeout(typingBroadcastTimerRef.current);
      typingBroadcastTimerRef.current = null;
      emitTypingStop();
      mp.soloAction(action, true, settings.language || 'en', settings.dmSettings);
      setCustomAction('');
    }
  };

  const handleSoloPendingAction = () => {
    if (myPlayer?.pendingAction) {
      mp.soloAction(myPlayer.pendingAction, false, settings.language || 'en', settings.dmSettings);
    }
  };

  const handleInitiateCombat = () => {
    setCombatPickerOpen(false);
    if (isMultiplayer) {
      mp.soloAction('[INITIATE COMBAT]', true, settings.language || 'en', settings.dmSettings);
    } else {
      onAction('[INITIATE COMBAT]', true);
    }
  };

  const handleAttackNpc = (npcName) => {
    setCombatPickerOpen(false);
    if (isMultiplayer) {
      mp.soloAction(`[ATTACK: ${npcName}]`, true, settings.language || 'en', settings.dmSettings);
    } else {
      onAction(`[ATTACK: ${npcName}]`, true);
    }
  };

  const handleToggleDialogueNpc = (npcName) => {
    setSelectedDialogueNpcs((prev) =>
      prev.includes(npcName) ? prev.filter((n) => n !== npcName) : [...prev, npcName]
    );
  };

  const handleInitiateDialogue = () => {
    if (selectedDialogueNpcs.length < 1) return;
    setDialoguePickerOpen(false);
    const npcList = selectedDialogueNpcs.join(', ');
    if (isMultiplayer) {
      mp.soloAction(`[INITIATE DIALOGUE: ${npcList}]`, true, settings.language || 'en', settings.dmSettings);
    } else {
      onAction(`[INITIATE DIALOGUE: ${npcList}]`, true);
    }
    setSelectedDialogueNpcs([]);
  };

  const canDialogue = npcs.length >= 1 && dialogueCooldown <= 0;

  const textareaRef = useRef(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const isAutoTyping = !!autoPlayerTypingText;
  const displayValue = isAutoTyping
    ? autoPlayerTypingText
    : customAction + (interim ? (customAction ? ' ' : '') + interim : '');
  const displaySegments = useMemo(() => parseActionSegments(displayValue), [displayValue]);
  const hasDialogueText = displaySegments.some((s) => s.type === 'dialogue');
  const teamPlayers = useMemo(
    () => (multiplayerPlayers?.length ? multiplayerPlayers : (mp.state.players || [])),
    [multiplayerPlayers, mp.state.players]
  );
  const typingByPlayer = multiplayerPlayers?.length ? typingPlayers : (mp.state.typingPlayers || {});
  const teammateTypingPanels = useMemo(
    () => teamPlayers
      .filter((player) => player.odId !== mp.state.myOdId)
      .map((player) => ({
        odId: player.odId,
        name: player.name || t('multiplayer.player', { defaultValue: 'Player' }),
        draft: typingByPlayer[player.odId]?.draft || '',
        isTyping: Boolean(typingByPlayer[player.odId]?.isTyping),
      })),
    [teamPlayers, typingByPlayer, mp.state.myOdId, t]
  );

  const renderQuickActionButton = ({
    id,
    icon,
    label,
    description,
    onClick,
    disabled: isDisabled = false,
    tone = 'neutral',
  }) => (
    <Tooltip
      key={id}
      className="inline-flex"
      tooltipClassName="border-primary/30 bg-[linear-gradient(150deg,rgba(24,22,36,0.97),rgba(40,30,58,0.93))] shadow-[0_20px_50px_rgba(8,8,14,0.5)]"
      content={
        <div className="space-y-1.5">
          <div className="text-[11px] font-label uppercase tracking-[0.14em] text-primary/80">{label}</div>
          {description ? (
            <div className="text-xs leading-relaxed text-on-surface/90 max-w-[240px]">
              {description}
            </div>
          ) : null}
        </div>
      }
    >
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={isDisabled}
        className={`shrink-0 inline-flex items-center justify-center w-9 h-9 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${QUICK_BUTTON_STYLES[tone] || QUICK_BUTTON_STYLES.neutral}`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">{icon}</span>
      </button>
    </Tooltip>
  );

  useEffect(() => {
    autoResize();
  }, [displayValue, autoResize]);

  return (
    <div className="space-y-2 min-h-[130px]">
      {/* Multiplayer: Solo Action Cooldown Indicator */}
      {isMultiplayer && !soloAvailable && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-tertiary/5 border border-tertiary/15 rounded-sm">
          <span className="material-symbols-outlined text-tertiary text-sm">timer</span>
          <span className="text-[11px] text-tertiary font-label">
            {t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
          </span>
        </div>
      )}
      {isMultiplayer && soloAvailable && (
        <div className="flex items-center gap-1.5 px-2.5 py-1">
          <span className="material-symbols-outlined text-tertiary/60 text-xs">bolt</span>
          <span className="text-[10px] text-tertiary/60 font-label uppercase tracking-widest">
            {t('multiplayer.soloActionReady')}
          </span>
        </div>
      )}

      {/* Multiplayer: Pending Actions */}
      {isMultiplayer && <PendingActions />}

      {/* Moral Dilemma */}
      {dilemma && !hasPendingAction && (
        <div className="p-3 bg-gradient-to-b from-amber-950/30 to-surface-container-low/40 border border-amber-500/25 rounded-sm space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-400 text-sm">balance</span>
            <span className="text-xs font-title text-amber-300">{dilemma.title}</span>
          </div>
          {dilemma.stakes && (
            <p className="text-[11px] text-on-surface-variant/70 italic mb-2">{dilemma.stakes}</p>
          )}
          <div className="grid grid-cols-1 gap-1.5">
            {(dilemma.options || []).map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSuggestedAction(opt.action)}
                disabled={disabled}
                className="w-full text-left px-3 py-2.5 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/40 rounded-sm transition-all group disabled:opacity-50"
              >
                <div className="text-xs font-medium text-amber-200 group-hover:text-amber-100">
                  {opt.label}
                </div>
                {opt.consequence && (
                  <div className="text-[10px] text-on-surface-variant/50 mt-0.5 italic">
                    {opt.consequence}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="space-y-2">
          {/* Row 1: suggested action buttons */}
          <div className="grid grid-cols-3 gap-2">
            {actions.slice(0, 3).map((action, i) => (
              <div key={`${action.substring(0, 30)}_${i}`} className="flex gap-1">
                <button
                  data-testid="suggested-action"
                  onClick={() => handleSuggestedAction(action)}
                  disabled={disabled || hasPendingAction}
                  className="flex-1 text-left px-3 py-2.5 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-primary-dim/20 to-primary/10 text-primary font-headline text-xs leading-none border border-primary/15 group-hover:border-primary/30 group-hover:shadow-[0_0_8px_rgba(197,154,255,0.2)] transition-all">
                      {i + 1}
                    </span>
                    <p className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors leading-snug line-clamp-2">
                      {action}
                    </p>
                  </div>
                </button>
                {isMultiplayer && (
                  <button
                    onClick={() => handleSoloSuggestedAction(action)}
                    disabled={disabled || !soloAvailable || mp.state.isGenerating}
                    title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                    className="shrink-0 w-7 flex items-center justify-center bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 hover:border-tertiary/40 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-tertiary text-sm">bolt</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {isMultiplayer && teammateTypingPanels.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
              {teammateTypingPanels.map((member) => (
                <div
                  key={member.odId}
                  className={`rounded-sm border px-2.5 py-2 min-h-[54px] transition-all ${
                    member.isTyping
                      ? 'border-primary/35 bg-primary/8 shadow-[0_0_12px_rgba(197,154,255,0.15)]'
                      : 'border-outline-variant/20 bg-surface-container-high/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/85 truncate">
                      {member.name}
                    </span>
                    <span className={`text-[9px] font-label uppercase tracking-widest ${member.isTyping ? 'text-primary' : 'text-on-surface-variant/45'}`}>
                      {member.isTyping ? 'typing' : 'idle'}
                    </span>
                  </div>
                  <div className={`text-[11px] leading-snug ${member.isTyping ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                    <AnimatedTypingDraft text={member.isTyping ? member.draft : ''} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Combat picker dropdown (absolute positioned) */}
          {combatPickerOpen && (
            <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                {t('gameplay.selectTarget')}
              </label>

              <button
                onClick={handleInitiateCombat}
                disabled={disabled}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-label text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm text-error">target</span>
                {t('gameplay.generalCombat')}
              </button>

              {npcs.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {npcs.map((npc) => {
                    const attitudeKey = npc.attitude === 'hostile' ? 'attitudeHostile'
                      : npc.attitude === 'friendly' ? 'attitudeFriendly' : 'attitudeNeutral';
                    const attitudeStyle = ATTITUDE_STYLES[npc.attitude] || ATTITUDE_STYLES.neutral;
                    return (
                      <div
                        key={npc.id || npc.name}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 rounded-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-on-surface truncate">{npc.name}</span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm border font-label uppercase tracking-wider ${attitudeStyle}`}>
                            {t(`gameplay.${attitudeKey}`)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleAttackNpc(npc.name)}
                          disabled={disabled}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-label uppercase tracking-widest text-error hover:text-on-surface bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/40 rounded-sm transition-all disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-xs">swords</span>
                          {t('gameplay.attackNpc')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-on-surface-variant/60 italic px-1">
                  {t('gameplay.noNpcsNearby')}
                </p>
              )}

              <button
                onClick={() => setCombatPickerOpen(false)}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('gameplay.cancelCombat')}
              </button>
            </div>
          )}

          {/* Dialogue picker dropdown */}
          {dialoguePickerOpen && (
            <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                {t('dialogue.selectNpcs')}
              </label>

              {npcs.length >= 1 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {npcs.map((npc) => {
                    const isSelected = selectedDialogueNpcs.includes(npc.name);
                    const attitudeKey = npc.attitude === 'hostile' ? 'attitudeHostile'
                      : npc.attitude === 'friendly' ? 'attitudeFriendly' : 'attitudeNeutral';
                    const attitudeStyle = ATTITUDE_STYLES[npc.attitude] || ATTITUDE_STYLES.neutral;
                    return (
                      <button
                        key={npc.id || npc.name}
                        onClick={() => handleToggleDialogueNpc(npc.name)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-sm transition-all ${
                          isSelected
                            ? 'bg-tertiary/15 border-tertiary/30'
                            : 'bg-surface-container/60 border-outline-variant/10 hover:border-tertiary/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`material-symbols-outlined text-sm ${isSelected ? 'text-tertiary' : 'text-on-surface-variant/40'}`}>
                            {isSelected ? 'check_box' : 'check_box_outline_blank'}
                          </span>
                          <span className="text-sm text-on-surface truncate">{npc.name}</span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm border font-label uppercase tracking-wider ${attitudeStyle}`}>
                            {t(`gameplay.${attitudeKey}`)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-on-surface-variant/60 italic px-1">
                  {t('dialogue.notEnoughNpcs')}
                </p>
              )}

              <button
                onClick={handleInitiateDialogue}
                disabled={disabled || selectedDialogueNpcs.length < 1}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-label text-on-surface bg-tertiary/15 hover:bg-tertiary/25 border border-tertiary/30 hover:border-tertiary/50 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm text-tertiary">forum</span>
                {t('dialogue.startDialogue')} ({selectedDialogueNpcs.length}/1+)
              </button>

              <button
                onClick={() => { setDialoguePickerOpen(false); setSelectedDialogueNpcs([]); }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Multiplayer: Withdraw / Solo Send / Approve buttons */}
      {isMultiplayer && hasPendingAction && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleWithdraw}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-sm">undo</span>
            {t('multiplayer.withdrawAction')}
          </button>
          <button
            onClick={handleSoloPendingAction}
            disabled={!soloAvailable || mp.state.isGenerating}
            title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            {soloAvailable ? t('multiplayer.soloActionSend') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
          </button>
          <span className="text-[10px] text-on-surface-variant italic">
            {t('multiplayer.waitingForHost')}
          </span>
        </div>
      )}

      {isMultiplayer && isHost && (
        <button
          onClick={handleApprove}
          disabled={!mp.state.players?.some((p) => p.pendingAction) || mp.state.isGenerating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-sm text-primary font-label text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-lg">gavel</span>
          {t('multiplayer.approveAndSend')}
        </button>
      )}

      {/* Row 2: Utility buttons + Input */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="flex items-center gap-2">
          {/* Quick action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {renderQuickActionButton({
              id: 'continue',
              icon: 'skip_next',
              label: t('gameplay.continueButton'),
              description: lastChosenAction === '[CONTINUE]'
                ? t('gameplay.continueDisabledTooltip')
                : t('gameplay.continueChatMessage'),
              onClick: () => handleSuggestedAction('[CONTINUE]'),
              disabled: disabled || hasPendingAction || lastChosenAction === '[CONTINUE]',
              tone: 'primary',
            })}
            {renderQuickActionButton({
              id: 'wait',
              icon: 'hourglass_empty',
              label: t('gameplay.waitButton'),
              description: t('gameplay.waitSystemMessage'),
              onClick: () => handleSuggestedAction('[WAIT]'),
              disabled: disabled || hasPendingAction,
              tone: 'neutral',
            })}
            {renderQuickActionButton({
              id: 'quests',
              icon: 'assignment',
              label: t('gameplay.searchForQuests'),
              description: t('gameplay.searchForQuestsAction'),
              onClick: () => handleSuggestedAction(t('gameplay.searchForQuestsAction')),
              disabled: disabled || hasPendingAction,
              tone: 'tertiary',
            })}
            {renderQuickActionButton({
              id: 'combat',
              icon: 'swords',
              label: t('gameplay.initiateCombat'),
              description: t('gameplay.generalCombat'),
              onClick: () => setCombatPickerOpen((v) => !v),
              disabled: disabled || hasPendingAction,
              tone: 'danger',
            })}
            {renderQuickActionButton({
              id: 'dialogue',
              icon: 'forum',
              label: dialogueCooldown > 0
                ? t('dialogue.cooldownShort', { scenes: dialogueCooldown })
                : t('dialogue.startDialogue'),
              description: dialogueCooldown > 0
                ? t('dialogue.cooldownHint', { scenes: dialogueCooldown })
                : npcs.length < 1
                  ? t('dialogue.notEnoughNpcs')
                  : t('dialogue.selectNpcs'),
              onClick: () => { setDialoguePickerOpen((v) => !v); setCombatPickerOpen(false); },
              disabled: disabled || hasPendingAction || !canDialogue,
              tone: 'tertiary',
            })}
            {settings.needsSystemEnabled && renderQuickActionButton({
              id: 'rest',
              icon: 'bedtime',
              label: t('gameplay.restButton'),
              description: t('gameplay.restAction'),
              onClick: () => handleSuggestedAction(t('gameplay.restAction')),
              disabled: disabled || hasPendingAction,
              tone: 'indigo',
            })}
          </div>
          {/* Custom action input */}
          <form onSubmit={handleCustomSubmit} className="flex-1 min-w-0">
            {/* Dialogue tag */}
            <div
              className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ${
                hasDialogueText ? 'max-h-10 opacity-100 mb-1' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-amber-400/15 border border-amber-400/30">
                <span className="material-symbols-outlined text-amber-300 text-xs">chat_bubble</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  {t('gameplay.dialogueTag')}
                </span>
              </span>
              <span className="text-[10px] text-amber-300/50 italic">
                {t('gameplay.dialogueHint')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {supported && !isAutoTyping && (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={disabled}
                  title={listening ? t('gameplay.voiceStop') : t('gameplay.voiceStart')}
                  className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 disabled:opacity-30 ${
                    listening
                      ? 'text-error-light bg-error/15 mic-pulse'
                      : 'text-primary/70 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {listening ? 'mic' : 'mic_none'}
                  </span>
                </button>
              )}
              {isAutoTyping && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">
                  <span className="material-symbols-outlined text-sm">smart_toy</span>
                </span>
              )}
              <div className="relative flex-1 min-w-0">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 w-full text-sm py-1.5 px-1 pointer-events-none whitespace-pre-wrap break-words overflow-hidden leading-[1.5]"
                >
                  {displaySegments.map((seg, i) =>
                    seg.type === 'dialogue' ? (
                      <span
                        key={i}
                        className="bg-amber-400/15 rounded-sm text-amber-300 border-b border-amber-400/40 transition-colors"
                      >{seg.text}</span>
                    ) : (
                      <span key={i} className="text-on-surface">{seg.text}</span>
                    )
                  )}
                </div>
                <textarea
                  data-testid="action-input"
                  ref={textareaRef}
                  value={displayValue}
                  onChange={(e) => !isAutoTyping && handleTypingChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCustomSubmit(e);
                    }
                  }}
                  placeholder={
                    listening
                      ? t('gameplay.voiceListening')
                      : supported
                        ? t('gameplay.customActionPlaceholderVoice')
                        : t('gameplay.customActionPlaceholder')
                  }
                  rows={1}
                  disabled={disabled && !isAutoTyping}
                  readOnly={listening || isAutoTyping}
                  style={hasDialogueText && !isAutoTyping ? { color: 'transparent', caretColor: '#fffbfe' } : undefined}
                  className={`relative w-full bg-transparent border-0 border-b-2 focus:ring-0 text-sm py-1.5 px-1 resize-none placeholder:text-outline/40 overflow-hidden disabled:opacity-50 transition-all duration-300 leading-[1.5] ${
                    hasDialogueText ? 'selection:bg-amber-400/30' : ''
                  } ${
                    isAutoTyping
                      ? 'border-primary/60 text-primary shadow-[0_2px_8px_rgba(197,154,255,0.2)]'
                      : listening
                        ? `border-primary/60 shadow-[0_2px_8px_rgba(197,154,255,0.15)]${!hasDialogueText ? ' text-on-surface' : ''}`
                        : hasDialogueText
                          ? 'border-amber-400/40 shadow-[0_2px_8px_rgba(251,191,36,0.08)]'
                          : 'border-outline-variant/20 focus:border-primary/50 focus:shadow-[0_2px_8px_rgba(197,154,255,0.1)]'
                  }`}
                />
              </div>
              {isMultiplayer && (
                <button
                  type="button"
                  onClick={handleSoloCustomSubmit}
                  disabled={!customAction.trim() || disabled || !soloAvailable || mp.state.isGenerating}
                  title={soloAvailable ? t('multiplayer.soloActionTooltip') : t('multiplayer.soloActionCooldown', { time: soloCooldownTime })}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-tertiary hover:text-on-surface bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/20 rounded-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                </button>
              )}
              <button
                data-testid="submit-action"
                type="submit"
                disabled={!customAction.trim() || disabled}
                className="shrink-0 text-primary hover:text-on-surface transition-all flex items-center justify-center w-8 h-8 rounded-sm hover:bg-primary/10 disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-lg">send</span>
              </button>
            </div>
            {listening && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 animate-pulse mt-1 block">
                {t('gameplay.voiceListening')}
              </span>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
