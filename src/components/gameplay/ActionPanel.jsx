import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSoloActionCooldown } from '../../hooks/useSoloActionCooldown';
import { useActionTyping } from '../../hooks/useActionTyping';
import PendingActions from '../multiplayer/PendingActions';
import { TYPING_DRAFT_MAX_LENGTH } from '../../../shared/contracts/multiplayer.js';
import CombatTargetPicker from './action/CombatTargetPicker';
import TradeNpcPicker from './action/TradeNpcPicker';
import TrainerNpcPicker from './action/TrainerNpcPicker';
import DilemmaPanel from './action/DilemmaPanel';
import TeammateTypingPanels from './action/TeammateTypingPanels';
import QuickActionsBar from './action/QuickActionsBar';
import CustomActionForm from './action/CustomActionForm';

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
}) {
  const [customAction, setCustomAction] = useState('');
  const [combatPickerOpen, setCombatPickerOpen] = useState(false);
  const [tradePickerOpen, setTradePickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [longPressActiveIndex, setLongPressActiveIndex] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const textareaRef = useRef(null);
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
    [teamPlayers, typingByPlayer, mp.state.myOdId, customAction, t, isTypingRef]
  );

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

      {isMultiplayer && <PendingActions />}

      {isMultiplayer && <TeammateTypingPanels panels={teammateTypingPanels} />}

      {dilemma && !hasPendingAction && (
        <DilemmaPanel
          dilemma={dilemma}
          disabled={disabled}
          onChoose={handleSuggestedAction}
        />
      )}

      {/* Suggested Actions */}
      {(!hasPendingAction || !isMultiplayer) && (
        <div className="space-y-2">
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

          {trainerPickerOpen && dispatch && (
            <TrainerNpcPicker
              trainers={npcs.filter((n) => Array.isArray(n.canTrain) && n.canTrain.length > 0)}
              character={character}
              dispatch={dispatch}
              onCancel={() => setTrainerPickerOpen(false)}
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
          <QuickActionsBar
            disabled={disabled}
            hasPendingAction={hasPendingAction}
            lastChosenAction={lastChosenAction}
            npcs={npcs}
            dispatch={dispatch}
            character={character}
            needsSystemEnabled={settings.needsSystemEnabled}
            onSuggestedAction={handleSuggestedAction}
            onToggleCombatPicker={() => setCombatPickerOpen((v) => !v)}
            onToggleTradePicker={() => setTradePickerOpen((v) => !v)}
            onToggleTrainerPicker={() => setTrainerPickerOpen((v) => !v)}
          />
          <CustomActionForm
            textareaRef={textareaRef}
            customAction={customAction}
            onTypingChange={handleTypingChange}
            onSubmit={handleCustomSubmit}
            onSoloSubmit={handleSoloCustomSubmit}
            disabled={disabled}
            autoPlayerTypingText={autoPlayerTypingText}
            listening={listening}
            supported={supported}
            interim={interim}
            onToggleVoice={toggle}
            isMultiplayer={isMultiplayer}
            soloAvailable={soloAvailable}
            soloCooldownTime={soloCooldownTime}
            isGenerating={mp.state.isGenerating}
          />
        </div>
      )}
    </div>
  );
}
