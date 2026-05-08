import { useTranslation } from 'react-i18next';

export function TruceConfirmDialog({ onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <div className="p-2 bg-tertiary/5 border border-tertiary/30 rounded-sm space-y-1.5">
      <p className="text-[10px] text-on-surface">
        {t('combat.forceTruceConfirm', 'You have the upper hand. Force a truce? Remaining enemies will back down.')}
      </p>
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-surface-container/50 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container transition-colors"
        >
          {t('combat.cancel', 'Cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-tertiary/15 text-tertiary border border-tertiary/30 rounded-sm hover:bg-tertiary/25 transition-colors"
        >
          {t('combat.forceTruce', 'Force Truce')}
        </button>
      </div>
    </div>
  );
}

export function SurrenderConfirmDialog({ onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <div className="p-2 bg-error-container/10 border border-error/30 rounded-sm space-y-1.5">
      <p className="text-[10px] text-on-surface">
        {t('combat.surrenderConfirm', 'Are you sure? You will be at the mercy of your enemies.')}
      </p>
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={onCancel}
          className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-surface-container/50 text-on-surface-variant border border-outline-variant/20 rounded-sm hover:bg-surface-container transition-colors"
        >
          {t('combat.cancel', 'Cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/30 rounded-sm hover:bg-error/25 transition-colors"
        >
          {t('combat.surrender', 'Surrender')}
        </button>
      </div>
    </div>
  );
}
