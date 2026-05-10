import { useTranslation } from 'react-i18next';

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

export default function PreRollPreview({ preview, onConfirm, onCancel }) {
  const { t } = useTranslation();
  if (!preview) return null;

  const { actor, target, threshold, bonuses, minRoll, sureHit, weaponName, type } = preview;

  const typeLabel = {
    offensive: t('combat.preRoll.typeOffensive', 'Atak'),
    magic: t('combat.preRoll.typeMagic', 'Magia'),
    flee: t('combat.preRoll.typeFlee', 'Ucieczka'),
    shove: t('combat.preRoll.typeShove', 'Pchnięcie'),
  }[type] || type;

  return (
    <div className="rounded-lg border border-outline-variant/30 bg-black/70 backdrop-blur-md p-3 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">
          {typeLabel}
          {target && <span className="text-white/50 font-normal"> → {target.name}</span>}
        </div>
        {weaponName && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
            {weaponName}
          </span>
        )}
      </div>

      {/* Two-column breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left: your bonuses */}
        <div className="space-y-1">
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
        <div className="space-y-1">
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
      <div className="text-center py-2 rounded bg-white/5 border border-white/10">
        {sureHit ? (
          <div className="text-lg font-bold text-amber-300">
            {t('combat.preRoll.sureHit', 'Automatyczne trafienie!')}
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">
              {t('combat.preRoll.minRollLabel', 'Minimalna wartość na k50')}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${minRoll <= 10 ? 'text-emerald-300' : minRoll <= 25 ? 'text-amber-300' : 'text-rose-300'}`}>
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
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs py-1.5 rounded border border-white/15 text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
        >
          {t('common.cancel', 'Anuluj')}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 text-xs py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500/90 text-white font-semibold transition-colors"
        >
          {t('combat.preRoll.rollButton', 'Rzuć kośćmi!')}
        </button>
      </div>
    </div>
  );
}
