import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useInventoryActions } from '../../../hooks/useInventoryActions';
import { resolveKnownSpellDisplay } from '../../../services/magicEngine';
import { NarrableText } from '../../ui/NarrableText';
import RollModifierDie, { randomD50, applyRollModifier } from '../../ui/RollModifierDie';
import DiceRoller from '../../../effects/DiceRoller';
import { typeIcons } from './constants';

const PREROLL_HOLD_MS = 1800;
const RESULT_REVEAL_DELAY_MS = 600;
const ENCHANT_DICE_DURATION_MULT = 7.7;
const ENCHANT_DICE_THEME = {
  materialColor: 0x9bd0ff,
  materialSpecular: 0x2a4a8a,
  labelColor: '#dcecff',
  diceColor: '#0a1a45',
  ambientLightColor: 0x70a0ff,
  ambientLightIntensity: 0.58,
  spotLightColor: 0xc8e0ff,
  spotLightIntensity: 0.72,
  deskColor: '#020a20',
};

function OutcomeBadge({ outcome, t }) {
  const isSuccess = outcome === 'success';
  const isCritFail = outcome === 'crit_fail';
  const tone = isSuccess
    ? 'bg-sky-500/10 border-sky-400/30 text-sky-300'
    : isCritFail
      ? 'bg-error/15 border-error/40 text-error'
      : 'bg-amber-500/10 border-amber-400/25 text-amber-300';
  const icon = isSuccess ? 'auto_fix_high' : isCritFail ? 'dangerous' : 'cancel';
  const label = isSuccess
    ? t('inventory.enchantSuccess', 'Udane zaczarowanie')
    : isCritFail
      ? t('inventory.enchantCritFail', 'Katastrofa! Przedmiot zniszczony')
      : t('inventory.enchantFail', 'Nieudane zaczarowanie');
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border ${tone}`}>
      <span className="material-symbols-outlined text-lg">{icon}</span>
      <span className="text-sm font-label">{label}</span>
    </div>
  );
}

function SpellOption({ spell, selected, disabled, onClick, t }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-all ${
        selected
          ? 'bg-sky-500/20 border-sky-400/50 text-on-surface shadow-[0_0_10px_rgba(125,184,255,0.25)]'
          : disabled
            ? 'bg-surface-container-highest/20 border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
            : 'bg-surface-container-highest/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-highest/70 hover:border-sky-400/30 hover:text-on-surface'
      }`}
    >
      <span
        className={`material-symbols-outlined text-base ${selected ? 'text-sky-300' : disabled ? 'text-on-surface-variant/30' : 'text-on-surface-variant/70'}`}
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
      >
        {spell.icon || 'auto_awesome'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-headline text-xs leading-tight truncate">{spell.name}</div>
        <div className="text-[9px] font-label uppercase tracking-wider text-on-surface-variant/60 truncate mt-0.5">
          {spell.school || spell.treeName || ''} · {t('magic.manaCost', { defaultValue: 'Mana' })} {spell.manaCost}
        </div>
      </div>
    </button>
  );
}

