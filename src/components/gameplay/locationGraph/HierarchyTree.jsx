import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getNodeVisual } from './graphVisuals.js';

export default function HierarchyTree({ nodes, edges, selected, onSelect }) {
  const { t } = useTranslation();

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-outline text-[10px] uppercase tracking-widest gap-2 p-4">
        <span className="material-symbols-outlined text-xl">account_tree</span>
        {t('locationGraph.emptyTree')}
      </div>
    );
  }

  return (
    <div className="overflow-y-auto custom-scrollbar p-2 text-xs">
      {tree.map((root) => (
        <TreeNode
          key={root.id}
          node={root}
          selected={selected}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

function TreeNode({ node, selected, onSelect, depth }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const vis = getNodeVisual(node.type);
  const isSelected = selected?.type === 'node' && selected.id === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <button
        className={`flex items-center gap-1 w-full px-1 py-0.5 rounded-sm text-left transition-colors ${
          isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-on-surface-variant'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect({ type: 'node', id: node.id })}
        data-entity-id={node.id}
      >
        {hasChildren ? (
          <span
            className="material-symbols-outlined text-[10px] text-outline cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? 'expand_more' : 'chevron_right'}
          </span>
        ) : (
          <span className="w-[10px]" />
        )}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: vis.color }}
        />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildTree(nodes, edges) {
  const containsEdges = edges.filter((e) => e.edgeType === 'contains' && !e.bidirectional);
  const parentMap = new Map();
  for (const e of containsEdges) {
    if (!parentMap.has(e.toId)) parentMap.set(e.toId, e.fromId);
  }

  const childrenMap = new Map();
  for (const [childId, parentId] of parentMap) {
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId).push(childId);
  }

  const nodeById = new Map();
  for (const n of nodes) nodeById.set(n.id, n);

  function buildNode(id) {
    const n = nodeById.get(id);
    if (!n) return null;
    const childIds = childrenMap.get(id) || [];
    const children = childIds.map(buildNode).filter(Boolean);
    children.sort((a, b) => (a.scale ?? 5) - (b.scale ?? 5) || (a.name || '').localeCompare(b.name || ''));
    return { ...n, children };
  }

  const roots = nodes
    .filter((n) => !parentMap.has(n.id))
    .map((n) => buildNode(n.id))
    .filter(Boolean);

  roots.sort((a, b) => (a.scale ?? 5) - (b.scale ?? 5) || (a.name || '').localeCompare(b.name || ''));
  return roots;
}
