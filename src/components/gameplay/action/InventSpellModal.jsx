import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { apiClient } from '../../../services/apiClient';
import { ReadAloudButton } from '../chat/ChatMessageParts';

const DICE_ANIMATION_MS = 4800;
const POWER_COUNT_MS = 2000;
const POWER_TOTAL_MS = 3000;

function randomD50() {
  return Math.floor(Math.random() * 50) + 1;
}

function resolvePowerTier(powerRoll) {
  if (powerRoll <= 15) return 'cantrip';
  if (powerRoll <= 30) return 'standard';
  if (powerRoll <= 45) return 'strong';
  return 'legendary';
}

function toneByTier(powerTier) {
  if (powerTier === 'legendary') return 'text-amber-300 border-amber-400/35 bg-amber-500/10';
  if (powerTier === 'strong') return 'text-violet-300 border-violet-400/35 bg-violet-500/10';
  if (powerTier === 'standard') return 'text-sky-300 border-sky-400/35 bg-sky-500/10';
  return 'text-emerald-300 border-emerald-400/35 bg-emerald-500/10';
}

function titleByOutcome(outcome, t) {
  if (outcome === 'success_new') return t('gameplay.inventSpellSuccessNew');
  if (outcome === 'success_existing') return t('gameplay.inventSpellSuccessExisting');
  if (outcome === 'fail_circumstances') return t('gameplay.inventSpellFailCircumstances');
  return t('gameplay.inventSpellFailRoll');
}

