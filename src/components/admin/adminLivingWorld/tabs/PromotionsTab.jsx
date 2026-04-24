// Round E Phase 13a — unified "Pending canonicalizations" admin tab.
//
// Three stacked sections:
//   1. Run write-back — pick a campaign, hit the trigger, show the result.
//   2. Pending world state changes — approve/reject Phase 12 MEDIUM queue.
//   3. NPC promotion candidates — approve/reject Phase 12b queue, collapse
//      dupes flagged by `stats.dedupeOfId` into a single parent row.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import ActionBtn from '../shared/ActionBtn';
import { Empty, KV, Section } from '../shared/primitives';

function safeJsonParse(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
}

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().slice(0, 16).replace('T', ' '); }
  catch { return '—'; }
}

function StatusBadge({ status }) {
  const color =
    status === 'approved' ? 'bg-tertiary/15 text-tertiary border-tertiary/30'
    : status === 'rejected' ? 'bg-error/15 text-error border-error/30'
    : 'bg-surface-container/60 text-on-surface-variant border-outline-variant/30';
  return (
    <span className={`inline-block text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${color}`}>
      {status || 'pending'}
    </span>
  );
}

function RunWritebackPanel() {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/v1/admin/livingWorld/campaigns?limit=200')
      .then((r) => setCampaigns(Array.isArray(r?.rows) ? r.rows : []))
      .catch((err) => setError(err?.message || 'Nie udało się załadować listy kampanii'));
  }, []);

  const trigger = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiClient.post(
        `/v1/admin/livingWorld/campaigns/${selected}/run-writeback`,
        { dryRun },
      );
      setResult(r);
    } catch (err) {
      setError(err?.message || 'Błąd run-writeback');
    } finally {
      setLoading(false);
    }
  }, [selected, dryRun]);

  const summary = result?.result
    ? {
        dryRun: result.result.dryRun,
        npcsExamined: result.result.diff?.summary?.npcsExamined ?? 0,
        npcsWithChanges: result.result.diff?.summary?.npcsWithChanges ?? 0,
        extractedChanges: result.result.factExtraction?.changes?.length ?? 0,
        applied: result.result.apply?.applied?.length ?? 0,
        worldChangesApplied: result.result.worldStateChanges?.appliedKnowledge?.length ?? 0,
        worldChangesPending: result.result.worldStateChanges?.pending?.length ?? 0,
        promotionCollected: result.result.promotion?.collected?.length ?? 0,
        promotionPersisted: result.result.promotion?.persisted?.length ?? 0,
        memoryPromoted: result.result.memoryPromotion?.promoted?.length ?? 0,
        locationPromoCollected: result.result.locationPromotion?.collected?.length ?? 0,
        locationPromoPersisted: result.result.locationPromotion?.persisted?.length ?? 0,
      }
    : null;

  return (
    <div className="rounded-sm border border-outline-variant/25 p-3 bg-surface-container/30">
      <div className="text-[10px] uppercase tracking-widest text-tertiary mb-2">Run write-back</div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-surface border border-outline-variant/30 rounded-sm px-2 py-1 text-[11px] min-w-[280px]"
        >
          <option value="">— wybierz kampanię —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {formatDate(c.lastSaved || c.createdAt)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-on-surface-variant">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          dryRun
        </label>
        <ActionBtn onClick={trigger} disabled={!selected || loading}>
          {loading ? 'running…' : 'Run write-back'}
        </ActionBtn>
      </div>
      {error && <div className="mt-2 text-[10px] text-error">{error}</div>}
      {summary && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
          <KV k="dryRun" v={String(summary.dryRun)} />
          <KV k="npcs examined" v={summary.npcsExamined} />
          <KV k="npcs with changes" v={summary.npcsWithChanges} />
          <KV k="shadow applied" v={summary.applied} />
          <KV k="llm facts" v={summary.extractedChanges} />
          <KV k="world-changes applied" v={summary.worldChangesApplied} />
          <KV k="world-changes pending" v={summary.worldChangesPending} />
          <KV k="npc promo collected" v={summary.promotionCollected} />
          <KV k="npc promo persisted" v={summary.promotionPersisted} />
          <KV k="memory promoted" v={summary.memoryPromoted} />
          <KV k="loc promo collected" v={summary.locationPromoCollected} />
          <KV k="loc promo persisted" v={summary.locationPromoPersisted} />
        </div>
      )}
    </div>
  );
}

