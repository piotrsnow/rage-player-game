import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FACTION_DEFINITIONS, getReputationTierData } from '../../../data/wfrpFactions';

export default function GMOverviewTab({ gameState }) {
  const { t } = useTranslation();
  const campaign = gameState?.campaign;
  const character = gameState?.character;
  const world = gameState?.world || {};
  const quests = gameState?.quests || { active: [], completed: [] };
  const scenes = gameState?.scenes || [];
  const party = gameState?.party || [];
  const achievements = gameState?.achievements || {};
  const aiCosts = gameState?.aiCosts || { total: 0, breakdown: {} };
  const combat = gameState?.combat;

  const timeState = world.timeState || {};
  const weather = world.weather;
  const npcs = world.npcs || [];
  const factions = world.factions || {};
  const exploredLocations = world.exploredLocations || [];
  const mapState = world.mapState || [];

  const stats = useMemo(() => ({
    scenes: scenes.length,
    npcsAlive: npcs.filter((n) => n.alive !== false).length,
    npcsDead: npcs.filter((n) => n.alive === false).length,
    npcsTotal: npcs.length,
    locations: mapState.length,
    explored: exploredLocations.length,
    activeQuests: (quests.active || []).length,
    completedQuests: (quests.completed || []).length,
    factionCount: Object.keys(factions).length,
    partySize: party.length,
    achievementsUnlocked: (achievements.unlocked || []).length,
  }), [scenes, npcs, mapState, exploredLocations, quests, factions, party, achievements]);

  const timeIcons = { morning: 'wb_sunny', afternoon: 'light_mode', evening: 'wb_twilight', night: 'dark_mode' };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
      {/* Campaign info */}
      {campaign && (
        <div className="p-4 rounded-sm bg-surface-container/40 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary">auto_stories</span>
            <h3 className="text-sm font-bold text-on-surface">{campaign.name}</h3>
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
              campaign.status === 'active' ? 'bg-primary/15 text-primary' : 'bg-outline/10 text-outline'
            }`}>{campaign.status || 'active'}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-on-surface-variant">
            {campaign.genre && <Field label={t('gmModal.overview.genre')} value={campaign.genre} />}
            {campaign.tone && <Field label={t('gmModal.overview.tone')} value={campaign.tone} />}
            {campaign.style && <Field label={t('gmModal.overview.style')} value={campaign.style} />}
            {campaign.difficulty && <Field label={t('gmModal.overview.difficulty')} value={campaign.difficulty} />}
            {campaign.length && <Field label={t('gmModal.overview.length')} value={campaign.length} />}
          </div>
          {campaign.worldDescription && (
            <p className="text-[10px] text-outline mt-2 pt-2 border-t border-outline-variant/10 leading-relaxed">
              {campaign.worldDescription}
            </p>
          )}
          {campaign.structure?.acts && (
            <div className="mt-3 pt-2 border-t border-outline-variant/10">
              <div className="text-[10px] text-outline mb-2">
                {t('gmModal.overview.act')} {campaign.structure.currentAct || 1} / {campaign.structure.acts.length}
              </div>
              <div className="flex gap-1">
                {campaign.structure.acts.map((act) => (
                  <div
                    key={act.number}
                    className={`flex-1 h-1.5 rounded-full ${
                      act.number < (campaign.structure.currentAct || 1)
                        ? 'bg-primary'
                        : act.number === (campaign.structure.currentAct || 1)
                        ? 'bg-primary/50'
                        : 'bg-surface-container'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="movie" label={t('gmModal.overview.scenes')} value={stats.scenes} />
        <StatCard icon="group" label={t('gmModal.overview.npcs')} value={`${stats.npcsAlive} / ${stats.npcsTotal}`} sub={stats.npcsDead > 0 ? `${stats.npcsDead} ${t('gmModal.detail.dead').toLowerCase()}` : null} />
        <StatCard icon="place" label={t('gmModal.overview.locations')} value={stats.locations} sub={`${stats.explored} ${t('gmModal.overview.explored')}`} />
        <StatCard icon="assignment" label={t('gmModal.overview.quests')} value={stats.activeQuests} sub={`${stats.completedQuests} ${t('gmModal.overview.completed')}`} />
        <StatCard icon="shield" label={t('gmModal.overview.factions')} value={stats.factionCount} />
        <StatCard icon="group_add" label={t('gmModal.overview.party')} value={stats.partySize} />
        <StatCard icon="emoji_events" label={t('gmModal.overview.achievements')} value={stats.achievementsUnlocked} />
        {combat?.active && (
          <StatCard icon="swords" label={t('gmModal.overview.combat')} value={`R${combat.round || 1}`} sub={t('gmModal.overview.inCombat')} highlight />
        )}
      </div>

      {/* Time & Weather */}
      <div className="grid gap-3 sm:grid-cols-2">
        {timeState.day && (
          <div className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-sm text-primary">{timeIcons[timeState.timeOfDay] || 'schedule'}</span>
              <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.overview.time')}</span>
            </div>
            <div className="text-[11px] text-on-surface-variant space-y-1">
              <div>{t('gmModal.overview.day')} {timeState.day} &mdash; <span className="capitalize">{t(`worldState.periods.${timeState.timeOfDay}`, timeState.timeOfDay)}</span></div>
              {timeState.hour != null && (
                <div className="text-lg font-headline text-primary tabular-nums">
                  {Math.floor(timeState.hour).toString().padStart(2, '0')}:{Math.round((timeState.hour % 1) * 60).toString().padStart(2, '0')}
                </div>
              )}
              {timeState.season && <div className="text-[10px] text-outline capitalize">{t(`worldState.seasons.${timeState.season}`, timeState.season)}</div>}
            </div>
          </div>
        )}
        {weather && (
          <div className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-sm text-primary">cloud</span>
              <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.overview.weather')}</span>
            </div>
            <div className="text-[11px] text-on-surface-variant">
              {typeof weather === 'string' ? weather : weather.description || weather.type || JSON.stringify(weather)}
            </div>
          </div>
        )}
      </div>

      {/* Character quick stats */}
      {character && (
        <div className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-primary">person</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.overview.character')}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px] text-on-surface-variant">
            <Field label={t('gmModal.detail.species')} value={character.species} />
            <Field label={t('gmModal.detail.career')} value={`${character.career?.name || '?'} (T${character.career?.tier || 1})`} />
            <Field label={t('gmModal.detail.wounds')} value={`${character.wounds} / ${character.maxWounds}`} />
            <Field label="XP" value={`${character.xp || 0} (${t('gmModal.overview.spent')}: ${character.xpSpent || 0})`} />
            <Field label={t('gmModal.overview.fate')} value={`${character.fortune ?? '?'} / ${character.fate ?? '?'}`} />
            <Field label={t('gmModal.overview.resilience')} value={`${character.resolve ?? '?'} / ${character.resilience ?? '?'}`} />
          </div>
        </div>
      )}

      {/* Faction overview */}
      {Object.keys(factions).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-sm text-primary">shield</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.overview.factionStandings')}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(factions).map(([id, rep]) => {
              const def = FACTION_DEFINITIONS[id];
              const tierData = getReputationTierData(rep);
              const colorClass = tierData.color === 'error' ? 'text-error'
                : tierData.color === 'primary' ? 'text-primary'
                : tierData.color === 'tertiary' ? 'text-tertiary'
                : 'text-outline';
              return (
                <div key={id} className="flex items-center justify-between p-2 rounded-sm bg-surface-container/30 border border-outline-variant/5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`material-symbols-outlined text-xs ${colorClass}`}>{def?.icon || 'shield'}</span>
                    <span className="text-[10px] text-on-surface truncate">{def?.name || id}</span>
                  </div>
                  <span className={`text-[10px] font-bold tabular-nums shrink-0 ${colorClass}`}>
                    {rep > 0 ? '+' : ''}{rep}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Costs */}
      {aiCosts.total > 0 && (
        <div className="p-3 rounded-sm bg-surface-container/40 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-sm text-outline">payments</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('gmModal.overview.aiCosts')}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="font-bold text-on-surface">${aiCosts.total.toFixed(4)}</span>
            {Object.entries(aiCosts.breakdown || {}).map(([key, val]) =>
              val > 0 ? (
                <span key={key} className="text-outline">
                  {key}: ${val.toFixed(4)}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, highlight }) {
  return (
    <div className={`p-3 rounded-sm border ${highlight ? 'bg-error/10 border-error/20' : 'bg-surface-container/40 border-outline-variant/10'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-sm ${highlight ? 'text-error' : 'text-primary'}`}>{icon}</span>
        <span className="text-[10px] font-label uppercase tracking-widest text-outline">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? 'text-error' : 'text-on-surface'}`}>{value}</div>
      {sub && <div className="text-[10px] text-outline">{sub}</div>}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="text-outline">{label}:</span>{' '}
      <span className="text-on-surface-variant">{value}</span>
    </div>
  );
}
