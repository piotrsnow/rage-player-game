// RulesEditor — CRUD for ConnectionRules + a lint banner for the pack.
//
// Shape:
//   [ lint banner ]
//   [ + add rule form ]
//   [ list of rules ]
//
// A rule says: "left traits -> right traits via (autotile_group | wall_bitmask)".
// Left/right traits are a small record of `biome|material|theme|style|climate`
// keys with free-string values (validated by shared Zod).

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { TRAIT_KEYS } from '../../../shared/mapSchemas/traitVocab.js';
import Spinner, { SkeletonList } from '../ui/Spinner.jsx';
import { useToasts } from '../ui/Toasts.jsx';
import Button from '../ui/Button.jsx';
import { Input, Select } from '../ui/Input.jsx';
import Chip from '../ui/Chip.jsx';

const BOX_CLS = 'border-t border-outline-variant/20 p-3.5 flex flex-col gap-2';

const VIA = ['autotile_group', 'wall_bitmask'];

const emptyDraft = () => ({
  name: '',
  leftTraits: {},
  rightTraits: {},
  via: 'autotile_group',
  viaRef: {},
  priority: 0,
});

export default function RulesEditor({ packId, groups = [] }) {
  const toasts = useToasts();
  const [rules, setRules] = useState([]);
  const [lint, setLint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());

  async function refresh() {
    if (!packId) return;
    setLoading(true);
    try {
      const [rows, lintResult] = await Promise.all([
        api.listRules(packId),
        api.lintPack(packId),
      ]);
      setRules(rows);
      setLint(lintResult);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
     
  }, [packId]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  async function addRule() {
    if (!packId) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRule({
        packId,
        name: draft.name.trim(),
        leftTraits: pruneEmpty(draft.leftTraits),
        rightTraits: pruneEmpty(draft.rightTraits),
        via: draft.via,
        viaRef: draft.viaRef || {},
        priority: Number(draft.priority) || 0,
      });
      setDraft(emptyDraft());
      await refresh();
      toasts.show('Rule added.', { level: 'success' });
    } catch (err) {
      const msg = err.message || String(err);
      setError(msg);
      toasts.show(`Add rule failed: ${msg}`, { level: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id) {
    setDeletingId(id);
    try {
      await api.deleteRule(id);
      await refresh();
      toasts.show('Rule deleted.', { level: 'success' });
    } catch (err) {
      const msg = err.message || String(err);
      setError(msg);
      toasts.show(`Delete rule failed: ${msg}`, { level: 'error' });
    } finally {
      setDeletingId(null);
    }
  }

  if (!packId) {
    return null;
  }

  return (
    <div className={BOX_CLS}>
      <div className="text-[11px] font-bold tracking-[0.08em] text-on-surface-variant/80 uppercase flex items-center gap-1.5">
        <span>Connection rules</span>
        {loading && <Spinner size={12} />}
      </div>

      <LintBanner lint={lint} onRefresh={refresh} />

      <div className="flex flex-col gap-1">
        {loading && rules.length === 0 && <SkeletonList count={2} rowHeight={42} />}
        {!loading && rules.length === 0 && (
          <div className="text-xs text-on-surface-variant/70">
            Brak reguł. Pierwszą dodaj niżej.
          </div>
        )}
        {rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            groupsById={groupsById}
            deleting={deletingId === r.id}
            onDelete={() => removeRule(r.id)}
          />
        ))}
      </div>

      <div className="text-[11px] text-on-surface-variant mt-2">Nowa reguła:</div>
      <Input
        placeholder="nazwa (np. grass → sand shore)"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />
      <TraitPicker
        label="Left traits"
        value={draft.leftTraits}
        onChange={(next) => setDraft((d) => ({ ...d, leftTraits: next }))}
      />
      <TraitPicker
        label="Right traits"
        value={draft.rightTraits}
        onChange={(next) => setDraft((d) => ({ ...d, rightTraits: next }))}
      />
      <div className="flex gap-1.5">
        <Select
          className="w-[160px]"
          value={draft.via}
          onChange={(e) => setDraft((d) => ({ ...d, via: e.target.value, viaRef: {} }))}
        >
          {VIA.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        {draft.via === 'autotile_group' && (
          <Select
            className="flex-1"
            value={draft.viaRef?.groupId || ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, viaRef: { groupId: e.target.value || undefined } }))
            }
          >
            <option value="">-- autotile group --</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.layout})</option>
            ))}
          </Select>
        )}
        {draft.via === 'wall_bitmask' && (
          <Input
            type="number"
            min={0}
            max={511}
            className="w-[120px]"
            placeholder="bitmask 0..511"
            value={draft.viaRef?.bitmask ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                viaRef: { bitmask: e.target.value === '' ? undefined : Number(e.target.value) },
              }))
            }
          />
        )}
        <Input
          type="number"
          min={0}
          max={1000}
          className="w-[80px]"
          placeholder="priority"
          value={draft.priority}
          onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
        />
      </div>
      <div>
        <Button variant="primary" disabled={busy} onClick={addRule}>
          {busy && <Spinner size={12} color="currentColor" />}
          {busy ? 'Dodawanie…' : '+ dodaj regułę'}
        </Button>
      </div>
      {error && <div className="text-xs text-error">{error}</div>}
    </div>
  );
}

