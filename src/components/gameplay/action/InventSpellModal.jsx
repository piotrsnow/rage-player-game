import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useMinigameAudio } from '../../../hooks/useMinigameAudio';
import { apiClient } from '../../../services/apiClient';
import { gameData } from '../../../services/gameDataService';
import { NarrableText } from '../../ui/NarrableText';
import RollModifierDie, { randomD50, applyRollModifier } from '../../ui/RollModifierDie';
import DiceRoller, { MODAL_DICE_DURATION_MULT, MODAL_DICE_STAGE_CLASS } from '../../../effects/DiceRoller';

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

const PREROLL_HOLD_MS = 1800;
const RESULT_REVEAL_DELAY_MS = 600;
const INVENT_SPELL_DICE_THEME = {
  materialColor: 0x5fd12f,
  materialSpecular: 0x2f5a12,
  labelColor: '#f2ffd8',
  diceColor: '#0d4215',
  ambientLightColor: 0xb7ff6a,
  ambientLightIntensity: 0.62,
  spotLightColor: 0xf1ffc7,
  spotLightIntensity: 0.78,
  deskColor: '#031b08',
};

export default function InventSpellModal({ campaignId, character = null, dispatch, onClose, onAction = null }) {
  const { t } = useTranslation();
  const playSfx = useMinigameAudio();
  const modalRef = useModalA11y(onClose);
  const [view, setView] = useState('form'); // form | analyzing | preroll | rolling | result
  const [intent, setIntent] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Applied to both k50 rolls on submit; LPM −10, PPM +10 */
  const [rollModifier, setRollModifier] = useState(0);

  const success = useMemo(
    () => result?.outcome === 'success_existing' || result?.outcome === 'success_new',
    [result?.outcome],
  );
  const powerTier = result?.powerTier
    || (result?.powerRoll != null ? resolvePowerTier(result.powerRoll) : 'cantrip');

  const inventSpellDiceRoll = useMemo(
    () => (result?.successRoll != null ? { roll: result.successRoll } : null),
    [result?.successRoll],
  );

  useEffect(() => {
    if (view !== 'preroll') return;
    const timer = setTimeout(() => setView('rolling'), PREROLL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [view]);

  const handleDiceRollStart = useCallback(() => {
    playSfx('diceShake');
  }, [playSfx]);

  const handleDiceRollComplete = useCallback(() => {
    playSfx('diceLand');
    setTimeout(() => setView('result'), RESULT_REVEAL_DELAY_MS);
  }, [playSfx]);

  const resetToForm = useCallback(() => {
    setView('form');
    setIntent('');
    setError(null);
    setResult(null);
    setIsSubmitting(false);
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
            ...(data.customSpellId ? { learnCustomSpellId: data.customSpellId } : {}),
            ...(spellIcon ? { learnSpellIcon: spellIcon } : {}),
            ...(data.spell?.school ? { learnSpellSchool: data.spell.school } : {}),
            ...(data.spell?.description ? { learnSpellDescription: data.spell.description } : {}),
            ...(data.spell?.longDescription ? { learnSpellLongDescription: data.spell.longDescription } : {}),
          },
        });
        // Refresh global catalog so SpellsTab's catalog fallback picks up the
        // new spell's id + combatStats (which the BE auto-generates async)
        // even before the next page reload.
        gameData.refreshCustomSpells().catch(() => {});
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
      setView('preroll');
    } catch (err) {
      setError(err.message || t('gameplay.inventSpellFailCircumstances'));
      setView('form');
    } finally {
      setIsSubmitting(false);
    }
  }, [intent, campaignId, dispatch, character, isSubmitting, rollModifier, t]);

  const handlePlayScene = useCallback(() => {
    const spellName = result?.spell?.name;
    if (typeof onAction === 'function' && spellName) {
      onAction(`Próbuję nowo poznane zaklęcie „${spellName}"`, true);
    }
    onClose();
  }, [result, onAction, onClose]);

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

        <div className={`flex-1 custom-scrollbar p-5 space-y-4 mr-3 ${view === 'rolling' || view === 'preroll' ? 'overflow-visible' : 'overflow-y-auto'}`}>
          {view === 'form' && (
            <>
              <p className="text-xs text-on-surface-variant/70 leading-relaxed">{t('gameplay.inventSpellHint')}</p>
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSubmit();
                  }
                }}
                placeholder={t('gameplay.inventSpellPlaceholder')}
                disabled={isSubmitting}
                rows={5}
                maxLength={500}
                className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-on-surface-variant/40">Shift+Enter — wyślij</span>
                  <RollModifierDie
                    value={rollModifier}
                    onChange={setRollModifier}
                    disabled={isSubmitting}
                  />
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

          {/* Preroll: show modifiers & threshold before dice fly */}
          {view === 'preroll' && result && (
            <div className="py-6 space-y-4 animate-fade-in">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70 text-center">
                {t('gameplay.inventSpellCheckTitle', 'Test wymyślania zaklęcia')}
              </p>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('gameplay.inventSpellThresholdLabel')}</span>
                  <span className="font-mono text-2xl font-black text-on-surface/80">{result.threshold}</span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('gameplay.inventSpellModifiers', 'Modyfikatory')}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {result.intelligence != null && (
                      <span className="text-purple-300/80 font-label">{t('attributes.inteligencja', 'Int')} +{result.intelligence}</span>
                    )}
                    {result.luck != null && (
                      <span className="text-emerald-300/80 font-label">{t('attributes.szczescie', 'Szcz')} +{result.luck}</span>
                    )}
                    {result.favorability != null && result.favorability !== 0 && (
                      <span className="text-orange-300/80 font-label">{result.favorability > 0 ? '+' : ''}{result.favorability} {t('gameplay.inventSpellCircumstances', 'okol.')}</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/50 text-center animate-pulse">
                {t('gameplay.inventSpellRolling', 'Rzucam kośćmi...')}
              </p>
            </div>
          )}

          {/* Rolling: 3D dice animation */}
          {view === 'rolling' && result && (
            <div className="py-4 space-y-3 animate-fade-in">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70 text-center">
                {t('gameplay.inventSpellCheckTitle', 'Test wymyślania zaklęcia')}
              </p>
              <div className="flex items-center justify-center gap-4 mb-2">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('gameplay.inventSpellThresholdLabel')}</span>
                  <span className="font-mono text-2xl font-black text-on-surface/80">{result.threshold}</span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('gameplay.inventSpellModifiers', 'Modyfikatory')}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {result.intelligence != null && (
                      <span className="text-purple-300/80 font-label">{t('attributes.inteligencja', 'Int')} +{result.intelligence}</span>
                    )}
                    {result.luck != null && (
                      <span className="text-emerald-300/80 font-label">{t('attributes.szczescie', 'Szcz')} +{result.luck}</span>
                    )}
                    {result.favorability != null && result.favorability !== 0 && (
                      <span className="text-orange-300/80 font-label">{result.favorability > 0 ? '+' : ''}{result.favorability} {t('gameplay.inventSpellCircumstances', 'okol.')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className={MODAL_DICE_STAGE_CLASS}>
                <DiceRoller
                  diceRoll={inventSpellDiceRoll}
                  onRollStart={handleDiceRollStart}
                  onComplete={handleDiceRollComplete}
                  showOverlayResult={false}
                  sizeMultiplier={2.2}
                  durationMultiplier={MODAL_DICE_DURATION_MULT}
                  variant="overlay"
                  overlayTheme={INVENT_SPELL_DICE_THEME}
                  isVisible
                  skipOnClick
                  skipOnClickTitle={t('gameplay.inventSpellSkipDice', 'Kliknij, aby zakończyć animację')}
                />
              </div>
            </div>
          )}

          {view === 'result' && result && (
            <div className="space-y-4 animate-fade-in">
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
                  {t('gameplay.inventSpellSumLabel', 'Suma')}: <span className={`font-mono font-label ${success ? 'text-sky-300' : 'text-rose-400'}`}>{result.sum}</span>
                  <span className="text-on-surface-variant/60 mx-1">vs</span>
                  {t('gameplay.inventSpellThresholdLabel')}: <span className="text-on-surface font-label">{result.threshold}</span>
                </div>
                <div className={`border rounded-sm px-3 py-2 ${toneByTier(powerTier)}`}>
                  {t('gameplay.inventSpellPowerTierLabel')}: <span className="font-label">{powerTier}</span>
                </div>
              </div>

              {result.successRoll != null && (
                <div className="text-[11px] text-on-surface-variant/80 border border-outline-variant/10 rounded-sm px-3 py-1.5 space-x-2">
                  <span>k50: <span className="font-mono font-label text-on-surface/90">{result.successRoll}</span></span>
                  {result.intelligence != null && (
                    <span>+ {t('attributes.inteligencja', 'Int')}: <span className="font-mono font-label text-purple-300/80">{result.intelligence}</span></span>
                  )}
                  {result.luck != null && (
                    <span>+ {t('attributes.szczescie', 'Szcz')}: <span className="font-mono font-label text-emerald-300/80">{result.luck}</span></span>
                  )}
                  {result.favorability != null && result.favorability !== 0 && (
                    <span>{result.favorability > 0 ? '+' : ''}<span className="font-mono font-label text-orange-300/80">{result.favorability}</span> {t('gameplay.inventSpellCircumstances', 'okol.')}</span>
                  )}
                  {result.powerRoll != null && (
                    <span className="text-on-surface-variant/60">· {t('gameplay.inventSpellPowerRollHint', { roll: result.powerRoll })}</span>
                  )}
                </div>
              )}

              {success && result.luckySuccess && result.luckRoll != null && result.luckAttribute != null && (
                <p className="text-xs text-emerald-300/95 bg-emerald-500/10 border border-emerald-400/20 rounded-sm px-3 py-2 leading-snug">
                  {t('gameplay.inventSpellLuckRescue', { luckRoll: result.luckRoll, luck: result.luckAttribute })}
                </p>
              )}

              {!success && result.outcome === 'fail_roll' && result.sum != null && result.threshold != null && (
                <p className="text-xs text-on-surface-variant/90 bg-surface-container/50 border border-outline-variant/15 rounded-sm px-3 py-2 leading-snug">
                  {t('gameplay.inventSpellRollFail', { threshold: result.threshold, sum: result.sum })}
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
                    <NarrableText text={result.narrativeComment} className="text-sm text-on-surface/85 leading-relaxed italic flex-1" />
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
                  {result.spell.longDescription && (
                    <div className="mt-2 pt-2 border-t border-primary/10">
                      <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/60 mb-1">
                        {t('gameplay.inventSpellLore', 'Historia powstania')}
                      </p>
                      <p className="text-xs text-on-surface/75 leading-relaxed italic">{result.spell.longDescription}</p>
                    </div>
                  )}
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
                {success && result.spell?.name && onAction && (
                  <button
                    type="button"
                    onClick={handlePlayScene}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-label text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/25 rounded-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">auto_stories</span>
                    {t('gameplay.inventSpellPlayScene')}
                  </button>
                )}
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
