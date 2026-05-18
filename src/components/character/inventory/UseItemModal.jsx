import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useMinigameAudio } from '../../../hooks/useMinigameAudio';
import { useInventoryActions } from '../../../hooks/useInventoryActions';
import { NarrableText } from '../../ui/NarrableText';
import RollModifierDie, { randomD50, applyRollModifier } from '../../ui/RollModifierDie';
import DiceRoller, { MODAL_DICE_DURATION_MULT, MODAL_DICE_STAGE_CLASS } from '../../../effects/DiceRoller';
import { typeIcons } from './constants';

const PREROLL_HOLD_MS = 1800;
const RESULT_REVEAL_DELAY_MS = 600;
const COMBINE_DICE_THEME = {
  materialColor: 0xb78cff,
  materialSpecular: 0x4a2a8a,
  labelColor: '#e8d8ff',
  diceColor: '#1a0a45',
  ambientLightColor: 0x9070ff,
  ambientLightIntensity: 0.58,
  spotLightColor: 0xefdcff,
  spotLightIntensity: 0.72,
  deskColor: '#0a0220',
};

function TargetButton({ icon, label, sublabel, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-all ${
        selected
          ? 'bg-tertiary/20 border-tertiary/50 text-on-surface shadow-[0_0_10px_rgba(197,154,255,0.25)]'
          : 'bg-surface-container-highest/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-highest/70 hover:border-tertiary/30 hover:text-on-surface'
      }`}
    >
      {icon && (
        <span
          className={`material-symbols-outlined text-base ${selected ? 'text-tertiary' : 'text-on-surface-variant/70'}`}
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
        >
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-headline text-xs leading-tight truncate">{label}</div>
        {sublabel && (
          <div className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant/60 truncate mt-0.5">
            {sublabel}
          </div>
        )}
      </div>
    </button>
  );
}

function OutcomeBadge({ outcome, t }) {
  const isSuccess = outcome === 'success';
  const isCritFail = outcome === 'crit_fail';
  const tone = isSuccess
    ? 'bg-green-500/10 border-green-400/25 text-green-300'
    : isCritFail
      ? 'bg-error/15 border-error/40 text-error'
      : 'bg-amber-500/10 border-amber-400/25 text-amber-300';
  const icon = isSuccess ? 'check_circle' : isCritFail ? 'dangerous' : 'cancel';
  const label = isSuccess
    ? t('inventory.combineSuccess', 'Udane łączenie')
    : isCritFail
      ? t('inventory.combineCritFail', 'Katastrofa! Obydwa przedmioty zniszczone')
      : t('inventory.combineFail', 'Nieudane łączenie');
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border ${tone}`}>
      <span className="material-symbols-outlined text-lg">{icon}</span>
      <span className="text-sm font-label">{label}</span>
    </div>
  );
}

