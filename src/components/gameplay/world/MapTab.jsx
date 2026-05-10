import { useMemo, useState, useEffect } from 'react';
import { useCharacterSprites } from '../../../hooks/useCharacterSprites';
import { apiClient } from '../../../services/apiClient';
import { useTranslation } from 'react-i18next';
import { useLocationGraph } from '../../../hooks/useLocationGraph';
import { useCurrentLocationNode } from '../../../hooks/useCurrentLocationNode';
import { useGameScenes } from '../../../stores/gameSelectors';
import { isQuietScene } from '../../../services/quietSceneCheck';
import GraphCanvas from '../locationGraph/GraphCanvas.jsx';
import TravelInspectorPanel from '../locationGraph/TravelInspectorPanel.jsx';
import {
  loadGraphLayout,
  GRAPH_LAYOUT_STORAGE_PREFIX,
  GRAPH_LAYOUT_STORAGE_CHANGED,
} from '../../../utils/graphLayoutStorage.js';

export default function MapTab({ campaignId, onTravel }) {
  const { t } = useTranslation();
  const graph = useLocationGraph(campaignId);
  const currentNode = useCurrentLocationNode(graph);
  const scenes = useGameScenes();

  const [selected, setSelected] = useState(null);
  const [positionOverrides, setPositionOverrides] = useState(() => loadGraphLayout(campaignId).overrides);

  const { nodes, edges } = graph;

  const spriteItems = useMemo(
    () => (graph.occupants || []).map((o) => ({
      id: o.id,
      kind: o.type === 'player' ? 'character' : 'campaign-npc',
      spriteUrl: o.spriteUrl,
    })),
    [graph.occupants],
  );
  const extraOccupantSprites = useCharacterSprites(spriteItems, {
    campaignId,
    endpoint: 'campaign',
  });
  const occupantSpriteMap = useMemo(() => {
    const m = { ...extraOccupantSprites };
    for (const o of graph.occupants || []) {
      if (o.spriteUrl) m[o.id] = apiClient.resolveMediaUrl(o.spriteUrl);
    }
    return m;
  }, [graph.occupants, extraOccupantSprites]);

  useEffect(() => {
    setPositionOverrides(loadGraphLayout(campaignId).overrides);
  }, [campaignId]);

  useEffect(() => {
    if (graph.loading) return;
    setPositionOverrides(loadGraphLayout(campaignId).overrides);
  }, [graph.loading, campaignId]);

  useEffect(() => {
    const onLayoutStorage = (e) => {
      if (e.detail?.campaignId !== campaignId) return;
      setPositionOverrides(loadGraphLayout(campaignId).overrides);
    };
    const onNativeStorage = (e) => {
      if (e.key !== GRAPH_LAYOUT_STORAGE_PREFIX + campaignId) return;
      setPositionOverrides(loadGraphLayout(campaignId).overrides);
    };
    window.addEventListener(GRAPH_LAYOUT_STORAGE_CHANGED, onLayoutStorage);
    window.addEventListener('storage', onNativeStorage);
    return () => {
      window.removeEventListener(GRAPH_LAYOUT_STORAGE_CHANGED, onLayoutStorage);
      window.removeEventListener('storage', onNativeStorage);
    };
  }, [campaignId]);

  useEffect(() => {
    if (!selected && currentNode?.id) {
      setSelected({ type: 'node', id: currentNode.id });
    }
  }, [selected, currentNode?.id]);

  const adjacentIds = useMemo(() => {
    if (!currentNode) return new Set();
    const set = new Set();
    for (const e of edges) {
      if (e.fromId === currentNode.id) set.add(e.toId);
      if (e.toId === currentNode.id) set.add(e.fromId);
    }
    return set;
  }, [currentNode, edges]);

  const lastScene = scenes?.[scenes.length - 1] || null;
  const canAttemptDistantTravel = isQuietScene(lastScene);

  const selectedNode = useMemo(() => {
    if (selected?.type !== 'node') return null;
    return nodes.find((node) => node.id === selected.id) || null;
  }, [selected, nodes]);

  if (graph.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        {t('common.loading')}
      </div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-on-surface-variant">
        <span className="material-symbols-outlined mr-2">map</span>
        {t('worldState.emptyMap')}
      </div>
    );
  }

  return (
    <div className="h-full min-h-[600px] flex flex-col lg:flex-row gap-3">
      <div className="relative flex-1 min-h-[500px] rounded border border-outline-variant/20 bg-surface/40 overflow-hidden">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          occupants={graph.occupants}
          occupantSpriteMap={occupantSpriteMap}
          selected={selected}
          onSelect={setSelected}
          positionOverrides={positionOverrides}
          highlightedNodeId={currentNode?.id || null}
          highlightedAdjacentIds={adjacentIds}
        />
      </div>

      <div className="w-full lg:w-80 border border-outline-variant/20 bg-surface/40 rounded min-h-[240px]">
        <TravelInspectorPanel
          campaignId={campaignId}
          selectedNode={selectedNode}
          currentNode={currentNode}
          adjacentIds={adjacentIds}
          occupants={graph.occupants}
          occupantSpriteMap={occupantSpriteMap}
          canAttemptDistantTravel={canAttemptDistantTravel}
          onTravel={onTravel}
        />
      </div>
    </div>
  );
}