function PendingWorldStateChangesPanel({ refreshKey, bumpRefresh }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}&limit=200` : '?limit=200';
      const r = await apiClient.get(`/v1/admin/livingWorld/pending-world-state-changes${q}`);
      setRows(Array.isArray(r?.rows) ? r.rows : []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const decide = useCallback(async (id, decision) => {
    setBusyId(id);
    try {
      await apiClient.post(
        `/v1/admin/livingWorld/pending-world-state-changes/${id}/${decision}`,
        {},
      );
      bumpRefresh();
    } catch (err) {
      alert(err?.message || `${decision} failed`);
    } finally {
      setBusyId(null);
    }
  }, [bumpRefresh]);

  return (
    <Section title={`Pending world state changes (${rows.length})`}>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-outline-variant/30 rounded-sm px-2 py-1 text-[10px]"
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="">all</option>
        </select>
        <span className="text-[10px] text-on-surface-variant">{loading ? 'Loading…' : ''}</span>
      </div>
      {rows.length === 0 ? <Empty /> : (
        <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
              <tr>
                <th className="px-2 py-1 text-left">Kind</th>
                <th className="px-2 py-1 text-left">Target</th>
                <th className="px-2 py-1 text-left">Value</th>
                <th className="px-2 py-1 text-right">Conf</th>
                <th className="px-2 py-1 text-right">Sim</th>
                <th className="px-2 py-1 text-left">Reason</th>
                <th className="px-2 py-1 text-left">Status</th>
                <th className="px-2 py-1 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-outline-variant/10 align-top">
                  <td className="px-2 py-1 font-mono text-[10px]">{r.kind}</td>
                  <td className="px-2 py-1">
                    <div className="text-[10px]">{r.targetHint || '—'}</div>
                    <div className="text-[9px] text-on-surface-variant">
                      {r.targetEntityType || '—'}{r.targetEntityId ? ` · ${r.targetEntityId.slice(-6)}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-1 max-w-[280px]">
                    <div className="text-[10px] whitespace-pre-wrap break-words">{r.newValue}</div>
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[10px]">{(r.confidence ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1 text-right font-mono text-[10px]">{r.similarity != null ? r.similarity.toFixed(2) : '—'}</td>
                  <td className="px-2 py-1 text-[10px] text-on-surface-variant">{r.reason || '—'}</td>
                  <td className="px-2 py-1"><StatusBadge status={r.status} /></td>
                  <td className="px-2 py-1">
                    {r.status === 'pending' ? (
                      <div className="flex gap-1">
                        <ActionBtn disabled={busyId === r.id} onClick={() => decide(r.id, 'approve')}>approve</ActionBtn>
                        <ActionBtn danger disabled={busyId === r.id} onClick={() => decide(r.id, 'reject')}>reject</ActionBtn>
                      </div>
                    ) : (
                      <div className="text-[9px] text-on-surface-variant">
                        {r.reviewedBy || '—'}<br />{formatDate(r.reviewedAt)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function PromotionCandidatesPanel({ refreshKey, bumpRefresh }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}&limit=200` : '?limit=200';
      const r = await apiClient.get(`/v1/admin/livingWorld/promotion-candidates${q}`);
      setRows(Array.isArray(r?.rows) ? r.rows : []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Collapse dedup chains: stats.dedupeOfId points to the parent row's
  // `campaignNpcId`. We group children under their parent so admin only
  // sees one row per semantic cluster.
  const grouped = useMemo(() => {
    const byChildKey = new Map();
    const children = [];
    const parents = [];
    for (const row of rows) {
      const stats = safeJsonParse(row.stats) || {};
      const dedupeOfId = stats.dedupeOfId || null;
      if (dedupeOfId) {
        children.push({ row, stats, dedupeOfId });
      } else {
        parents.push({ row, stats });
      }
    }
    for (const p of parents) byChildKey.set(p.row.campaignNpcId, []);
    for (const c of children) {
      const list = byChildKey.get(c.dedupeOfId);
      if (list) list.push(c);
      else parents.push({ row: c.row, stats: c.stats }); // orphaned — show standalone
    }
    return parents.map((p) => ({
      ...p,
      duplicates: byChildKey.get(p.row.campaignNpcId) || [],
    }));
  }, [rows]);

  const decide = useCallback(async (id, decision) => {
    setBusyId(id);
    try {
      await apiClient.post(
        `/v1/admin/livingWorld/promotion-candidates/${id}/${decision}`,
        {},
      );
      bumpRefresh();
    } catch (err) {
      alert(err?.message || `${decision} failed`);
    } finally {
      setBusyId(null);
    }
  }, [bumpRefresh]);

  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <Section title={`NPC promotion candidates (${grouped.length})`}>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-outline-variant/30 rounded-sm px-2 py-1 text-[10px]"
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="">all</option>
        </select>
        <span className="text-[10px] text-on-surface-variant">{loading ? 'Loading…' : ''}</span>
      </div>
      {grouped.length === 0 ? <Empty /> : (
        <div className="flex flex-col gap-2">
          {grouped.map(({ row, stats, duplicates }) => {
            const verdict = safeJsonParse(row.smallModelVerdict);
            const isOpen = expanded.has(row.id);
            return (
              <div key={row.id} className="rounded-sm border border-outline-variant/25 bg-surface-container/30">
                <div className="flex items-start justify-between gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[12px]">{row.name}</span>
                      {row.role && <span className="text-[10px] text-on-surface-variant">— {row.role}</span>}
                      <StatusBadge status={row.status} />
                      {duplicates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-tertiary/30 text-tertiary hover:bg-tertiary/10"
                        >
                          {isOpen ? '▾' : '▸'} {duplicates.length} dupes
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-0.5 mt-1">
                      <KV k="score" v={stats.score ?? '—'} />
                      <KV k="interactions" v={stats.interactionCount ?? 0} />
                      <KV k="return visits" v={stats.questInvolvementCount ?? 0} />
                      <KV k="structural quests" v={stats.structuralQuestCount ?? 0} />
                      <KV k="last" v={formatDate(stats.lastInteractionAt)} />
                    </div>
                    {verdict && (
                      <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5">
                        <KV k="recommend" v={verdict.recommend || '—'} />
                        <KV k="uniqueness" v={verdict.uniqueness ?? '—'} />
                        <KV k="worldFit" v={verdict.worldFit ?? '—'} />
                        <KV k="reasons" v={Array.isArray(verdict.reasons) ? verdict.reasons.join('; ') : '—'} />
                      </div>
                    )}
                    {row.personality && (
                      <div className="mt-1 text-[10px] text-on-surface-variant whitespace-pre-wrap">
                        {row.personality}
                      </div>
                    )}
                    {row.dialogSample && (
                      <details className="mt-1">
                        <summary className="text-[10px] cursor-pointer text-on-surface-variant hover:text-on-surface">dialog sample</summary>
                        <pre className="mt-1 text-[10px] whitespace-pre-wrap bg-surface rounded-sm p-2 border border-outline-variant/20">{row.dialogSample}</pre>
                      </details>
                    )}
                    {row.reviewNotes && (
                      <div className="mt-1 text-[10px] text-on-surface-variant italic">
                        {row.reviewedBy ? `${row.reviewedBy}: ` : ''}{row.reviewNotes}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {row.status === 'pending' ? (
                      <div className="flex flex-col gap-1">
                        <ActionBtn disabled={busyId === row.id} onClick={() => decide(row.id, 'approve')}>approve</ActionBtn>
                        <ActionBtn danger disabled={busyId === row.id} onClick={() => decide(row.id, 'reject')}>reject</ActionBtn>
                      </div>
                    ) : (
                      <div className="text-[9px] text-on-surface-variant text-right">
                        {row.reviewedBy || '—'}<br />{formatDate(row.reviewedAt)}
                      </div>
                    )}
                  </div>
                </div>
                {isOpen && duplicates.length > 0 && (
                  <div className="border-t border-outline-variant/20 bg-surface/50 px-2 py-1">
                    <div className="text-[9px] uppercase tracking-widest text-on-surface-variant mb-1">Duplicates</div>
                    {duplicates.map(({ row: d, stats: ds }) => (
                      <div key={d.id} className="flex items-baseline gap-3 text-[10px] py-0.5 border-t border-outline-variant/10">
                        <span className="font-bold">{d.name}</span>
                        <span className="text-on-surface-variant">{d.role || '—'}</span>
                        <span className="font-mono">sim {ds.dedupeSimilarity != null ? Number(ds.dedupeSimilarity).toFixed(2) : '—'}</span>
                        <span className="font-mono">score {ds.score ?? '—'}</span>
                        <StatusBadge status={d.status} />
                        <span className="flex-1" />
                        {d.status === 'pending' && (
                          <>
                            <ActionBtn disabled={busyId === d.id} onClick={() => decide(d.id, 'approve')}>approve</ActionBtn>
                            <ActionBtn danger disabled={busyId === d.id} onClick={() => decide(d.id, 'reject')}>reject</ActionBtn>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function LocationPromotionCandidatesPanel({ refreshKey, bumpRefresh }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}&limit=200` : '?limit=200';
      const r = await apiClient.get(`/v1/admin/livingWorld/location-promotion-candidates${q}`);
      setRows(Array.isArray(r?.rows) ? r.rows : []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const decide = useCallback(async (id, decision) => {
    setBusyId(id);
    try {
      await apiClient.post(
        `/v1/admin/livingWorld/location-promotion-candidates/${id}/${decision}`,
        {},
      );
      bumpRefresh();
    } catch (err) {
      alert(err?.message || `${decision} failed`);
    } finally {
      setBusyId(null);
    }
  }, [bumpRefresh]);

  return (
    <Section title={`Location promotion candidates (${rows.length})`}>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-outline-variant/30 rounded-sm px-2 py-1 text-[10px]"
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="">all</option>
        </select>
        <span className="text-[10px] text-on-surface-variant">{loading ? 'Loading…' : ''}</span>
      </div>
      {rows.length === 0 ? <Empty /> : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const stats = safeJsonParse(row.stats) || {};
            return (
              <div key={row.id} className="rounded-sm border border-outline-variant/25 bg-surface-container/30">
                <div className="flex items-start justify-between gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[12px]">{row.displayName || row.canonicalName}</span>
                      {row.locationType && <span className="text-[10px] text-on-surface-variant">{row.locationType}</span>}
                      {row.region && <span className="text-[10px] text-on-surface-variant">· {row.region}</span>}
                      <StatusBadge status={row.status} />
                      {stats.dedupeOfId && (
                        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-error/30 text-error">
                          dupe sim {Number(stats.dedupeSimilarity || 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 mt-1">
                      <KV k="score" v={stats.score ?? '—'} />
                      <KV k="scenes" v={stats.sceneCount ?? 0} />
                      <KV k="quest objs" v={stats.questObjectiveCount ?? 0} />
                      <KV k="created" v={formatDate(row.createdAt)} />
                    </div>
                    {row.description && (
                      <div className="mt-1 text-[10px] text-on-surface-variant whitespace-pre-wrap">
                        {row.description}
                      </div>
                    )}
                    {row.reviewNotes && (
                      <div className="mt-1 text-[10px] text-on-surface-variant italic">
                        {row.reviewedBy ? `${row.reviewedBy}: ` : ''}{row.reviewNotes}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {row.status === 'pending' ? (
                      <div className="flex flex-col gap-1">
                        <ActionBtn disabled={busyId === row.id} onClick={() => decide(row.id, 'approve')}>approve</ActionBtn>
                        <ActionBtn danger disabled={busyId === row.id} onClick={() => decide(row.id, 'reject')}>reject</ActionBtn>
                      </div>
                    ) : (
                      <div className="text-[9px] text-on-surface-variant text-right">
                        {row.reviewedBy || '—'}<br />{formatDate(row.reviewedAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export default function PromotionsTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="flex flex-col gap-4">
      <RunWritebackPanel />
      <PendingWorldStateChangesPanel refreshKey={refreshKey} bumpRefresh={bumpRefresh} />
      <PromotionCandidatesPanel refreshKey={refreshKey} bumpRefresh={bumpRefresh} />
      <LocationPromotionCandidatesPanel refreshKey={refreshKey} bumpRefresh={bumpRefresh} />
    </div>
  );
}
