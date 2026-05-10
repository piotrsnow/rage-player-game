import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const AUTO_CLOSE_RESULT_MS = 5000;

const ATTR_I18N = {
  sila: 'rpgAttributes.sila',
  inteligencja: 'rpgAttributes.inteligencja',
  zrecznosc: 'rpgAttributes.zrecznosc',
  wytrzymalosc: 'rpgAttributes.wytrzymalosc',
  szczescie: 'rpgAttributes.szczescie',
};

function ModifierRow({ label, value, color }) {
  const sign = value > 0 ? '+' : '';
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/60">{label}</span>
      <span className={color || 'text-white/80'}>{sign}{value}</span>
    </div>
  );
}

function ThresholdRow({ label, value }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/60">{label}</span>
      <span className="text-rose-300">+{value}</span>
    </div>
  );
}

function getOutcomeLabel(result, t) {
  if (!result) return '';
  if (result.outcome === 'hit' || result.outcome === 'fled' || result.outcome === 'shoved') {
    return t('common.success', 'Sukces');
  }
  if (result.outcome === 'miss' || result.outcome === 'failed_flee' || result.outcome === 'shove_failed') {
    return t('common.failure', 'Porażka');
  }
  return result.outcome || '';
}

function getOutcomeColor(result) {
  if (!result) return 'text-white/70 border-white/15 bg-white/5';
  if (result.outcome === 'hit' || result.outcome === 'fled' || result.outcome === 'shoved') {
    return 'text-emerald-200 border-emerald-400/25 bg-emerald-500/10';
  }
  if (result.outcome === 'miss' || result.outcome === 'failed_flee' || result.outcome === 'shove_failed') {
    return 'text-rose-200 border-rose-400/25 bg-rose-500/10';
  }
  return 'text-amber-200 border-amber-400/25 bg-amber-500/10';
}

export default function PreRollPreview({ preview, result, resolving = false, onConfirm, onCancel }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!preview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [preview, onCancel]);

  useEffect(() => {
    if (!result) return undefined;
    const timer = window.setTimeout(() => onCancel?.(), AUTO_CLOSE_RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [result, onCancel]);

  if (!preview) return null;

  const { actor, target, threshold, bonuses, minRoll, sureHit, weaponName, type } = preview;
  const roll = result?.rolls?.[0] || null;
  const outcomeLabel = getOutcomeLabel(result, t);
  const outcomeClass = getOutcomeColor(result);

  const typeLabel = {
    offensive: t('combat.preRoll.typeOffensive', 'Atak'),
    magic: t('combat.preRoll.typeMagic', 'Magia'),
    flee: t('combat.preRoll.typeFlee', 'Ucieczka'),
    shove: t('combat.preRoll.typeShove', 'Pchnięcie'),
  }[type] || type;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={typeLabel}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-outline-variant/30 bg-black/85 backdrop-blur-md p-4 space-y-4 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-white/90">
              {typeLabel}
              {target && <span className="text-white/50 font-normal"> → {target.name}</span>}
            </div>
            {weaponName && (
              <span className="mt-1 inline-flex text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                {weaponName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/80 transition-colors"
            aria-label={t('common.close', 'Zamknij')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Two-column breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Left: your bonuses */}
          <div className="space-y-1 rounded border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold mb-1">
              {t('combat.preRoll.yourBonuses', 'Twoje bonusy')}
            </div>
            {bonuses.modifiers.map((m, i) => (
              <ModifierRow
                key={i}
                label={ATTR_I18N[m.label] ? t(ATTR_I18N[m.label]) : t(`combat.preRoll.mod_${m.label}`, m.label)}
                value={m.value}
                color={m.color}
              />
            ))}
            <div className="border-t border-white/10 pt-1 flex justify-between text-xs font-semibold">
              <span className="text-white/70">{t('combat.preRoll.totalBonus', 'Razem')}</span>
              <span className="text-emerald-300">+{bonuses.total}</span>
            </div>
          </div>

          {/* Right: threshold */}
          <div className="space-y-1 rounded border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wider text-rose-400/80 font-semibold mb-1">
              {t('combat.preRoll.threshold', 'Próg trudności')}
            </div>
            <ModifierRow
              label={t('combat.preRoll.baseThreshold', 'Bazowy')}
              value={threshold.base}
              color="text-white/80"
            />
            {threshold.modifiers.map((m, i) => (
              <ThresholdRow key={i} label={m.label} value={m.value} />
            ))}
            <div className="border-t border-white/10 pt-1 flex justify-between text-xs font-semibold">
              <span className="text-white/70">{t('combat.preRoll.finalThreshold', 'Wymagany')}</span>
              <span className="text-rose-300">{threshold.final}</span>
            </div>
          </div>
        </div>

        {/* Min roll highlight */}
        <div className="text-center py-3 rounded bg-white/5 border border-white/10">
          {sureHit ? (
            <div className="text-lg font-bold text-amber-300">
              {t('combat.preRoll.sureHit', 'Automatyczne trafienie!')}
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">
                {t('combat.preRoll.minRollLabel', 'Minimalna wartość na k50')}
              </div>
              <div className={`text-3xl font-bold tabular-nums ${minRoll <= 10 ? 'text-emerald-300' : minRoll <= 25 ? 'text-amber-300' : 'text-rose-300'}`}>
                {minRoll}
              </div>
            </>
          )}
          {actor.luckChance > 0 && (
            <div className="text-[10px] text-yellow-400/70 mt-0.5">
              {t('combat.preRoll.luckChance', 'Szczęście: {{pct}}% auto-sukces', { pct: actor.luckChance })}
            </div>
          )}
        </div>

        {/* Actions */}
        {result && (
          <div className={`rounded border px-3 py-3 ${outcomeClass}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
                {t('combat.preRoll.resultTitle', 'Wynik rzutu')}
              </span>
              {outcomeLabel && (
                <span className="text-xs font-bold uppercase tracking-wider">
                  {outcomeLabel}
                </span>
              )}
            </div>

            {roll ? (
              <div className="mt-2 grid grid-cols-4 gap-2 text-center font-mono">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/45">{t('gameplay.rollLabel', 'Rzut')}</div>
                  <div className="text-2xl font-black text-white">{roll.roll}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/45">{t('gameplay.diceRollSum', 'Suma')}</div>
                  <div className="text-2xl font-black text-white">{roll.total}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/45">{t('common.target', 'Cel')}</div>
                  <div className="text-2xl font-black text-white">{roll.threshold}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/45">{t('gameplay.margin', 'Margines')}</div>
                  <div className={`text-2xl font-black ${roll.margin >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                    {roll.margin > 0 ? '+' : ''}{roll.margin}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-white/75">
                {result.outcome || t('combat.preRoll.resolved', 'Rozstrzygnięto akcję.')}
              </div>
            )}

            <div className="mt-2 text-[10px] text-white/45 text-center">
              {t('combat.preRoll.autoCloseHint', 'Modal zamknie się automatycznie za 5 sekund.')}
            </div>
          </div>
        )}

        {resolving && !result && (
          <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs text-white/60">
            {t('combat.preRoll.resolving', 'Rozstrzyganie rzutu...')}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-xs py-2 rounded border border-white/15 text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
          >
            {result ? t('common.close', 'Zamknij') : t('common.cancel', 'Anuluj')}
          </button>
          {!result && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={resolving}
              className="flex-1 text-xs py-2 rounded bg-emerald-600/80 hover:bg-emerald-500/90 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving
                ? t('combat.preRoll.resolvingShort', 'Rzut...')
                : t('combat.preRoll.rollButton', 'Rzuć kośćmi!')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
