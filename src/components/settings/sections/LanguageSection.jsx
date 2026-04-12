import { useTranslation } from 'react-i18next';

export default function LanguageSection({ language, onChange }) {
  const { t } = useTranslation();

  const buttonClass = (value) =>
    `flex items-center gap-2 px-5 py-3 rounded-sm border transition-all ${
      language === value
        ? 'bg-surface-tint/10 border-primary/30 text-primary'
        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
    }`;

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">translate</span>
        {t('settings.language')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-4">{t('settings.languageDesc')}</p>
      <div className="flex gap-3">
        <button onClick={() => onChange('pl')} className={buttonClass('pl')}>
          <span className="text-lg">🇵🇱</span>
          <span className="font-headline text-sm">Polski</span>
        </button>
        <button onClick={() => onChange('en')} className={buttonClass('en')}>
          <span className="text-lg">🇬🇧</span>
          <span className="font-headline text-sm">English</span>
        </button>
      </div>
    </div>
  );
}