function LintBanner({ lint, onRefresh }) {
  if (!lint) return null;
  const { issues = [], summary = {} } = lint;
  if (!issues.length) {
    return (
      <div className="text-xs px-2 py-1.5 rounded-sm bg-tertiary/10 border border-tertiary/30 text-tertiary">
        Lint: OK (0 warnings, 0 errors).
      </div>
    );
  }
  const severity = summary.errors
    ? 'bg-error/10 border-error/40 text-error'
    : 'bg-tertiary-dim/10 border-tertiary-dim/40 text-tertiary-dim';
  return (
    <details className={`text-xs px-2 py-1.5 rounded-sm border ${severity}`}>
      <summary className="cursor-pointer font-semibold">
        Lint: {summary.errors} error, {summary.warnings} warning
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onRefresh?.(); }}
          className="ml-2 bg-transparent border border-current text-inherit cursor-pointer text-[11px] px-1.5 py-px rounded-sm hover:bg-current/10"
        >
          refresh
        </button>
      </summary>
      <ul className="mt-1.5 ml-4 p-0">
        {issues.map((i, n) => (
          <li key={n} className="list-disc">
            <code className="text-[10px] opacity-70">[{i.code}]</code> {i.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function TraitPicker({ label, value, onChange }) {
  const [key, setKey] = useState(TRAIT_KEYS[0]);
  const [val, setVal] = useState('');
  const entries = Object.entries(value || {});
  function add() {
    const v = val.trim();
    if (!v) return;
    onChange({ ...(value || {}), [key]: v });
    setVal('');
  }
  function remove(k) {
    const next = { ...(value || {}) };
    delete next[k];
    onChange(next);
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-on-surface-variant/70">{label}</div>
      <div className="flex flex-wrap gap-1">
        {entries.length === 0 && (
          <span className="text-[11px] text-on-surface-variant/50">brak</span>
        )}
        {entries.map(([k, v]) => (
          <Chip
            key={k}
            active
            onClick={() => remove(k)}
            title="kliknij żeby usunąć"
          >
            {k}:{v} ×
          </Chip>
        ))}
      </div>
      <div className="flex gap-1">
        <Select className="w-[110px]" value={key} onChange={(e) => setKey(e.target.value)}>
          {TRAIT_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </Select>
        <Input
          className="flex-1"
          placeholder="value"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <Button onClick={add}>+</Button>
      </div>
    </div>
  );
}

function RuleRow({ rule, groupsById, deleting, onDelete }) {
  const group = rule.via === 'autotile_group' ? groupsById.get(rule.viaRef?.groupId) : null;
  return (
    <div
      className={`px-2 py-1.5 border border-outline-variant/20 rounded-sm flex flex-col gap-0.5 text-xs bg-surface-container/40 ${deleting ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="font-semibold flex-1 flex items-center gap-1.5 text-on-surface">
          {deleting && <Spinner size={12} />}
          {rule.name || <span className="opacity-50">(unnamed)</span>}
        </div>
        <div className="text-[10px] text-on-surface-variant/50">prio {rule.priority}</div>
        <Button variant="danger" onClick={onDelete} disabled={deleting}>
          ×
        </Button>
      </div>
      <div className="text-[11px] text-on-surface-variant/80">
        {formatTraits(rule.leftTraits)} → {formatTraits(rule.rightTraits)}
      </div>
      <div className="text-[10px] text-on-surface-variant/60">
        via {rule.via}
        {rule.via === 'autotile_group' && (group ? ` · ${group.name} (${group.layout})` : ' · ?group')}
        {rule.via === 'wall_bitmask' && ` · mask=${rule.viaRef?.bitmask ?? '-'}`}
      </div>
    </div>
  );
}

function formatTraits(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return <span className="opacity-50">∅</span>;
  return entries.map(([k, v]) => `${k}:${v}`).join(', ');
}

function pruneEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}
