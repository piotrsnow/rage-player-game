import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ActionPanel({ actions = [], onAction, disabled }) {
  const [customAction, setCustomAction] = useState('');
  const { t } = useTranslation();

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (customAction.trim() && !disabled) {
      onAction(customAction.trim());
      setCustomAction('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Suggested Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            disabled={disabled}
            className="text-left p-4 bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all duration-300 group disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="flex items-start gap-3">
              <span className="text-primary-dim font-headline text-lg leading-none mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors leading-relaxed">
                {action}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Custom Action Input */}
      <form onSubmit={handleCustomSubmit} className="relative">
        <textarea
          value={customAction}
          onChange={(e) => setCustomAction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleCustomSubmit(e);
            }
          }}
          placeholder={t('gameplay.customActionPlaceholder')}
          rows={2}
          disabled={disabled}
          className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar disabled:opacity-50"
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!customAction.trim() || disabled}
            className="text-primary hover:text-on-surface transition-all flex items-center gap-1 group disabled:opacity-30"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
              {t('gameplay.send')}
            </span>
            <span className="material-symbols-outlined text-xl">send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
