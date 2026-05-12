import { useTranslation } from 'react-i18next';

/**
 * Floating overlay that shows AI-proposed graph patches with per-item accept/reject.
 *
 * @param {{ revision: import('../../../hooks/useGraphRevision').ReturnType, allNodes: object[], allEdges: object[] }} props
 */
export default function RevisionPanel({ revision, allNodes = [], allEdges = [] }) {
  const { t } = useTranslation();
  const { result, error, applyAll, applyOne, rejectOne, clearResult, isApplied, totalPatches } = revision;

  if (!result && !error) return null;

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const edgeMap = new Map(allEdges.map((e) => [e.id, e]));

  const nodePatches = result?.patches?.nodes || [];
  const edgePatches = result?.patches?.edges || [];

  return (
    <div className="absolute bottom-2 right-2 z-20 w-80 max-h-[60%] flex flex-col bg-surface-container-highest/95 backdrop-blur-sm border border-outline-variant/25 rounded-sm shadow-xl text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/15 shrink-0">
        <span className="font-label uppercase tracking-widest text-secondary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">psychology</span>
          {t('locationGraph.revision.title', { defaultValue: 'Rewizja AI' })}
        </span>
        <div className="flex items-center gap-1.5">
          {totalPatches > 0 && (
            <button
              type="button"
              onClick={applyAll}
              className="px-2 py-0.5 rounded-sm bg-green-500/15 border border-green-500/25 hover:bg-green-500/25 text-green-400 transition-colors"
            >
              {t('locationGraph.revision.applyAll', { defaultValue: 'Zastosuj wszystkie' })}
            </button>
          )}
          <button
            type="button"
            onClick={clearResult}
            className="text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {/* Reasoning */}
      {result?.reasoning && (
        <div className="px-3 py-2 text-on-surface-variant border-b border-outline-variant/10 italic">
          {result.reasoning}
        </div>
      )}

      {/* Patches list */}
      <div className="flex-1 overflow-y-auto">
        {totalPatches === 0 && !error && (
          <div className="px-3 py-4 text-center text-on-surface-variant">
            {t('locationGraph.revision.noChanges', { defaultValue: 'Graf jest spójny — brak zmian.' })}
          </div>
        )}

        {nodePatches.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-outline mb-1">
              {t('locationGraph.revision.nodeChanges', {
                count: nodePatches.length,
                defaultValue: `Lokacje (${nodePatches.length})`,
              })}
            </div>
            {nodePatches.map((patch) => (
              <PatchItem
                key={patch.id}
                kind="node"
                patch={patch}
                original={nodeMap.get(patch.id)}
                onApply={() => applyOne('node', patch.id)}
                onReject={() => rejectOne('node', patch.id)}
                applied={isApplied('node', patch.id)}
                t={t}
              />
            ))}
          </div>
        )}

        {edgePatches.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-outline mb-1">
              {t('locationGraph.revision.edgeChanges', {
                count: edgePatches.length,
                defaultValue: `Krawędzie (${edgePatches.length})`,
              })}
            </div>
            {edgePatches.map((patch) => {
              const edge = edgeMap.get(patch.id);
              const fromNode = edge ? nodeMap.get(edge.fromId) : null;
              const toNode = edge ? nodeMap.get(edge.toId) : null;
              return (
                <PatchItem
                  key={patch.id}
                  kind="edge"
                  patch={patch}
                  original={edge}
                  label={fromNode && toNode ? `${fromNode.name} → ${toNode.name}` : patch.id}
                  onApply={() => applyOne('edge', patch.id)}
                  onReject={() => rejectOne('edge', patch.id)}
                  applied={isApplied('edge', patch.id)}
                  t={t}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PatchItem({ kind, patch, original, label, onApply, onReject, applied, t }) {
  const name = label || original?.name || patch.id.slice(0, 8);
  const fields = Object.entries(patch).filter(([k]) => k !== 'id');

  return (
    <div className={`mb-1.5 p-2 rounded-sm border transition-colors ${
      applied
        ? 'bg-green-500/5 border-green-500/15 opacity-60'
        : 'bg-white/3 border-outline-variant/10 hover:border-outline-variant/25'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-on-surface truncate mr-2" title={name}>
          {name}
        </span>
        {!applied && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onApply}
              className="px-1.5 py-0.5 rounded-sm bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors"
              title={t('locationGraph.revision.apply', { defaultValue: 'Zastosuj' })}
            >
              <span className="material-symbols-outlined text-xs">check</span>
            </button>
            <button
              type="button"
              onClick={onReject}
              className="px-1.5 py-0.5 rounded-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
              title={t('locationGraph.revision.reject', { defaultValue: 'Odrzuć' })}
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </button>
          </div>
        )}
        {applied && (
          <span className="text-green-400 text-[10px]">{t('locationGraph.revision.applied', { defaultValue: 'OK' })}</span>
        )}
      </div>
      <div className="space-y-0.5">
        {fields.map(([key, val]) => {
          const oldVal = original?.[key];
          const displayOld = formatVal(oldVal);
          const displayNew = formatVal(val);
          return (
            <div key={key} className="flex gap-1 text-[10px]">
              <span className="text-outline w-16 shrink-0 truncate">{key}</span>
              {displayOld !== displayNew && (
                <>
                  <span className="text-red-400/60 line-through truncate max-w-[80px]" title={displayOld}>{displayOld}</span>
                  <span className="text-outline">→</span>
                </>
              )}
              <span className="text-on-surface truncate" title={displayNew}>{displayNew}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatVal(val) {
  if (val == null) return '—';
  if (Array.isArray(val)) return val.join(', ') || '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
