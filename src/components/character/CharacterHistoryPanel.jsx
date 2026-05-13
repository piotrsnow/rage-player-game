import { useState, useMemo, useCallback } from 'react';
import { buildHistorySummary, buildTimeline, buildReputationDigest } from '../../services/characterHistory';
import { apiClient } from '../../services/apiClient';

const TAB_SUMMARY = 'summary';
const TAB_TIMELINE = 'timeline';
const TAB_REPUTATION = 'reputation';

export default function CharacterHistoryPanel({ scenes, character, campaign, t }) {
  const [tab, setTab] = useState(TAB_SUMMARY);
  const [reputationText, setReputationText] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState(null);

  const summary = useMemo(() => buildHistorySummary(scenes), [scenes]);
  const timeline = useMemo(() => buildTimeline(scenes), [scenes]);

  const generateReputation = useCallback(async () => {
    setReputationLoading(true);
    setReputationError(null);
    try {
      const digest = buildReputationDigest(character, scenes, campaign);
      const result = await apiClient.post('/ai/generate-reputation', {
        ...digest,
        language: 'pl',
      });
      const text = result?.reputation;
      if (text) {
        setReputationText(text);
      } else {
        setReputationError(t('character.reputationEmpty'));
      }
    } catch (err) {
      setReputationError(err?.message || t('character.reputationEmpty'));
    } finally {
      setReputationLoading(false);
    }
  }, [character, scenes, campaign, t]);

  if (!scenes || scenes.length === 0) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
        <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">history</span>
          {t('character.history')}
        </h3>
        <p className="text-outline italic text-sm">{t('character.historyEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-tertiary font-headline flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">history</span>
          {t('character.history')}
        </h3>
        <div className="flex gap-1">
          {[TAB_SUMMARY, TAB_TIMELINE, TAB_REPUTATION].map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1 text-[10px] font-label uppercase tracking-widest rounded-sm border transition-all ${
                tab === id
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'text-on-surface-variant border-outline-variant/15 hover:text-primary hover:border-primary/20'
              }`}
            >
              {id === TAB_SUMMARY
                ? t('character.historySummary')
                : id === TAB_TIMELINE
                  ? t('character.historyTimeline')
                  : t('character.historyReputation')}
            </button>
          ))}
        </div>
      </div>

      {tab === TAB_SUMMARY && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label={t('character.historyScenes')} value={summary.totalScenes} icon="auto_stories" />
            <Metric label={t('character.historyDiceRolls')} value={summary.diceRolls} icon="casino" />
            <Metric label={t('character.historySuccesses')} value={summary.successes} icon="check_circle" color="text-green-400" />
            <Metric label={t('character.historyFailures')} value={summary.failures} icon="cancel" color="text-error" />
          </div>

          {summary.lastAction && (
            <div className="mt-3">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant block mb-1">
                {t('character.historyLastAction')}
              </span>
              <p className="text-sm text-on-surface-variant leading-relaxed bg-surface-container-high/40 px-3 py-2 rounded-sm border border-outline-variant/10">
                {summary.lastAction}
              </p>
            </div>
          )}

          {summary.lastNarrative && (
            <p className="text-xs text-outline leading-relaxed italic mt-1">
              {summary.lastNarrative}
            </p>
          )}
        </div>
      )}

      {tab === TAB_TIMELINE && (
        <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2 animate-fade-in pr-1">
          {timeline.map((entry) => (
            <div
              key={entry.index}
              className="relative pl-5 border-l-2 border-outline-variant/15 py-1.5 group"
            >
              <span className="absolute left-[-5px] top-2.5 w-2 h-2 rounded-full bg-primary/60 group-hover:bg-primary transition-colors" />

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-primary-dim font-bold">
                  {t('character.historyScene', { index: entry.index })}
                </span>
                {entry.timestamp && (
                  <span className="text-[9px] text-outline">
                    {new Date(entry.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {entry.diceRoll && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${
                    entry.diceRoll.success
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-error/10 text-error border-error/20'
                  }`}>
                    {entry.diceRoll.skill} {entry.diceRoll.roll}/{entry.diceRoll.target} SL{entry.diceRoll.sl}
                  </span>
                )}
              </div>

              {entry.action && (
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  {entry.action}
                </p>
              )}

              {entry.narrativeSnippet && (
                <p className="text-[11px] text-outline mt-0.5 italic leading-relaxed">
                  {entry.narrativeSnippet}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === TAB_REPUTATION && (
        <ReputationTab
          reputationText={reputationText}
          reputationLoading={reputationLoading}
          reputationError={reputationError}
          onGenerate={generateReputation}
          t={t}
        />
      )}
    </div>
  );
}

function ReputationTab({ reputationText, reputationLoading, reputationError, onGenerate, t }) {
  if (reputationLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 animate-fade-in gap-3">
        <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
        <p className="text-xs text-on-surface-variant">{t('character.reputationLoading')}</p>
      </div>
    );
  }

  if (reputationText) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="prose prose-sm prose-invert max-w-none">
          {reputationText.split(/\n\n+/).map((paragraph, i) => (
            <p key={i} className="text-sm text-on-surface-variant leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        <button
          onClick={onGenerate}
          className="text-[10px] text-on-surface-variant/60 hover:text-primary underline underline-offset-2 transition-colors"
        >
          {t('character.reputationRegenerate')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 animate-fade-in gap-4">
      <span className="material-symbols-outlined text-3xl text-primary/40">forum</span>
      <p className="text-xs text-on-surface-variant/70 text-center max-w-xs">
        {t('character.reputationHint')}
      </p>
      {reputationError && (
        <p className="text-xs text-error text-center">{reputationError}</p>
      )}
      <button
        onClick={onGenerate}
        className="px-4 py-2 text-xs font-label uppercase tracking-widest rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
      >
        {t('character.reputationGenerate')}
      </button>
    </div>
  );
}

function Metric({ label, value, icon, color = 'text-primary' }) {
  return (
    <div className="text-center p-2 bg-surface-container-high/30 rounded-sm border border-outline-variant/10">
      <span className={`material-symbols-outlined text-base ${color} mb-0.5 block`}>{icon}</span>
      <p className="text-tertiary font-headline text-lg">{value}</p>
      <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">{label}</span>
    </div>
  );
}
