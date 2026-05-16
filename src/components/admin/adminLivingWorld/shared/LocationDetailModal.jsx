import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import ModalShell from './ModalShell';
import EventList from './EventList';
import { KV, Section, Empty } from './primitives';

export default function LocationDetailModal({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get(`/v1/admin/livingWorld/locations/${id}`).then(setData);
  }, [id]);

  if (!data) return <ModalShell onClose={onClose}><div>Loading…</div></ModalShell>;

  const {
    location, npcs = [], homeNpcs = [], events = [], aliases = [],
    knowledge = [], sublocations = [], roads = [],
    discoveryCount = 0, relatedQuests = [], locationSummaries = [],
    parentLocation,
  } = data;

  return (
    <ModalShell onClose={onClose} title={location.displayName || location.canonicalName}>
      <div className="text-[11px] text-on-surface">
        {/* ── Core fields ── */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="canonicalName" v={location.canonicalName} />
          <KV k="locationType" v={location.locationType || 'generic'} />
          <KV k="region" v={location.region || '—'} />
          <KV k="category" v={location.category || '—'} />
          <KV k="dangerLevel" v={location.dangerLevel || 'safe'} />
          <KV k="biome" v={location.biome || '—'} />
          <KV k="scale" v={location.scale ?? 5} />
          <KV k="knownByDefault" v={location.knownByDefault ? '✓' : '✗'} />
          <KV k="regionX" v={location.regionX ?? 0} />
          <KV k="regionY" v={location.regionY ?? 0} />
          <KV k="positionConfidence" v={location.positionConfidence ?? 0.5} />
          <KV k="visitCount" v={location.visitCount ?? 0} />
          <KV k="discoveredBy" v={`${discoveryCount} campaign(s)`} />
          <KV k="globallyActive" v={location.globallyActive ? '✓' : '✗'} />
          <KV k="softDeletedAt" v={location.softDeletedAt ? new Date(location.softDeletedAt).toISOString().slice(0, 16) : '—'} />
          <KV k="aliases" v={(aliases || []).join(', ') || '—'} />
        </div>

        {parentLocation && (
          <div className="mb-2 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Parent location</div>
            <span className="font-bold">{parentLocation.canonicalName}</span>
            <span className="text-on-surface-variant ml-2 text-[10px]">{parentLocation.id}</span>
          </div>
        )}

        {location.description && <p className="mb-3 text-on-surface-variant">{location.description}</p>}

        {location.atmosphere && (
          <div className="mb-2 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Atmosphere</div>
            <div>{location.atmosphere}</div>
          </div>
        )}

        {safeArr(location.tags).length > 0 && (
          <div className="mb-2 flex gap-1 flex-wrap">
            {safeArr(location.tags).map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant">{t}</span>
            ))}
          </div>
        )}

        {location.dungeonState && (
          <details className="mb-3">
            <summary className="text-[9px] uppercase tracking-widest text-tertiary cursor-pointer">Dungeon state (JSON)</summary>
            <pre className="mt-1 text-[10px] text-on-surface-variant whitespace-pre-wrap max-h-40 overflow-y-auto">{JSON.stringify(safeJson(location.dungeonState), null, 2)}</pre>
          </details>
        )}

        {location.tacticalGrid && (
          <details className="mb-3">
            <summary className="text-[9px] uppercase tracking-widest text-tertiary cursor-pointer">Tactical grid (JSON)</summary>
            <pre className="mt-1 text-[10px] text-on-surface-variant whitespace-pre-wrap max-h-40 overflow-y-auto">{JSON.stringify(safeJson(location.tacticalGrid), null, 2)}</pre>
          </details>
        )}

        {/* ── Sublocations ── */}
        <Section title={`Sublocations (${sublocations.length})`}>
          {sublocations.length === 0 ? <Empty /> : (
            <ul className="max-h-32 overflow-y-auto space-y-0.5">
              {sublocations.map((s) => (
                <li key={s.id} className="text-[10px]">
                  <span className="font-bold">{s.canonicalName}</span>
                  <span className="text-on-surface-variant ml-2">{s.locationType}</span>
                  <span className="text-on-surface-variant ml-1">{s.dangerLevel}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── NPCs here (current location) ── */}
        <Section title={`NPCs here — current (${npcs.length})`}>
          {npcs.length === 0 ? <Empty /> : (
            <ul className="space-y-0.5">
              {npcs.map((n) => (
                <li key={n.id} className="text-[10px]">
                  <span className="font-bold">{n.name}</span>
                  {n.role && <span className="text-on-surface-variant"> ({n.role})</span>}
                  {n.category && <span className="text-on-surface-variant ml-1">[{n.category}]</span>}
                  {n.companionOfCampaignId && <span className="ml-2 text-tertiary">[companion]</span>}
                  {n.pausedAt && <span className="ml-2 text-on-surface-variant">[paused]</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── NPCs homed here ── */}
        <Section title={`NPCs — home (${homeNpcs.length})`}>
          {homeNpcs.length === 0 ? <Empty /> : (
            <ul className="space-y-0.5">
              {homeNpcs.map((n) => (
                <li key={n.id} className="text-[10px]">
                  <span className="font-bold">{n.name}</span>
                  {n.role && <span className="text-on-surface-variant"> ({n.role})</span>}
                  <span className={n.alive ? 'text-on-surface ml-1' : 'text-error ml-1'}>{n.alive ? '✓' : '✗'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Knowledge ── */}
        <Section title={`Knowledge (${knowledge.length})`}>
          {knowledge.length === 0 ? <Empty /> : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {knowledge.map((k) => (
                <li key={k.id} className="text-[10px]">
                  <span className="text-on-surface">{k.content}</span>
                  <span className="text-on-surface-variant ml-2">[{k.source} / {k.kind}]</span>
                  <span className="text-on-surface-variant ml-1">{new Date(k.addedAt).toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Roads ── */}
        <Section title={`Roads (${roads.length})`}>
          {roads.length === 0 ? <Empty /> : (
            <ul className="max-h-32 overflow-y-auto space-y-0.5">
              {roads.map((r) => {
                const other = r.fromLocationId === id ? r.to : r.from;
                return (
                  <li key={r.id} className="text-[10px]">
                    <span className="font-bold">{other?.canonicalName || '?'}</span>
                    <span className="text-on-surface-variant ml-2">{r.distance ? `${r.distance} km` : ''}</span>
                    <span className="text-on-surface-variant ml-1">{r.terrainType || ''}</span>
                    <span className="text-on-surface-variant ml-1">{r.difficulty || ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* ── Related quests ── */}
        <Section title={`Related quests (${relatedQuests.length})`}>
          {relatedQuests.length === 0 ? <Empty /> : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {relatedQuests.map((q) => (
                <div key={q.id} className="p-2 rounded-sm bg-surface-container/30 border border-outline-variant/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-on-surface">{q.name}</span>
                    <QuestStatusBadge status={q.status} />
                    <span className="text-[9px] text-on-surface-variant">{q.type}</span>
                    {q.campaign && <span className="text-[9px] text-on-surface-variant ml-auto">{q.campaign.name}</span>}
                  </div>
                  {q.objectives?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {q.objectives.map((o) => (
                        <li key={String(o.id)} className="text-[10px] flex items-baseline gap-1">
                          <ObjectiveStatusIcon status={o.status} />
                          <span>{o.description}</span>
                          {o.progress > 0 && <span className="text-on-surface-variant">({o.progress}/{o.targetAmount})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Location summaries ── */}
        <Section title={`Campaign summaries (${locationSummaries.length})`}>
          {locationSummaries.length === 0 ? <Empty /> : (
            <div className="max-h-48 overflow-y-auto space-y-2">
              {locationSummaries.map((ls) => (
                <div key={ls.id} className="p-2 rounded-sm bg-surface-container/30 border border-outline-variant/10">
                  <div className="text-[9px] text-on-surface-variant mb-1">
                    {ls.campaign?.name || ls.campaignId?.slice(0, 8)} — {ls.sceneCount} scenes
                  </div>
                  <div className="text-[10px] text-on-surface">{ls.summary}</div>
                  {safeArr(ls.keyNpcs).length > 0 && (
                    <div className="text-[9px] text-on-surface-variant mt-1">Key NPCs: {safeArr(ls.keyNpcs).join(', ')}</div>
                  )}
                  {safeArr(ls.unresolvedHooks).length > 0 && (
                    <div className="text-[9px] text-on-surface-variant">Hooks: {safeArr(ls.unresolvedHooks).join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Events ── */}
        <Section title={`Recent events (${events.length})`}>
          <EventList events={events} />
        </Section>

        {/* ── Meta ── */}
        <Section title="Meta">
          <div className="grid grid-cols-2 gap-2">
            <KV k="id" v={location.id} />
            <KV k="createdAt" v={new Date(location.createdAt).toISOString().slice(0, 16)} />
            <KV k="updatedAt" v={new Date(location.updatedAt).toISOString().slice(0, 16)} />
            {location.originCampaignId && <KV k="originCampaignId" v={location.originCampaignId} />}
            {location.liberatedAt && <KV k="liberatedAt" v={new Date(location.liberatedAt).toISOString().slice(0, 16)} />}
          </div>
        </Section>
      </div>
    </ModalShell>
  );
}

function QuestStatusBadge({ status }) {
  const colors = {
    active: 'bg-primary/20 text-primary',
    completed: 'bg-tertiary/20 text-tertiary',
    stalled: 'bg-warning/20 text-warning',
    failed: 'bg-error/20 text-error',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors[status] || 'bg-surface-variant text-on-surface-variant'}`}>
      {status}
    </span>
  );
}

function ObjectiveStatusIcon({ status }) {
  const icons = { done: '✓', pending: '○', locked: '🔒', skipped: '—', failed: '✗' };
  const colors = { done: 'text-tertiary', pending: 'text-on-surface-variant', locked: 'text-on-surface-variant', skipped: 'text-on-surface-variant', failed: 'text-error' };
  return <span className={`${colors[status] || 'text-on-surface-variant'} shrink-0`}>{icons[status] || '?'}</span>;
}

function safeJson(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
}

function safeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
