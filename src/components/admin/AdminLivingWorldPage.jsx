// Living World Phase 6 — admin observability dashboard (scoped).
//
// Minimal 4-tab layout: NPCs / Locations / Events / Reputation. Drill-down
// via a detail modal. Deferred features (2D map, audit UI, reputation
// dashboard) live in knowledge/ideas/living-world-admin-extras.md.
//
// Access control: route guard checks isAdmin via /v1/auth/me. 403 shows a
// friendly message. Backend enforces the guard authoritatively.

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../services/apiClient';

const TABS = ['npcs', 'locations', 'events', 'reputation'];

export default function AdminLivingWorldPage() {
  const [tab, setTab] = useState('npcs');
  const [authorized, setAuthorized] = useState(null); // null=checking, true/false
  const [checkError, setCheckError] = useState(null);

  useEffect(() => {
    // Probe by calling the cheapest admin endpoint.
    apiClient
      .get('/v1/admin/livingWorld/locations?limit=1')
      .then(() => setAuthorized(true))
      .catch((err) => {
        setAuthorized(false);
        setCheckError(err?.message || 'Forbidden');
      });
  }, []);

  if (authorized === null) {
    return (
      <div className="p-8 text-on-surface-variant">Sprawdzam uprawnienia admina…</div>
    );
  }
  if (authorized === false) {
    return (
      <div className="p-8 max-w-xl">
        <h1 className="text-xl font-bold text-on-surface mb-2">Living World — Admin</h1>
        <p className="text-sm text-error">
          Brak dostępu. {checkError ? `(${checkError})` : ''}
        </p>
        <p className="text-xs text-on-surface-variant mt-2">
          Endpoint wymaga flag <code>isAdmin</code> na użytkowniku.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-tertiary">public</span>
        Living World — Admin Dashboard
        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-tertiary/20 text-tertiary border border-tertiary/30">
          exp
        </span>
      </h1>

      <div className="flex items-center gap-1 border-b border-outline-variant/25 mb-4">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2 ${
              tab === name
                ? 'border-tertiary text-tertiary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'npcs' && <NpcListTab />}
      {tab === 'locations' && <LocationListTab />}
      {tab === 'events' && <EventTimelineTab />}
      {tab === 'reputation' && <ReputationListTab />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// NPCs
// ──────────────────────────────────────────────────────────────────────

function NpcListTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ alive: 'true', companion: '', locked: '' });
  const [detailId, setDetailId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter.alive) q.set('alive', filter.alive);
      if (filter.companion) q.set('companion', filter.companion);
      if (filter.locked) q.set('locked', filter.locked);
      q.set('limit', '100');
      const res = await apiClient.get(`/v1/admin/livingWorld/npcs?${q}`);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setTotal(Number(res?.total) || 0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <FilterSelect label="Alive" value={filter.alive} onChange={(v) => setFilter({ ...filter, alive: v })}
          options={[['', 'any'], ['true', 'alive'], ['false', 'dead']]} />
        <FilterSelect label="Companion" value={filter.companion} onChange={(v) => setFilter({ ...filter, companion: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <FilterSelect label="Locked" value={filter.locked} onChange={(v) => setFilter({ ...filter, locked: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <div className="ml-auto text-on-surface-variant self-center">{total} total • {loading ? '…' : `${rows.length} shown`}</div>
      </div>

      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 text-left">Name</th>
              <th className="px-2 py-1 text-left">Role</th>
              <th className="px-2 py-1 text-left">Alignment</th>
              <th className="px-2 py-1 text-left">Alive</th>
              <th className="px-2 py-1 text-left">Companion</th>
              <th className="px-2 py-1 text-left">Locked</th>
              <th className="px-2 py-1 text-left">Goal</th>
              <th className="px-2 py-1 text-left">Last tick</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} onClick={() => setDetailId(n.id)} className="border-t border-outline-variant/10 hover:bg-surface-container/30 cursor-pointer">
                <td className="px-2 py-1 font-bold text-on-surface">{n.name}</td>
                <td className="px-2 py-1">{n.role || '—'}</td>
                <td className="px-2 py-1">{n.alignment}</td>
                <td className="px-2 py-1">{n.alive ? '✓' : '✗'}</td>
                <td className="px-2 py-1">{n.companionOfCampaignId ? 'yes' : '—'}</td>
                <td className="px-2 py-1">{n.lockedByCampaignId ? 'yes' : '—'}</td>
                <td className="px-2 py-1 max-w-[20ch] truncate">{n.activeGoal || '—'}</td>
                <td className="px-2 py-1 text-on-surface-variant">{n.lastTickAt ? new Date(n.lastTickAt).toISOString().slice(0, 16) : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-3 text-center text-on-surface-variant">No NPCs match filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailId && <NpcDetailModal id={detailId} onClose={() => setDetailId(null)} onMutated={refresh} />}
    </div>
  );
}

function NpcDetailModal({ id, onClose, onMutated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get(`/v1/admin/livingWorld/npcs/${id}`).then(setData).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = useCallback(async (path, body) => {
    setActionBusy(true);
    setLastResult({ path, status: 'running' });
    try {
      console.log('[admin] POST', `/v1/admin/livingWorld/npcs/${id}/${path}`, body || '(no body)');
      const res = await apiClient.post(`/v1/admin/livingWorld/npcs/${id}/${path}`, body);
      console.log('[admin] response', path, res);
      setLastResult({ path, status: 'ok', data: res });
      load();
      onMutated?.();
    } catch (err) {
      console.error('[admin] action failed', path, err);
      setLastResult({ path, status: 'error', error: err?.message || String(err) });
    } finally {
      setActionBusy(false);
    }
  }, [id, load, onMutated]);

  if (loading) return <ModalShell onClose={onClose}><div>Loading…</div></ModalShell>;
  if (!data) return <ModalShell onClose={onClose}><div>Not found</div></ModalShell>;
  const { npc, events = [], attributions = [], goalProgress } = data;

  return (
    <ModalShell onClose={onClose} title={`${npc.name}  (${npc.role || 'no role'})`}>
      <div className="text-[11px] text-on-surface">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="canonicalId" v={npc.canonicalId} />
          <KV k="alignment" v={npc.alignment} />
          <KV k="factionId" v={npc.factionId || '—'} />
          <KV k="alive" v={npc.alive ? '✓' : '✗'} />
          <KV k="currentLocationId" v={npc.currentLocationId || '—'} />
          <KV k="pausedAt" v={npc.pausedAt ? new Date(npc.pausedAt).toISOString().slice(0, 16) : '—'} />
          <KV k="companionOfCampaignId" v={npc.companionOfCampaignId || '—'} />
          <KV k="lockedByCampaignId" v={npc.lockedByCampaignId || '—'} />
          <KV k="companionLoyalty" v={npc.companionLoyalty} />
          <KV k="lastTickAt" v={npc.lastTickAt ? new Date(npc.lastTickAt).toISOString().slice(0, 16) : '—'} />
        </div>

        {npc.activeGoal && (
          <div className="mb-3 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Active goal</div>
            <div>{npc.activeGoal}</div>
            {goalProgress && (
              <pre className="mt-2 text-[10px] text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(goalProgress, null, 2)}</pre>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <ActionBtn disabled={actionBusy} onClick={() => runAction('tick')}>Manual tick</ActionBtn>
          <ActionBtn disabled={actionBusy || !npc.pausedAt} onClick={() => runAction('force-unpause')}>Force unpause</ActionBtn>
          <ActionBtn danger disabled={actionBusy || !npc.lockedByCampaignId} onClick={() => runAction('release-lock')}>Release lock</ActionBtn>
          {actionBusy && <span className="text-[10px] text-on-surface-variant self-center">running…</span>}
        </div>

        {lastResult && (
          <div className={`mb-3 p-2 rounded-sm border text-[10px] ${
            lastResult.status === 'error' ? 'border-error/40 bg-error/10 text-error' :
            lastResult.status === 'ok' ? 'border-tertiary/30 bg-tertiary/10 text-tertiary' :
            'border-outline-variant/30 bg-surface-container/40 text-on-surface-variant'
          }`}>
            <div className="font-bold uppercase tracking-widest text-[9px] mb-1">
              {lastResult.path} → {lastResult.status}
            </div>
            {lastResult.error && <div>{lastResult.error}</div>}
            {lastResult.data && (
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(lastResult.data, null, 2)}</pre>
            )}
          </div>
        )}

        <Section title={`Recent events (${events.length})`}>
          {events.length === 0 ? <Empty /> : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {events.map((e) => (
                <li key={e.id} className="text-[10px]">
                  <span className="text-tertiary">[{e.eventType}]</span>{' '}
                  <span className="text-on-surface-variant">{new Date(e.createdAt).toISOString().slice(0, 16)}</span>{' '}
                  <span>{summarizePayload(e.payload)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Attributions (${attributions.length})`}>
          {attributions.length === 0 ? <Empty /> : (
            <ul className="max-h-32 overflow-y-auto space-y-1">
              {attributions.map((a) => (
                <li key={a.id} className="text-[10px]">
                  <span className="text-tertiary">[{a.actionType}]</span>{' '}
                  <span className={a.justified ? 'text-on-surface' : 'text-error'}>{a.justified ? 'justified' : 'unjustified'}</span>{' '}
                  <span className="text-on-surface-variant">conf={Math.round((a.judgeConfidence || 0) * 100)}%</span>{' '}
                  <span className="text-on-surface-variant">{a.judgeReason || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Locations
// ──────────────────────────────────────────────────────────────────────

function LocationListTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/locations?limit=200')
      .then((r) => setRows(Array.isArray(r?.rows) ? r.rows : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="text-[11px] text-on-surface-variant mb-2">{loading ? 'Loading…' : `${rows.length} locations`}</div>
      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 text-left">Canonical name</th>
              <th className="px-2 py-1 text-left">Region</th>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => setDetailId(l.id)} className="border-t border-outline-variant/10 hover:bg-surface-container/30 cursor-pointer">
                <td className="px-2 py-1 font-bold text-on-surface">{l.canonicalName}</td>
                <td className="px-2 py-1">{l.region || '—'}</td>
                <td className="px-2 py-1">{l.category}</td>
                <td className="px-2 py-1 text-on-surface-variant">{new Date(l.createdAt).toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailId && <LocationDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function LocationDetailModal({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get(`/v1/admin/livingWorld/locations/${id}`).then(setData);
  }, [id]);
  if (!data) return <ModalShell onClose={onClose}><div>Loading…</div></ModalShell>;
  const { location, npcs = [], events = [], aliases = [] } = data;
  return (
    <ModalShell onClose={onClose} title={location.canonicalName}>
      <div className="text-[11px] text-on-surface">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="region" v={location.region || '—'} />
          <KV k="category" v={location.category} />
          <KV k="aliases" v={(aliases || []).join(', ') || '—'} />
        </div>
        {location.description && <p className="mb-3 text-on-surface-variant">{location.description}</p>}
        <Section title={`NPCs here (${npcs.length})`}>
          {npcs.length === 0 ? <Empty /> : (
            <ul className="space-y-0.5">
              {npcs.map((n) => (
                <li key={n.id}>
                  <span className="font-bold">{n.name}</span>
                  {n.role && <span className="text-on-surface-variant"> ({n.role})</span>}
                  {n.companionOfCampaignId && <span className="ml-2 text-tertiary">[companion]</span>}
                  {n.pausedAt && <span className="ml-2 text-on-surface-variant">[paused]</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Recent events (${events.length})`}>
          <EventList events={events} />
        </Section>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Events timeline
// ──────────────────────────────────────────────────────────────────────

function EventTimelineTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ eventType: '', visibility: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter.eventType) q.set('eventType', filter.eventType);
      if (filter.visibility) q.set('visibility', filter.visibility);
      q.set('limit', '200');
      const res = await apiClient.get(`/v1/admin/livingWorld/events?${q}`);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <label className="flex items-center gap-1">
          <span className="text-on-surface-variant">eventType:</span>
          <input
            type="text"
            value={filter.eventType}
            onChange={(e) => setFilter({ ...filter, eventType: e.target.value })}
            placeholder="moved|killed|..."
            className="px-2 py-1 bg-surface-container rounded-sm border border-outline-variant/25 text-on-surface"
          />
        </label>
        <FilterSelect label="visibility" value={filter.visibility} onChange={(v) => setFilter({ ...filter, visibility: v })}
          options={[['', 'any'], ['campaign', 'campaign'], ['private', 'private'], ['deferred', 'deferred'], ['global', 'global']]} />
        <div className="ml-auto text-on-surface-variant self-center">{loading ? '…' : `${rows.length} events`}</div>
      </div>
      <EventList events={rows} showCampaignId />
    </div>
  );
}

function EventList({ events, showCampaignId }) {
  if (!events?.length) return <Empty />;
  return (
    <ul className="max-h-[60vh] overflow-y-auto divide-y divide-outline-variant/10 border border-outline-variant/25 rounded-sm">
      {events.map((e) => (
        <li key={e.id} className="px-2 py-1.5 text-[11px]">
          <div className="flex items-start gap-2">
            <span className="text-tertiary font-bold shrink-0">[{e.eventType}]</span>
            <span className="text-on-surface-variant shrink-0 font-mono text-[10px]">{new Date(e.createdAt).toISOString().slice(0, 16)}</span>
            {e.visibility !== 'campaign' && (
              <span className="text-[9px] uppercase px-1 rounded-sm bg-surface-container-highest text-on-surface-variant shrink-0">{e.visibility}</span>
            )}
            {showCampaignId && e.campaignId && (
              <span className="text-[9px] text-on-surface-variant font-mono shrink-0">c:{e.campaignId.slice(-6)}</span>
            )}
            <span className="text-on-surface min-w-0 break-words">{summarizePayload(e.payload)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reputation
// ──────────────────────────────────────────────────────────────────────

function ReputationListTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/reputation?limit=200')
      .then((r) => setRows(Array.isArray(r?.rows) ? r.rows : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="text-[11px] text-on-surface-variant mb-2">{loading ? 'Loading…' : `${rows.length} reputation rows`}</div>
      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 text-left">Character</th>
              <th className="px-2 py-1 text-left">Scope</th>
              <th className="px-2 py-1 text-left">Key</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-left">Label</th>
              <th className="px-2 py-1 text-right">Bounty</th>
              <th className="px-2 py-1 text-left">Vendetta</th>
              <th className="px-2 py-1 text-left">Last incident</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-outline-variant/10">
                <td className="px-2 py-1 font-mono text-[10px]">{r.characterId.slice(-8)}</td>
                <td className="px-2 py-1">{r.scope}</td>
                <td className="px-2 py-1">{r.scopeKey || '—'}</td>
                <td className={`px-2 py-1 text-right ${r.score < -100 ? 'text-error' : r.score > 100 ? 'text-tertiary' : ''}`}>{r.score}</td>
                <td className="px-2 py-1">{r.reputationLabel || '—'}</td>
                <td className="px-2 py-1 text-right">{r.bountyAmount > 0 ? `${r.bountyAmount} SK` : '—'}</td>
                <td className="px-2 py-1">{r.vendettaActive ? <span className="text-error font-bold">⚠</span> : '—'}</td>
                <td className="px-2 py-1 text-on-surface-variant">{r.lastIncidentAt ? new Date(r.lastIncidentAt).toISOString().slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared UI bits
// ──────────────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-on-surface-variant">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 bg-surface-container rounded-sm border border-outline-variant/25 text-on-surface"
      >
        {options.map(([val, labelText]) => (
          <option key={val || 'any'} value={val}>{labelText}</option>
        ))}
      </select>
    </label>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-sm border border-outline-variant/25 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/25 sticky top-0 bg-surface">
          <h2 className="text-sm font-bold text-on-surface">{title || 'Detail'}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] uppercase tracking-widest text-on-surface-variant shrink-0">{k}</span>
      <span className="font-mono text-[10px] text-on-surface break-all">{String(v)}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-3">
      <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-[10px] text-on-surface-variant italic">nothing</div>;
}

function ActionBtn({ children, disabled, onClick, danger }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border disabled:opacity-40 ${
        danger
          ? 'border-error/30 text-error hover:bg-error/10'
          : 'border-tertiary/30 text-tertiary hover:bg-tertiary/10'
      }`}
    >
      {children}
    </button>
  );
}

function summarizePayload(payload) {
  if (!payload) return '';
  let obj = payload;
  if (typeof payload === 'string') {
    try { obj = JSON.parse(payload); } catch { return payload.slice(0, 200); }
  }
  if (!obj || typeof obj !== 'object') return String(obj).slice(0, 200);
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    const short = typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${short.slice(0, 60)}`);
    if (parts.join(' ').length > 180) break;
  }
  return parts.join(' ');
}