export default function InventSpellModal({ campaignId, dispatch, onClose, onCorrectionsApplied }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const [view, setView] = useState('form'); // form | analyzing | rolling-success | rolling-power | result
  const [intent, setIntent] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [pendingRolls, setPendingRolls] = useState(null);
  const [displayedPowerRoll, setDisplayedPowerRoll] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refetchTriggered, setRefetchTriggered] = useState(false);
  const timerRef = useRef(null);

  const success = useMemo(
    () => result?.outcome === 'success_existing' || result?.outcome === 'success_new',
    [result?.outcome],
  );
  const powerTier = result?.powerTier || (pendingRolls ? resolvePowerTier(pendingRolls.powerRoll) : 'cantrip');

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!result || !success || refetchTriggered) return;
    if (typeof onCorrectionsApplied === 'function') onCorrectionsApplied();
    setRefetchTriggered(true);
  }, [result, success, refetchTriggered, onCorrectionsApplied]);

  useEffect(() => {
    if (view !== 'rolling-power' || !pendingRolls) return undefined;

    let current = 1;
    setDisplayedPowerRoll(1);
    const stepMs = Math.max(30, Math.floor(POWER_COUNT_MS / pendingRolls.powerRoll));
    const interval = setInterval(() => {
      current += 1;
      if (current >= pendingRolls.powerRoll) {
        current = pendingRolls.powerRoll;
        clearInterval(interval);
      }
      setDisplayedPowerRoll(current);
    }, stepMs);

    return () => clearInterval(interval);
  }, [view, pendingRolls]);

  const resetToForm = useCallback(() => {
    clearTimer();
    setView('form');
    setIntent('');
    setError(null);
    setResult(null);
    setPendingRolls(null);
    setDisplayedPowerRoll(1);
    setIsSubmitting(false);
    setRefetchTriggered(false);
  }, [clearTimer]);

  const handleSubmit = useCallback(async () => {
    const trimmed = intent.trim();
    if (!campaignId || !dispatch || !trimmed || trimmed.length < 10 || isSubmitting) return;

    const successRoll = randomD50();
    const powerRoll = randomD50();

    setError(null);
    setResult(null);
    setPendingRolls({ successRoll, powerRoll });
    setView('analyzing');
    setIsSubmitting(true);
    setRefetchTriggered(false);

    try {
      const data = await apiClient.post(`/ai/campaigns/${campaignId}/invent-spell`, {
        intent: trimmed,
        successRoll,
        powerRoll,
      });
      setResult(data);
      setView('rolling-success');

      const rolledSuccess = data.outcome === 'success_existing' || data.outcome === 'success_new';
      dispatch({
        type: 'SET_LOCAL_DICE_ROLL',
        payload: {
          skill: 'Wymyślanie zaklęcia',
          attribute: 'inteligencja',
          threshold: data.threshold,
          rolledValue: successRoll,
          success: rolledSuccess,
          criticalSuccess: successRoll === 1,
          criticalFailure: successRoll === 50,
        },
      });

      clearTimer();
      timerRef.current = setTimeout(() => {
        if (rolledSuccess) {
          setView('rolling-power');
          clearTimer();
          timerRef.current = setTimeout(() => setView('result'), POWER_TOTAL_MS);
        } else {
          setView('result');
        }
      }, DICE_ANIMATION_MS);
    } catch (err) {
      setError(err.message || t('gameplay.inventSpellFailCircumstances'));
      setView('form');
    } finally {
      setIsSubmitting(false);
    }
  }, [intent, campaignId, dispatch, isSubmitting, t, clearTimer]);

  const headerTitle = titleByOutcome(result?.outcome, t);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/15">
          <h2 className="font-headline text-base text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">auto_awesome</span>
            {t('gameplay.inventSpellTitle')}
          </h2>
          <button onClick={onClose} aria-label={t('gameplay.incidentClose')} className="text-on-surface-variant hover:text-primary transition-colors p-1">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {view === 'form' && (
            <>
              <p className="text-xs text-on-surface-variant/70 leading-relaxed">{t('gameplay.inventSpellHint')}</p>
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder={t('gameplay.inventSpellPlaceholder')}
                disabled={isSubmitting}
                rows={5}
                maxLength={500}
                className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-on-surface-variant/60">{intent.length}/500</span>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || intent.trim().length < 10}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-sm text-primary text-sm font-label transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      {t('gameplay.inventSpellAnalyzing')}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">send</span>
                      {t('gameplay.inventSpellSubmit')}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {view === 'analyzing' && (
            <div className="py-10 flex flex-col items-center gap-3 text-on-surface-variant/80">
              <span className="material-symbols-outlined animate-spin text-2xl text-primary">progress_activity</span>
              <p className="text-sm">{t('gameplay.inventSpellAnalyzing')}</p>
            </div>
          )}

          {view === 'rolling-success' && result && (
            <div className="py-10 flex flex-col items-center gap-3 text-on-surface-variant/80">
              <span className="material-symbols-outlined animate-spin text-2xl text-primary">casino</span>
              <p className="text-sm">{t('gameplay.inventSpellRollingSuccess')}</p>
            </div>
          )}

          {view === 'rolling-power' && result && (
            <div className="py-8 space-y-4">
              <p className="text-sm text-center text-on-surface-variant/80">{t('gameplay.inventSpellRollingPower')}</p>
              <div className="mx-auto w-36 h-36 rounded-sm border border-primary/20 bg-surface-container-high/50 flex flex-col items-center justify-center">
                <span className="text-5xl font-headline text-on-surface">{displayedPowerRoll}</span>
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/70">d50</span>
              </div>
              <div className={`mx-auto max-w-xs text-center border rounded-sm px-3 py-2 text-xs font-label uppercase tracking-widest ${toneByTier(powerTier)}`}>
                {t('gameplay.inventSpellPowerTierLabel')}: {powerTier}
              </div>
            </div>
          )}

          {view === 'result' && result && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border ${
                success
                  ? 'bg-green-500/10 border-green-400/25 text-green-300'
                  : 'bg-red-500/10 border-red-400/25 text-red-300'
              }`}>
                <span className="material-symbols-outlined text-lg">{success ? 'check_circle' : 'cancel'}</span>
                <span className="text-sm font-label">{headerTitle}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface/80">
                  {t('gameplay.inventSpellThresholdLabel')}: <span className="text-on-surface font-label">{result.threshold}</span>
                </div>
                <div className={`border rounded-sm px-3 py-2 ${toneByTier(powerTier)}`}>
                  {t('gameplay.inventSpellPowerTierLabel')}: <span className="font-label">{powerTier}</span>
                </div>
              </div>

              <p className="text-sm text-on-surface/90 leading-relaxed">{result.verdict}</p>

              {result.narrativeComment && (
                <div className="bg-primary/5 border border-primary/15 rounded-sm px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary/60 text-sm mt-0.5 shrink-0">auto_stories</span>
                    <p className="text-sm text-on-surface/85 leading-relaxed italic flex-1">{result.narrativeComment}</p>
                    <ReadAloudButton text={result.narrativeComment} />
                  </div>
                </div>
              )}

              {success && result.spell && (
                <div className="border border-primary/20 rounded-sm bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">menu_book</span>
                    <h3 className="font-headline text-sm text-on-surface">{result.spell.name}</h3>
                    {result.isNew && (
                      <span className="ml-auto text-[10px] font-label px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary/80 uppercase tracking-widest">
                        {t('gameplay.inventSpellNew')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant/75">
                    {t('gameplay.inventSpellSchool')}: <span className="text-on-surface/90">{result.spell.school || '-'}</span>
                  </div>
                  <div className="text-xs text-on-surface-variant/75">
                    {t('gameplay.inventSpellMana')}: <span className="text-on-surface/90">{result.spell.manaCost}</span>
                  </div>
                  <p className="text-xs text-on-surface/85 leading-relaxed">{result.spell.description}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                >
                  {t('gameplay.incidentClose')}
                </button>
                <button
                  onClick={resetToForm}
                  className="flex-1 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                >
                  {t('gameplay.inventSpellTryAgain')}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