export default function UseItemModal({
  item,
  character,
  npcs = [],
  items = [],
  campaignId = null,
  dispatch = null,
  onSubmit,
  onClose,
}) {
  const { t } = useTranslation();
  const playSfx = useMinigameAudio();
  const modalRef = useModalA11y(onClose);

  const [target, setTarget] = useState({ type: 'none', id: null });
  const [description, setDescription] = useState('');

  // Combine-only state (target.type === 'item')
  const [view, setView] = useState('form'); // form | analyzing | preroll | rolling | result
  const [rollModifier, setRollModifier] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCombineTarget = target.type === 'item';
  const canCombine = isCombineTarget && Boolean(campaignId && dispatch);
  const trimmed = description.trim();
  // Combine intent is optional; for non-combine flows we still require text.
  const canSubmit = isCombineTarget ? !isSubmitting : trimmed.length > 0;

  const icon = typeIcons[item.type] || typeIcons.misc;

  const { combineItems } = useInventoryActions(character, dispatch);

  const combineDiceRoll = useMemo(
    () => (result?.successRoll != null ? { roll: result.successRoll } : null),
    [result?.successRoll],
  );

  useEffect(() => {
    if (view !== 'preroll') return undefined;
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
    setResult(null);
    setError(null);
    setIsSubmitting(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    if (isCombineTarget) {
      // Combine flow: single-shot endpoint, internal preroll → rolling → result.
      if (!canCombine) {
        setError(t('inventory.combineNoCampaign', 'Łączenie wymaga aktywnej kampanii.'));
        return;
      }
      const otherId = target.id;
      if (!otherId) return;

      const successRoll = applyRollModifier(randomD50(), rollModifier);
      const powerRoll = applyRollModifier(randomD50(), rollModifier);

      setError(null);
      setResult(null);
      setView('analyzing');
      setIsSubmitting(true);
      try {
        const data = await combineItems(campaignId, {
          sourceIds: [item.id, otherId],
          intent: trimmed,
          successRoll,
          powerRoll,
        });
        setResult(data);
        setView('preroll');
      } catch (err) {
        setError(err?.message || t('inventory.combineFailedGeneric', 'Łączenie nie powiodło się.'));
        setView('form');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Legacy path: build action text, hand off to scene-gen via onSubmit.
    let actionText;
    let targetLabel = null;
    if (target.type === 'self') targetLabel = character?.name || null;
    else if (target.type === 'npc') targetLabel = npcs.find((n) => n.id === target.id)?.name || null;
    const targetTag = targetLabel ? ` [CEL: ${targetLabel}]` : '';
    actionText = `[UŻYCIE PRZEDMIOTU: ${item.name}]${targetTag} ${trimmed}`;
    onSubmit(actionText);
  }, [
    canSubmit, isCombineTarget, canCombine, target, campaignId, combineItems,
    item.id, item.name, trimmed, rollModifier, character, npcs, onSubmit, t,
  ]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  };

  const handlePlayResultScene = useCallback(() => {
    const name = result?.result?.name;
    if (name && onSubmit) {
      onSubmit(`[UŻYCIE PRZEDMIOTU: ${name}] Próbuję użyć nowego przedmiotu w akcji.`);
    } else {
      onClose();
    }
  }, [result, onSubmit, onClose]);

  const sourceA = item;
  const sourceB = isCombineTarget ? items.find((i) => i.id === target.id) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface-container-highest/95 backdrop-blur-2xl border border-tertiary/30 rounded-sm shadow-2xl shadow-tertiary/10"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-tertiary text-xl shrink-0"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="font-headline text-tertiary text-sm leading-tight truncate">
                {isCombineTarget
                  ? t('inventory.combineTitle', 'Łączenie przedmiotów')
                  : t('inventory.useItemTitle', 'Użyj przedmiotu')}
              </h3>
              <p className="text-[11px] text-on-surface-variant/70 truncate">{item.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Zamknij')}
            className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-surface-container/50 text-on-surface-variant shrink-0"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className={`custom-scrollbar p-4 space-y-4 ${view === 'rolling' || view === 'preroll' ? 'overflow-visible' : 'overflow-y-auto'}`}>
          {view === 'form' && (
            <>
              <div>
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70 block mb-2">
                  {t('inventory.useItemTarget', 'Cel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <TargetButton
                    icon="block"
                    label={t('inventory.useItemNoTarget', 'Brak celu')}
                    selected={target.type === 'none'}
                    onClick={() => setTarget({ type: 'none', id: null })}
                  />
                  <TargetButton
                    icon="person"
                    label={t('inventory.useItemPlayer', 'Moja postać')}
                    sublabel={character?.name}
                    selected={target.type === 'self'}
                    onClick={() => setTarget({ type: 'self', id: null })}
                  />
                  {npcs.map((npc) => (
                    <TargetButton
                      key={`npc-${npc.id}`}
                      icon="groups"
                      label={npc.name}
                      sublabel={t('inventory.useItemTargetNpc', 'NPC')}
                      selected={target.type === 'npc' && target.id === npc.id}
                      onClick={() => setTarget({ type: 'npc', id: npc.id })}
                    />
                  ))}
                  {items.map((it) => (
                    <TargetButton
                      key={`item-${it.id}`}
                      icon={typeIcons[it.type] || typeIcons.misc}
                      label={it.name}
                      sublabel={t('inventory.useItemTargetItem', 'Połącz z…')}
                      selected={target.type === 'item' && target.id === it.id}
                      onClick={() => setTarget({ type: 'item', id: it.id })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70 block mb-2">
                  {isCombineTarget
                    ? t('inventory.combineIntentLabel', 'Jak łączysz? (opcjonalnie)')
                    : t('inventory.useItemAction', 'Co chcesz zrobić?')}
                </label>
                <textarea
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={4}
                  placeholder={isCombineTarget
                    ? t('inventory.combineIntentPlaceholder', 'Opisz krótko jak łączysz oba przedmioty… (możesz zostawić puste)')
                    : t('inventory.useItemPlaceholder', 'Opisz co robisz z tym przedmiotem... Kreatywność jest bonusowana!')}
                  className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-tertiary/50 focus:bg-surface-container/80 resize-none"
                />
                <span className="text-[10px] text-on-surface-variant/40 mt-1">Shift+Enter — wyślij</span>
              </div>

              {isCombineTarget && (
                <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <RollModifierDie
                      value={rollModifier}
                      onChange={setRollModifier}
                      disabled={isSubmitting}
                    />
                    <span className="text-[10px] text-on-surface-variant/60 truncate">
                      {t('inventory.combineDiceHint', 'LPM −10 / PPM +10. Crit fail (1) zniszczy oba przedmioty.')}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-error bg-error/10 border border-error/20 rounded-sm px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}

          {view === 'analyzing' && (
            <div className="py-10 flex flex-col items-center gap-3 text-on-surface-variant/80">
              <span className="material-symbols-outlined animate-spin text-2xl text-tertiary">progress_activity</span>
              <p className="text-sm">{t('inventory.combineAnalyzing', 'Łączenie składników...')}</p>
            </div>
          )}

          {(view === 'preroll' || view === 'rolling') && result && (
            <div className="py-6 space-y-4 animate-fade-in">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70 text-center">
                {t('inventory.combineCheckTitle', 'Test łączenia')}
              </p>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('inventory.combineThresholdLabel', 'Próg')}</span>
                  <span className="font-mono text-2xl font-black text-on-surface/80">{result.threshold}</span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('inventory.combineModifiers', 'Modyfikatory')}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {result.intelligence != null && (
                      <span className="text-purple-300/80 font-label">{t('attributes.inteligencja', 'Int')} +{result.intelligence}</span>
                    )}
                    {result.skill != null && result.skill > 0 && (
                      <span className="text-amber-300/80 font-label">Rzem. +{result.skill}</span>
                    )}
                    {result.luck != null && (
                      <span className="text-emerald-300/80 font-label">{t('attributes.szczescie', 'Szcz')} +{result.luck}</span>
                    )}
                  </div>
                </div>
              </div>
              {view === 'preroll' && (
                <p className="text-[10px] text-on-surface-variant/50 text-center animate-pulse">
                  {t('inventory.combineRolling', 'Rzucam kośćmi...')}
                </p>
              )}
              {view === 'rolling' && (
                <div className={MODAL_DICE_STAGE_CLASS}>
                  <DiceRoller
                    diceRoll={combineDiceRoll}
                    onRollStart={handleDiceRollStart}
                    onComplete={handleDiceRollComplete}
                    showOverlayResult={false}
                    sizeMultiplier={2.2}
                    durationMultiplier={MODAL_DICE_DURATION_MULT}
                    variant="overlay"
                    overlayTheme={COMBINE_DICE_THEME}
                    isVisible
                    skipOnClick
                    skipOnClickTitle={t('inventory.combineSkipDice', 'Kliknij, aby zakończyć animację')}
                  />
                </div>
              )}
            </div>
          )}

          {view === 'result' && result && (
            <div className="space-y-4 animate-fade-in">
              <OutcomeBadge outcome={result.outcome} t={t} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface/80">
                  {t('inventory.combineSumLabel', 'Suma')}: <span className={`font-mono font-label ${result.outcome === 'success' ? 'text-sky-300' : 'text-rose-400'}`}>{result.sum}</span>
                  <span className="text-on-surface-variant/60 mx-1">vs</span>
                  {result.threshold}
                </div>
                {result.powerRoll != null && (
                  <div className="border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface/80">
                    {t('inventory.combinePowerLabel', 'Power')}: <span className="font-mono font-label text-amber-300">{result.powerRoll}</span>
                  </div>
                )}
              </div>

              {result.luckySuccess && (
                <p className="text-xs text-emerald-300/95 bg-emerald-500/10 border border-emerald-400/20 rounded-sm px-3 py-2 leading-snug">
                  {t('inventory.combineLuckRescue', { luckRoll: result.luckRoll, luck: result.luck, defaultValue: 'Czyste szczęście! ({{luckRoll}} ≤ {{luck}}).' })}
                </p>
              )}

              {sourceA && sourceB && (
                <div className="text-[11px] text-on-surface-variant/70 border border-outline-variant/15 rounded-sm px-3 py-2">
                  <span className="font-label">{sourceA.name}</span>
                  <span className="mx-2">+</span>
                  <span className="font-label">{sourceB.name}</span>
                </div>
              )}

              <p className="text-sm text-on-surface/90 leading-relaxed">{result.verdict}</p>

              {result.outcome === 'success' && result.result && (
                <div className="border border-tertiary/30 rounded-sm bg-tertiary/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary text-lg">
                      {result.result.icon || 'inventory_2'}
                    </span>
                    <h3 className="font-headline text-sm text-on-surface flex-1">{result.result.name}</h3>
                    <span className="text-[10px] font-label uppercase tracking-widest text-tertiary/80">
                      {result.result.rarity}
                    </span>
                  </div>
                  {result.result.description && (
                    <NarrableText text={result.result.description} className="text-xs text-on-surface/80 leading-relaxed" />
                  )}
                  {result.result.longDescription && (
                    <div className="mt-2 pt-2 border-t border-tertiary/15">
                      <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50 mb-1">
                        {t('inventory.combineLoreLabel', 'Historia')}
                      </p>
                      <p className="text-xs text-on-surface/70 leading-relaxed italic">{result.result.longDescription}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                >
                  {t('common.close', 'Zamknij')}
                </button>
                {result.outcome === 'success' && result.result?.name && onSubmit && (
                  <button
                    type="button"
                    onClick={handlePlayResultScene}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-label text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/25 rounded-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">auto_stories</span>
                    {t('inventory.combinePlayScene', 'Spróbuj nowego przedmiotu')}
                  </button>
                )}
                {result.outcome === 'fail_roll' && (
                  <button
                    type="button"
                    onClick={resetToForm}
                    className="flex-1 px-3 py-2 text-xs font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                  >
                    {t('inventory.combineTryAgain', 'Spróbuj ponownie')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {view === 'form' && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-outline-variant/15 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] font-label uppercase tracking-wider text-on-surface-variant hover:text-on-surface border border-outline-variant/15 hover:border-outline-variant/30 rounded-sm transition-colors"
            >
              {t('common.cancel', 'Anuluj')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || (isCombineTarget && !canCombine)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm border transition-all ${
                canSubmit && !(isCombineTarget && !canCombine)
                  ? 'bg-tertiary/20 text-tertiary border-tertiary/40 hover:bg-tertiary/30 shadow-[0_0_10px_rgba(197,154,255,0.2)]'
                  : 'bg-surface-container/30 text-on-surface-variant/40 border-outline-variant/10 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{isCombineTarget ? 'merge_type' : 'play_arrow'}</span>
              {isCombineTarget
                ? t('inventory.combineSubmit', 'Połącz')
                : t('inventory.useItemSubmit', 'Wykonaj')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
