import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';

const ATTRIBUTE_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];
const ATTRIBUTE_CAP = 25;

const ATTRIBUTE_ICONS = {
  sila: 'fitness_center',
  inteligencja: 'psychology',
  charyzma: 'diversity_3',
  zrecznosc: 'speed',
  wytrzymalosc: 'favorite',
  szczescie: 'casino',
};

function ChoiceButton({ icon, label, currentValue, nextValue, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-3 p-3 rounded-sm border transition-all text-left
        ${disabled
          ? 'bg-surface-container-highest/30 border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
          : 'bg-surface-container-highest/60 border-tertiary/20 text-on-surface hover:bg-tertiary/15 hover:border-tertiary/40 hover:shadow-[0_0_10px_rgba(197,154,255,0.25)]'
        }
      `}
    >
      <span
        className={`material-symbols-outlined text-xl ${disabled ? 'text-on-surface-variant/30' : 'text-tertiary-dim'}`}
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-headline text-sm leading-tight truncate">{label}</div>
        <div className="text-[10px] font-label text-on-surface-variant/60 mt-0.5">
          {currentValue} → <span className={disabled ? '' : 'text-tertiary'}>{nextValue}</span>
        </div>
      </div>
    </button>
  );
}

export default function CrystalUseModal({ character, onChoose, onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);

  const attributes = character?.attributes || {};
  const mana = character?.mana || { current: 0, max: 0 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-md bg-surface-container-highest/95 backdrop-blur-2xl border border-tertiary/30 rounded-sm shadow-2xl shadow-tertiary/10"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-tertiary"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
            >
              auto_awesome
            </span>
            <h3 className="font-headline text-tertiary">
              {t('inventory.crystalModalTitle', 'Kryształ Many')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-surface-container/50 text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-on-surface-variant/70 italic leading-snug">
            {t('inventory.crystalModalDesc', 'Wybierz jak skonsumować kryształ. Efekt jest trwały.')}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton
              icon="water_drop"
              label={t('rpg.mana', 'Mana')}
              currentValue={mana.max}
              nextValue={mana.max + 1}
              disabled={false}
              onClick={() => onChoose('mana')}
            />
            {ATTRIBUTE_KEYS.map((key) => {
              const current = attributes[key] ?? 0;
              const disabled = current >= ATTRIBUTE_CAP;
              return (
                <ChoiceButton
                  key={key}
                  icon={ATTRIBUTE_ICONS[key]}
                  label={t(`rpgAttributes.${key}`, key)}
                  currentValue={current}
                  nextValue={current + 1}
                  disabled={disabled}
                  onClick={() => onChoose(key)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
