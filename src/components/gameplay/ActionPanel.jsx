import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';
import { useActionTyping } from '../../hooks/useActionTyping';
import PendingActions from '../multiplayer/PendingActions';
import { parseActionSegments } from '../../services/actionParser';
import { TYPING_DRAFT_MAX_LENGTH } from '../../../shared/contracts/multiplayer.js';
import AnimatedTypingDraft from './action/AnimatedTypingDraft';
import QuickActionButton from './action/QuickActionButton';
import CombatTargetPicker from './action/CombatTargetPicker';
import TradeNpcPicker from './action/TradeNpcPicker';

const normalizeQuotes = (text) =>
  text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2018\u2019\u201A\u201B\u2039\u203A\uFF02`\u0060\u00B4]/g, '"');

export default function ActionPanel({
  actions = [],
  onAction,
  disabled,
  npcs = [],
  autoPlayerTypingText = '',
  character = null,
  dilemma = null,
  lastChosenAction = null,
  multiplayerPlayers = [],
  typingPlayers = {},
  dispatch = null,
  gameState = null,
}) {
  const [customAction, setCustomAction] = useState('');
  const [combatPickerOpen, setCombatPickerOpen] = useState(false);
  const [tradePickerOpen, setTradePickerOpen] = useState(false);
  const [longPressActiveIndex, setLongPressActiveIndex] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
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

  const { handleTypingChange, emitTypingStop, cancelPendingBroadcasts, isTypingRef } = useActionTyping({
    mp,
    isMultiplayer,
    setCustomAction,
  });

  useEffect(() => {
    return () => clearTimeout(longPressTimerRef.current);
  }, []);

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    const action = normalizeQuotes(customAction.trim());
    if (action && !disabled) {
      if (listening) toggle();
      cancelPendingBroadcasts();
      emitTypingStop(false);
      if (isMultiplayer) {
        mp.submitAction(action, true);
      } else {
        onAction(action, true);
      }
      setCustomAction('');
    }
  };

  const handleSuggestedAction = (action) => {
    if (longPressFiredRef.current) return;
    if (isMultiplayer) {
      mp.submitAction(action, false);
    } else {
      onAction(action, false);
    }
  };

  const handleLongPressDown = useCallback((index, action) => {
    longPressFiredRef.current = false;
    setLongPressActiveIndex(index);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setLongPressActiveIndex(null);
      setCustomAction(action);
      textareaRef.current?.focus();
    }, 1000);
  }, []);

  const handleLongPressUpOrLeave = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    setLongPressActiveIndex(null);
  }, []);

  const handleWithdraw = () => {
    mp.withdrawAction();
  };

  const handleApprove = () => {
    mp.approveActions(settings.language || 'en', settings.dmSettings);
  };

  const handleSoloSuggestedAction = (action) => {
    cancelPendingBroadcasts();
    emitTypingStop(false);
    mp.soloAction(action, false, settings.language || 'en', settings.dmSettings);
  };

  const handleSoloCustomSubmit = () => {
    const action = normalizeQuotes(customAction.trim());
    if (action) {
      if (listening) toggle();
      cancelPendingBroadcasts();
      emitTypingStop(false);
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
    () => teamPlayers.map((player) => {
      const isMe = player.odId === mp.state.myOdId;
      const localDraft = customAction.trim().slice(0, TYPING_DRAFT_MAX_LENGTH);
      const remoteTyping = typingByPlayer[player.odId] || null;
      const remoteDraft = (remoteTyping?.draft || '').trim();
      const pendingAction = typeof player.pendingAction === 'string' ? player.pendingAction.trim() : '';
      const effectiveDraft = isMe
        ? localDraft
        : (remoteDraft || pendingAction);
      const isTyping = isMe
        ? (isTypingRef.current && Boolean(localDraft))
        : Boolean(remoteTyping?.isTyping);
      const status = isTyping
        ? 'typing'
        : effectiveDraft
          ? 'ready'
          : 'idle';
      return {
        odId: player.odId,
        name: isMe ? t('chat.you') : (player.name || t('multiplayer.player', { defaultValue: 'Player' })),
        draft: effectiveDraft,
        isTyping,
        status,
      };
    }),
    [teamPlayers, typingByPlayer, mp.state.myOdId, customAction, t]
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
                <span className={`text-[9px] font-label uppercase tracking-widest ${
                  member.status === 'typing'
                    ? 'text-primary'
                    : member.status === 'ready'
                      ? 'text-tertiary'
                      : 'text-on-surface-variant/45'
                }`}>
                  {member.status}
                </span>
              </div>
              <div className={`text-[11px] leading-snug ${member.isTyping ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                <AnimatedTypingDraft text={member.draft} />
              </div>
            </div>
          ))}
        </div>
      )}

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
                  onPointerDown={() => handleLongPressDown(i, action)}
                  onPointerUp={handleLongPressUpOrLeave}
                  onPointerLeave={handleLongPressUpOrLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={disabled || hasPendingAction}
                  className="relative overflow-hidden flex-1 text-left px-3 py-2.5 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none hover:translate-y-[-1px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  <div
                    className="absolute inset-0 bg-primary/15 pointer-events-none origin-left"
                    style={{
                      transform: longPressActiveIndex === i ? 'scaleX(1)' : 'scaleX(0)',
                      transition: longPressActiveIndex === i ? 'transform 1s linear' : 'none',
                    }}
                  />
                  <div className="relative flex items-center gap-2">
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

          {combatPickerOpen && (
            <CombatTargetPicker
              npcs={npcs}
              disabled={disabled}
              onInitiateCombat={handleInitiateCombat}
              onAttackNpc={handleAttackNpc}
              onCancel={() => setCombatPickerOpen(false)}
            />
          )}

          {tradePickerOpen && dispatch && (
            <TradeNpcPicker
              npcs={npcs}
              dispatch={dispatch}
              onCancel={() => setTradePickerOpen(false)}
            />
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
          <div className="flex items-center gap-1.5 shrink-0">
            <QuickActionButton
              icon="skip_next"
              label={t('gameplay.continueButton')}
              description={lastChosenAction === '[CONTINUE]'
                ? t('gameplay.continueDisabledTooltip')
                : t('gameplay.continueChatMessage')}
              onClick={() => handleSuggestedAction('[CONTINUE]')}
              disabled={disabled || hasPendingAction || lastChosenAction === '[CONTINUE]'}
              tone="primary"
            />
            <QuickActionButton
              icon="hourglass_empty"
              label={t('gameplay.waitButton')}
              description={t('gameplay.waitSystemMessage')}
              onClick={() => handleSuggestedAction('[WAIT]')}
              disabled={disabled || hasPendingAction}
              tone="neutral"
            />
            <QuickActionButton
              icon="assignment"
              label={t('gameplay.searchForQuests')}
              description={t('gameplay.searchForQuestsAction')}
              onClick={() => handleSuggestedAction(t('gameplay.searchForQuestsAction'))}
              disabled={disabled || hasPendingAction}
              tone="tertiary"
            />
            <QuickActionButton
              icon="swords"
              label={t('gameplay.initiateCombat')}
              description={t('gameplay.generalCombat')}
              onClick={() => setCombatPickerOpen((v) => !v)}
              disabled={disabled || hasPendingAction}
              tone="danger"
            />
            {npcs.length > 0 && dispatch && !gameState?.trade?.active && (
              <QuickActionButton
                icon="storefront"
                label={t('trade.tradeWith')}
                description={t('trade.tradeWith')}
                onClick={() => setTradePickerOpen((v) => !v)}
                disabled={disabled || hasPendingAction}
                tone="tertiary"
              />
            )}
            {dispatch && !gameState?.crafting?.active && getSkillLevel(character?.skills, 'Rzemioslo') > 0 && (
              <QuickActionButton
                icon="construction"
                label={t('crafting.title')}
                description={t('crafting.recipes')}
                onClick={() => dispatch({ type: 'START_CRAFTING' })}
                disabled={disabled || hasPendingAction}
                tone="primary"
              />
            )}
            {dispatch && !gameState?.alchemy?.active && getSkillLevel(character?.skills, 'Alchemia') > 0 && (
              <QuickActionButton
                icon="science"
                label={t('alchemy.title')}
                description={t('alchemy.recipes')}
                onClick={() => dispatch({ type: 'START_ALCHEMY' })}
                disabled={disabled || hasPendingAction}
                tone="primary"
              />
            )}
            {settings.needsSystemEnabled && (
              <QuickActionButton
                icon="bedtime"
                label={t('gameplay.restButton')}
                description={t('gameplay.restAction')}
                onClick={() => handleSuggestedAction(t('gameplay.restAction'))}
                disabled={disabled || hasPendingAction}
                tone="indigo"
              />
            )}
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

function getSkillLevel(skills, name) {
  const e = skills?.[name];
  if (!e) return 0;
  return typeof e === 'object' ? (e.level || 0) : e;
}
