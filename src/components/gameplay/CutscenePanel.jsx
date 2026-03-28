import { useTranslation } from 'react-i18next';

export default function CutscenePanel({ cutscene }) {
  const { t } = useTranslation();
  if (!cutscene) return null;

  return (
    <div className="mx-2 animate-fade-in">
      <div className="relative overflow-hidden rounded-sm border border-amber-500/30 bg-gradient-to-b from-amber-950/40 to-surface-container-low/60 backdrop-blur-md p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/5 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400 text-sm">movie</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-amber-400">
              {t('gameplay.cutscene', 'Meanwhile...')}
            </span>
          </div>
          {cutscene.title && (
            <h3 className="text-sm font-title text-amber-200 mb-2 italic">
              {cutscene.title}
            </h3>
          )}
          <p className="text-sm text-on-surface/80 leading-relaxed whitespace-pre-line italic">
            {cutscene.narrative}
          </p>
          {cutscene.location && (
            <div className="mt-3 text-[10px] text-on-surface-variant/60 uppercase tracking-widest">
              {cutscene.location}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