export default function EnchantItemModal({
  item,
  character,
  campaignId = null,
  dispatch = null,
  onClose,
  onSubmit = null,
}) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  const knownSpells = useMemo(() => {
    const known = Array.isArray(character?.spells?.known) ? character.spells.known : [];
    return known
      .map((name) => {
        const resolved = resolveKnownSpellDisplay(name, character);
        if (!resolved) return null;
        return {
          name,
          school: resolved.school || resolved.treeId || resolved.treeName || null,
          treeName: resolved.treeName,
          icon: resolved.icon,
          manaCost: resolved.manaCost || 2,
          description: resolved.description || '',
        };
      })
      .filter(Boolean);
  }, [character]);

  const currentMana = character?.mana?.current ?? 0;

  const [spellName, setSpellName] = useState(() => {
    const affordable = knownSpells.find((s) => (s.manaCost || 0) <= currentMana);
    return affordable?.name || knownSpells[0]?.name || '';
  });
  const [intent, setIntent] = useState('');
  const [rollModifier, setRollModifier] = useState(0);

  const [view, setView] = useState('form'); // form | analyzing | preroll | rolling | result
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSpell = knownSpells.find((s) => s.name === spellName) || null;
  const manaCost = selectedSpell?.manaCost || 0;
  const hasEnoughMana = currentMana >= manaCost;
  const canSubmit = Boolean(campaignId && dispatch && selectedSpell && hasEnoughMana && !isSubmitting);

  const icon = typeIcons[item.type] || typeIcons.misc;

  const { enchantItem } = useInventoryActions(character, dispatch);

  const enchantDiceRoll = useMemo(
    () => (result?.successRoll != null ? { roll: result.successRoll } : null),
    [result?.successRoll],
  );

  useEffect(() => {
    if (view !== 'preroll') return undefined;
    const timer = setTimeout(() => setView('rolling'), PREROLL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [view]);

  const handleDiceRollComplete = useCallback(() => {
    setTimeout(() => setView('result'), RESULT_REVEAL_DELAY_MS);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    const successRoll = applyRollModifier(randomD50(), rollModifier);
    const powerRoll = applyRollModifier(randomD50(), rollModifier);

    setError(null);
    setResult(null);
    setView('analyzing');
    setIsSubmitting(true);
    try {
      const data = await enchantItem(campaignId, {
        itemId: item.id,
        spellName,
        intent: intent.trim(),
        successRoll,
        powerRoll,
      });
      setResult(data);
      setView('preroll');
    } catch (err) {
      setError(err?.message || t('inventory.enchantFailedGeneric', 'Zaczarowanie nie powiodło się.'));
      setView('form');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, campaignId, enchantItem, item.id, spellName, intent, rollModifier, t]);

  const handlePlayResultScene = useCallback(() => {
    const name = result?.result?.name;
    if (name && onSubmit) {
      onSubmit(`[UŻYCIE PRZEDMIOTU: ${name}] Próbuję użyć nowo zaczarowanego przedmiotu w akcji.`);
    } else {
      onClose();
    }
  }, [result, onSubmit, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface-container-highest/95 backdrop-blur-2xl border border-sky-400/30 rounded-sm shadow-2xl shadow-sky-400/10"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-sky-300 text-xl shrink-0"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
            >
              auto_fix_high
            </span>
            <div className="min-w-0">
              <h3 className="font-headline text-sky-300 text-sm leading-tight truncate">
                {t('inventory.enchantTitle', 'Zaczaruj przedmiot')}
              </h3>
              <p className="text-[11px] text-on-surface-variant/70 truncate flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">{icon}</span>
                {item.name}
              </p>
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

        <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
          {view === 'form' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70">
                    {t('inventory.enchantPickSpell', 'Wybierz zaklęcie')}
                  </label>
                  <span className="text-[10px] text-on-surface-variant/60">
                    {t('inventory.enchantMana', 'Mana')}: <span className="font-label text-sky-300">{currentMana}</span>
                  </span>
                </div>
                {knownSpells.length === 0 ? (
                  <div className="text-xs text-on-surface-variant/60 italic py-4 text-center border border-outline-variant/10 rounded-sm">
                    {t('inventory.enchantNoSpells', 'Nie znasz żadnych zaklęć.')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                    {knownSpells.map((spell) => (
                      <SpellOption
                        key={spell.name}
                        spell={spell}
                        selected={spellName === spell.name}
                        disabled={spell.manaCost > currentMana}
                        onClick={() => setSpellName(spell.name)}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70 block mb-2">
                  {t('inventory.enchantIntent', 'Jak rzucasz zaklęcie? (opcjonalnie)')}
                </label>
                <textarea
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  rows={3}
                  placeholder={t('inventory.enchantIntentPlaceholder', 'Opisz krótko jak wiążesz zaklęcie z przedmiotem… (możesz zostawić puste)')}
                  className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-sky-400/50 focus:bg-surface-container/80 resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
                <div className="flex items-center gap-2 min-w-0">
                  <RollModifierDie
                    value={rollModifier}
                    onChange={setRollModifier}
                    disabled={isSubmitting}
                  />
                  <span className="text-[10px] text-on-surface-variant/60 truncate">
                    {t('inventory.enchantDiceHint', 'LPM −10 / PPM +10. Crit fail (50) zniszczy przedmiot.')}
                  </span>
                </div>
              </div>

              {selectedSpell && !hasEnoughMana && (
                <div className="text-xs text-error bg-error/10 border border-error/20 rounded-sm px-3 py-2">
                  {t('inventory.enchantNoMana', { required: manaCost, available: currentMana, defaultValue: 'Brakuje many ({{required}} potrzebne, {{available}} dostępne).' })}
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
              <span className="material-symbols-outlined animate-spin text-2xl text-sky-300">progress_activity</span>
              <p className="text-sm">{t('inventory.enchantAnalyzing', 'Wiązanie zaklęcia z przedmiotem...')}</p>
            </div>
          )}

          {(view === 'preroll' || view === 'rolling') && result && (
            <div className="py-6 space-y-4 animate-fade-in">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70 text-center">
                {t('inventory.enchantCheckTitle', 'Test zaczarowania')}
              </p>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('inventory.enchantThresholdLabel', 'Próg')}</span>
                  <span className="font-mono text-2xl font-black text-on-surface/80">{result.threshold}</span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{t('inventory.enchantModifiers', 'Modyfikatory')}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {result.intelligence != null && (
                      <span className="text-purple-300/80 font-label">{t('attributes.inteligencja', 'Int')} +{result.intelligence}</span>
                    )}
                    {result.skill != null && result.skill > 0 && (
                      <span className="text-amber-300/80 font-label">Alch. +{result.skill}</span>
                    )}
                    {result.luck != null && (
                      <span className="text-emerald-300/80 font-label">{t('attributes.szczescie', 'Szcz')} +{result.luck}</span>
                    )}
                  </div>
                </div>
              </div>
              {view === 'preroll' && (
                <p className="text-[10px] text-on-surface-variant/50 text-center animate-pulse">
                  {t('inventory.enchantRolling', 'Rzucam kośćmi...')}
                </p>
              )}
              {view === 'rolling' && (
                <div className="relative w-[280px] h-[200px] mx-auto">
                  <DiceRoller
                    diceRoll={enchantDiceRoll}
                    onComplete={handleDiceRollComplete}
                    showOverlayResult={false}
                    sizeMultiplier={2.2}
                    durationMultiplier={ENCHANT_DICE_DURATION_MULT}
                    variant="overlay"
                    overlayTheme={ENCHANT_DICE_THEME}
                    isVisible
                    skipOnClick
                    skipOnClickTitle={t('inventory.enchantSkipDice', 'Kliknij, aby zakończyć animację')}
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
                  {t('inventory.enchantSumLabel', 'Suma')}: <span className={`font-mono font-label ${result.outcome === 'success' ? 'text-sky-300' : 'text-rose-400'}`}>{result.sum}</span>
                  <span className="text-on-surface-variant/60 mx-1">vs</span>
                  {result.threshold}
                </div>
                {result.manaPaid != null && (
                  <div className="border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface/80">
                    {t('inventory.enchantManaPaid', 'Mana')}: <span className="font-mono font-label text-sky-300">−{result.manaPaid}</span>
                  </div>
                )}
              </div>

              {result.luckySuccess && (
                <p className="text-xs text-emerald-300/95 bg-emerald-500/10 border border-emerald-400/20 rounded-sm px-3 py-2 leading-snug">
                  {t('inventory.enchantLuckRescue', { luckRoll: result.luckRoll, luck: result.luck, defaultValue: 'Czyste szczęście! ({{luckRoll}} ≤ {{luck}}).' })}
                </p>
              )}

              <p className="text-sm text-on-surface/90 leading-relaxed">{result.verdict}</p>

              {result.outcome === 'success' && result.result && (
                <div className="border border-sky-400/30 rounded-sm bg-sky-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sky-300 text-lg">
                      {result.result.icon || 'auto_fix_high'}
                    </span>
                    <h3 className="font-headline text-sm text-on-surface flex-1">{result.result.name}</h3>
                    <span className="text-[10px] font-label uppercase tracking-widest text-sky-300/80">
                      {result.result.rarity}
                    </span>
                  </div>
                  {result.result.description && (
                    <NarrableText text={result.result.description} className="text-xs text-on-surface/80 leading-relaxed" />
                  )}
                  {result.result.enchantEffect && (
                    <div className="text-[11px] font-label text-sky-200/90 bg-sky-500/10 border border-sky-400/15 rounded-sm px-2 py-1.5 leading-snug">
                      <span className="material-symbols-outlined text-xs align-text-bottom mr-1">bolt</span>
                      {result.result.enchantEffect}
                    </div>
                  )}
                  {result.result.longDescription && (
                    <div className="mt-2 pt-2 border-t border-sky-400/15">
                      <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/50 mb-1">
                        {t('inventory.enchantLoreLabel', 'Historia')}
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
                    {t('inventory.enchantPlayScene', 'Spróbuj nowego przedmiotu')}
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
              disabled={!canSubmit}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-sm border transition-all ${
                canSubmit
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/40 hover:bg-sky-500/30 shadow-[0_0_10px_rgba(125,184,255,0.2)]'
                  : 'bg-surface-container/30 text-on-surface-variant/40 border-outline-variant/10 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-sm">auto_fix_high</span>
              {t('inventory.enchantSubmit', 'Zaczaruj')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
