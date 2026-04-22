// Round A (Phase 0a) — admin editor for `WorldLoreSection` rows.
//
// Minimal markdown editor: section list on the left, edit form on the right,
// tab toggle between "Edit" and "Preview" (preview is a naive textarea mirror
// — we deliberately avoid pulling in a markdown renderer library until there's
// a second use-case). Sections concat into the scene-gen prompt in `order`
// ascending, so the reorder buttons matter.
//
// All writes go through `/v1/admin/livingWorld/lore` (see
// backend/src/routes/adminLivingWorld.js). The scene-gen side (`buildWorldLorePreamble`
// in `aiContextTools.js`) caches by `max(updatedAt)`, so saves here invalidate
// on next scene.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../services/apiClient';

export default function AdminWorldLoreTab() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [draft, setDraft] = useState(null); // { slug, title, content, order }
  const [mode, setMode] = useState('edit'); // edit | preview
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/v1/admin/livingWorld/lore');
      setSections(res.sections || []);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to load lore');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sync draft when selection changes.
  useEffect(() => {
    if (!selectedSlug) { setDraft(null); return; }
    const match = sections.find((s) => s.slug === selectedSlug);
    if (!match) { setDraft(null); return; }
    setDraft({
      slug: match.slug,
      title: match.title || '',
      content: match.content || '',
      order: match.order ?? 0,
    });
    setSaveState('idle');
  }, [selectedSlug, sections]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    const match = sections.find((s) => s.slug === draft.slug);
    if (!match) return true;
    return match.title !== draft.title
      || (match.content || '') !== (draft.content || '')
      || (match.order ?? 0) !== (draft.order ?? 0);
  }, [draft, sections]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) { setError('Title required'); return; }
    setSaveState('saving');
    try {
      await apiClient.put(`/v1/admin/livingWorld/lore/${encodeURIComponent(draft.slug)}`, {
        title: draft.title.trim(),
        content: draft.content || '',
        order: draft.order ?? 0,
      });
      setSaveState('saved');
      setError(null);
      await load();
    } catch (err) {
      setSaveState('error');
      setError(err?.message || 'Save failed');
    }
  }, [draft, load]);

  const addSection = useCallback(async () => {
    const slug = (newSlug || '').trim().toLowerCase();
    const title = (newTitle || '').trim();
    if (!slug || !title) return;
    if (!/^[a-z0-9_-]+$/.test(slug)) { setError('slug: [a-z0-9_-]+'); return; }
    setSaveState('saving');
    try {
      await apiClient.put(`/v1/admin/livingWorld/lore/${encodeURIComponent(slug)}`, {
        title,
        content: '',
      });
      setNewSlug('');
      setNewTitle('');
      setShowAdd(false);
      setSelectedSlug(slug);
      setSaveState('saved');
      await load();
    } catch (err) {
      setSaveState('error');
      setError(err?.message || 'Create failed');
    }
  }, [newSlug, newTitle, load]);

  const removeSection = useCallback(async (slug) => {
    if (!slug) return;
    if (!window.confirm(`Usunąć sekcję "${slug}"?`)) return;
    try {
      await apiClient.del(`/v1/admin/livingWorld/lore/${encodeURIComponent(slug)}`);
      if (selectedSlug === slug) setSelectedSlug(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Delete failed');
    }
  }, [selectedSlug, load]);

  const move = useCallback(async (slug, delta) => {
    const idx = sections.findIndex((s) => s.slug === slug);
    if (idx === -1) return;
    const target = idx + delta;
    if (target < 0 || target >= sections.length) return;
    // Swap `order` values between the two neighbours. Simple and keeps the
    // order scale monotonic without re-numbering everything.
    const a = sections[idx];
    const b = sections[target];
    try {
      await apiClient.post('/v1/admin/livingWorld/lore/reorder', {
        order: [
          { slug: a.slug, order: b.order ?? target },
          { slug: b.slug, order: a.order ?? idx },
        ],
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Reorder failed');
    }
  }, [sections, load]);

  if (loading) return <div className="p-4 text-on-surface-variant text-xs">Ładuję sekcje…</div>;

  return (
    <div className="grid grid-cols-[220px_1fr] gap-4">
      {/* Section list */}
      <div className="border border-outline-variant/30 rounded p-2 min-h-[400px]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">Sekcje</div>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded bg-tertiary/20 text-tertiary border border-tertiary/30 hover:bg-tertiary/30"
            onClick={() => setShowAdd((v) => !v)}
          >
            + Dodaj
          </button>
        </div>
        {showAdd && (
          <div className="mb-2 p-2 border border-outline-variant/30 rounded bg-surface-container-lowest">
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="slug (main, pantheon…)"
              className="w-full text-xs px-2 py-1 mb-1 bg-surface border border-outline-variant/30 rounded"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tytuł sekcji"
              className="w-full text-xs px-2 py-1 mb-1 bg-surface border border-outline-variant/30 rounded"
            />
            <div className="flex gap-1">
              <button
                type="button"
                className="flex-1 text-xs px-2 py-1 rounded bg-tertiary text-on-tertiary"
                onClick={addSection}
              >
                Utwórz
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-outline-variant/30"
                onClick={() => { setShowAdd(false); setNewSlug(''); setNewTitle(''); }}
              >
                Anuluj
              </button>
            </div>
          </div>
        )}
        <ul className="space-y-1">
          {sections.map((s, idx) => (
            <li key={s.slug} className={`group flex items-center gap-1 rounded px-1 ${selectedSlug === s.slug ? 'bg-tertiary/10' : 'hover:bg-surface-container'}`}>
              <button
                type="button"
                onClick={() => setSelectedSlug(s.slug)}
                className="flex-1 text-left py-1 text-xs text-on-surface truncate"
                title={s.slug}
              >
                <span className="block font-semibold truncate">{s.title || s.slug}</span>
                <span className="block text-[10px] text-on-surface-variant truncate">
                  {s.slug} · order {s.order ?? 0}
                </span>
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1 text-on-surface-variant hover:text-on-surface"
                onClick={() => move(s.slug, -1)}
                disabled={idx === 0}
                title="Przenieś wyżej"
              >
                ▲
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1 text-on-surface-variant hover:text-on-surface"
                onClick={() => move(s.slug, 1)}
                disabled={idx === sections.length - 1}
                title="Przenieś niżej"
              >
                ▼
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1 text-error hover:text-error"
                onClick={() => removeSection(s.slug)}
                title="Usuń sekcję"
              >
                ✕
              </button>
            </li>
          ))}
          {sections.length === 0 && (
            <li className="text-xs text-on-surface-variant italic p-2">
              Brak sekcji. Seed utworzy domyślnie <code>main</code> przy starcie serwera.
            </li>
          )}
        </ul>
      </div>

      {/* Editor */}
      <div className="border border-outline-variant/30 rounded p-3 min-h-[400px]">
        {!draft && (
          <div className="text-xs text-on-surface-variant italic">
            Wybierz sekcję po lewej albo dodaj nową.
          </div>
        )}
        {draft && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="flex-1 text-sm font-bold px-2 py-1 bg-surface border border-outline-variant/30 rounded"
                placeholder="Tytuł sekcji"
              />
              <div className="flex text-xs border border-outline-variant/30 rounded overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${mode === 'edit' ? 'bg-tertiary/20 text-tertiary' : 'text-on-surface-variant'}`}
                  onClick={() => setMode('edit')}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${mode === 'preview' ? 'bg-tertiary/20 text-tertiary' : 'text-on-surface-variant'}`}
                  onClick={() => setMode('preview')}
                >
                  Preview
                </button>
              </div>
            </div>
            <div className="text-[10px] text-on-surface-variant mb-2">
              slug: <code>{draft.slug}</code> · Markdown concatenates into <code>[WORLD LORE]</code>
              {' '}block prepended to every scene prompt.
            </div>
            {mode === 'edit' ? (
              <textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                className="w-full h-80 text-xs font-mono px-2 py-2 bg-surface border border-outline-variant/30 rounded resize-y"
                placeholder="Markdown…"
              />
            ) : (
              <pre className="w-full h-80 text-xs px-2 py-2 bg-surface border border-outline-variant/30 rounded overflow-auto whitespace-pre-wrap">
{draft.content || <span className="text-on-surface-variant italic">Pusta sekcja</span>}
              </pre>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saveState === 'saving'}
                className="text-xs px-3 py-1 rounded bg-tertiary text-on-tertiary disabled:opacity-40"
              >
                {saveState === 'saving' ? 'Zapisuję…' : 'Zapisz'}
              </button>
              {saveState === 'saved' && !dirty && (
                <span className="text-[10px] text-tertiary">Zapisano</span>
              )}
              <span className="flex-1" />
              <span className="text-[10px] text-on-surface-variant">
                {draft.content.length} znaków (~{Math.ceil(draft.content.length / 4)} tokenów)
              </span>
            </div>
          </>
        )}
        {error && (
          <div className="mt-3 text-xs text-error border border-error/30 rounded px-2 py-1 bg-error/5">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
