import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { apiClient } from '../../../services/apiClient';
import { ReadAloudButton } from '../chat/ChatMessageParts';

function randomD50() {
  return Math.floor(Math.random() * 50) + 1;
}

/** Raw d50 + modifier, clamped to 1..50 */
function applyRollModifier(raw, modifier) {
  return Math.min(50, Math.max(1, raw + modifier));
}

function formatModifier(m) {
  if (m === 0) return '0';
  return m > 0 ? `+${m}` : String(m);
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

export default function InventSpellModal({ campaignId, character = null, dispatch, onClose, onCorrectionsApplied }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const [view, setView] = useState('form'); // form | analyzing | result
  const [intent, setIntent] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refetchTriggered, setRefetchTriggered] = useState(false);
  /** Applied to both k50 rolls on submit; LPM −10, PPM +10 */
  const [rollModifier, setRollModifier] = useState(0);

  const success = useMemo(
    () => result?.outcome === 'success_existing' || result?.outcome === 'success_new',
    [result?.outcome],
  );
  const powerTier = result?.powerTier
    || (result?.powerRoll != null ? resolvePowerTier(result.powerRoll) : 'cantrip');

  useEffect(() => {
    if (!result || !success || refetchTriggered) return;
    if (typeof onCorrectionsApplied === 'function') onCorrectionsApplied();
    setRefetchTriggered(true);
  }, [result, success, refetchTriggered, onCorrectionsApplied]);

  const resetToForm = useCallback(() => {
    setView('form');
    setIntent('');
    setError(null);
    setResult(null);
    setIsSubmitting(false);
    setRefetchTriggered(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = intent.trim();
    if (!campaignId || !dispatch || !trimmed || trimmed.length < 10 || isSubmitting) return;

    const successRoll = applyRollModifier(randomD50(), rollModifier);
    const powerRoll = applyRollModifier(randomD50(), rollModifier);
    const characterId = character?.id || character?.backendId || null;

    setError(null);
    setResult(null);
    setView('analyzing');
    setIsSubmitting(true);
    setRefetchTriggered(false);

    try {
      const data = await apiClient.post(`/ai/campaigns/${campaignId}/invent-spell`, {
        intent: trimmed,
        successRoll,
        powerRoll,
        ...(characterId ? { characterId } : {}),
      });

      const rolledSuccess = data.outcome === 'success_existing' || data.outcome === 'success_new';
      const spellName = data.spell?.name ? String(data.spell.name).trim() : '';

      if (rolledSuccess && spellName) {
        const spellIcon = data.spell?.icon ? String(data.spell.icon).trim() : '';
        dispatch({
          type: 'APPLY_STATE_CHANGES',
          payload: {
            learnSpell: spellName,
            ...(spellIcon ? { learnSpellIcon: spellIcon } : {}),
          },
        });
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${Date.now()}_invent_spell`,
            role: 'system',
            subtype: 'spell_invented',
            content: t('system.spellLearned', { spell: spellName }),
            timestamp: Date.now(),
          },
        });
      }

      setResult(data);
      setView('result');
    } catch (err) {
      setError(err.message || t('gameplay.inventSpellFailCircumstances'));
      setView('form');
    } finally {
      setIsSubmitting(false);
    }
  }, [intent, campaignId, dispatch, character, isSubmitting, rollModifier, t]);

  const diceTooltip = t('gameplay.inventSpellDiceTooltip', { modifier: formatModifier(rollModifier) });

  const handleDiceClick = useCallback(() => {
    setRollModifier((m) => m - 10);
  }, []);

  const handleDiceContextMenu = useCallback((e) => {
    e.preventDefault();
    setRollModifier((m) => m + 10);
  }, []);

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

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 mr-3">
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    title={diceTooltip}
                    aria-label={diceTooltip}
                    onClick={handleDiceClick}
                    onContextMenu={handleDiceContextMenu}
                    disabled={isSubmitting}
                    className="shrink-0 flex items-center justify-center w-10 h-10 rounded-sm border border-outline-variant/25 bg-surface-container-high/50 hover:bg-surface-container-high hover:border-primary/30 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none"
                  >
                    <span className="material-symbols-outlined text-xl">casino</span>
                  </button>
                  <span className="text-[10px] text-on-surface-variant/60 truncate">{intent.length}/500</span>
                </div>
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

              {result.successRoll != null && (
                <div className="text-[11px] text-on-surface-variant/80 border border-outline-variant/10 rounded-sm px-3 py-1.5">
                  k50: <span className="font-mono font-label text-on-surface/90">{result.successRoll}</span>
                  {result.powerRoll != null && (
                    <>
                      {' · '}
                      {t('gameplay.inventSpellPowerRollHint', { roll: result.powerRoll })}
                    </>
                  )}
                </div>
              )}

              {success && result.luckySuccess && result.luckRoll != null && result.luckAttribute != null && (
                <p className="text-xs text-emerald-300/95 bg-emerald-500/10 border border-emerald-400/20 rounded-sm px-3 py-2 leading-snug">
                  {t('gameplay.inventSpellLuckRescue', { luckRoll: result.luckRoll, luck: result.luckAttribute })}
                </p>
              )}

              {!success && result.outcome === 'fail_roll' && result.successRoll != null && result.threshold != null && (
                <p className="text-xs text-on-surface-variant/90 bg-surface-container/50 border border-outline-variant/15 rounded-sm px-3 py-2 leading-snug">
                  {t('gameplay.inventSpellRollUnderFail', { threshold: result.threshold, roll: result.successRoll })}
                </p>
              )}

              {!success && !result.luckySuccess && (result.luckAttribute ?? 0) > 0 && result.luckRoll != null && (
                <p className="text-xs text-on-surface-variant/75 leading-snug">
                  {t('gameplay.inventSpellLuckMiss', { luckRoll: result.luckRoll, luck: result.luckAttribute })}
                </p>
              )}

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
                    <span className="material-symbols-outlined text-primary text-lg">
                      {result.spell.icon || 'menu_book'}
                    </span>
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
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                >
                  {t('gameplay.incidentClose')}
                </button>
                <button
                  type="button"
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
