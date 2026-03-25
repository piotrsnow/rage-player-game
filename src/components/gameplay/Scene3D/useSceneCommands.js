import { useMemo, useRef, useEffect, useState } from 'react';
import { useGame } from '../../../contexts/GameContext';
import { planScene } from '../../../services/scenePlanner';
import { reportWanted3dEntries } from '../../../services/wanted3dClient';
import {
  getModelCatalogVersion,
  refreshModelCatalog,
  subscribeModelCatalogVersion,
} from '../../../services/modelResolver3d';

function buildWantedEntriesFromCommand(scene, sceneCommand) {
  const sceneId = scene?.id || sceneCommand?.sceneId || '';
  const sceneText = scene?.narrative || '';
  const characters = (sceneCommand?.characters || []).map((characterCommand) => ({
    sceneId,
    sceneText,
    entityKind: characterCommand.id === 'player'
      ? 'player'
      : characterCommand.id?.startsWith('npc_')
        ? 'npc'
        : 'companion',
    objectId: characterCommand.id,
    objectName: characterCommand.name || 'Unknown',
    objectType: `character:${characterCommand.archetype || 'unknown'}`,
    objectDescription: characterCommand.archetype || '',
    suggestedModelId: characterCommand.modelId || null,
    suggestedCategory: characterCommand.modelCategory || null,
    suggestedFile: characterCommand.modelFile || null,
    matchScore: characterCommand.modelMatchScore || 0,
    alreadyExists: !!characterCommand.alreadyExists,
    status: characterCommand.needsModelReview
      ? (characterCommand.modelId ? 'review' : 'missing')
      : (characterCommand.modelId ? 'matched' : 'missing'),
  }));
  const objects = (sceneCommand?.objects || []).map((objectCommand) => ({
    sceneId,
    sceneText,
    entityKind: 'object',
    objectId: objectCommand.id,
    objectName: objectCommand.name || objectCommand.type,
    objectType: objectCommand.type,
    objectDescription: objectCommand.description || '',
    suggestedModelId: objectCommand.modelId || null,
    suggestedCategory: objectCommand.modelCategory || null,
    suggestedFile: objectCommand.modelFile || null,
    matchScore: objectCommand.modelMatchScore || 0,
    alreadyExists: !!objectCommand.alreadyExists,
    status: objectCommand.needsModelReview
      ? (objectCommand.modelId ? 'review' : 'missing')
      : (objectCommand.modelId ? 'matched' : 'missing'),
  }));
  return [...characters, ...objects];
}

function hasResolvedModelMetadata(sceneCommand) {
  if (!sceneCommand) return false;
  const hasCharacterModels = (sceneCommand.characters || []).some((charCmd) => charCmd.modelId || charCmd.modelUrl);
  const hasObjectModels = (sceneCommand.objects || []).some((objCmd) => objCmd.modelId || objCmd.modelUrl);
  return hasCharacterModels || hasObjectModels;
}

/**
 * Hook that converts the current scene + game state into a SceneCommand.
 * Re-plans when the scene changes or critical state shifts (combat toggle).
 * Passes previous location type so the planner can choose transition styles.
 *
 * @param {object} scene - Current scene object
 * @returns {import('../../../services/sceneCommandSchema').SceneCommand|null}
 */
export function useSceneCommands(scene) {
  const { state, dispatch } = useGame();
  const prevCmdRef = useRef(null);
  const prevLocationTypeRef = useRef(null);
  const persistedRef = useRef(new Set());
  const assignmentRef = useRef(new Set());
  const wantedRef = useRef(new Set());
  const combatSnapshotRef = useRef(null);
  const [catalogVersion, setCatalogVersion] = useState(() => getModelCatalogVersion());

  const combatActive = state.combat?.active || false;
  const combatChanged = combatActive !== combatSnapshotRef.current;

  useEffect(() => {
    const unsubscribe = subscribeModelCatalogVersion(setCatalogVersion);
    refreshModelCatalog();
    return unsubscribe;
  }, []);

  const planResult = useMemo(() => {
    if (!scene) return null;

    const sceneCatalogVersion = scene.sceneCommand?.catalogVersion || 0;
    if (
      scene.sceneCommand &&
      !combatChanged &&
      hasResolvedModelMetadata(scene.sceneCommand) &&
      sceneCatalogVersion === catalogVersion
    ) {
      return {
        sceneCommand: scene.sceneCommand,
        modelAssignments: { playerModel: null, partyModels: [], npcModels: [] },
        wantedEntries: buildWantedEntriesFromCommand(scene, scene.sceneCommand),
      };
    }

    const options = {
      prevLocationType: prevLocationTypeRef.current,
    };

    return planScene(scene, state, {
      ...options,
      catalogVersion,
    });
  }, [
    scene?.id,
    scene?.sceneCommand,
    scene?.sceneCommand?.catalogVersion,
    scene?.atmosphere?.mood,
    scene?.atmosphere?.weather,
    scene?.dialogueSegments?.length,
    scene?.stateChanges,
    state.world?.currentLocation,
    state.world?.timeState?.timeOfDay,
    state.world?.timeState?.hour,
    state.world?.weather?.type,
    combatActive,
    state.combat?.round,
    state.character?.name,
    state.character?.species,
    state.character?.career?.name,
    state.character?.model3d?.modelId,
    state.party,
    state.world?.npcs,
    catalogVersion,
  ]);

  const cmd = planResult?.sceneCommand || null;

  useEffect(() => {
    combatSnapshotRef.current = combatActive;
  }, [combatActive]);

  useEffect(() => {
    if (cmd) {
      prevLocationTypeRef.current = cmd.environment?.type || null;
    }
  }, [cmd]);

  useEffect(() => {
    const persistKey = scene?.id ? `${scene.id}:${catalogVersion}` : null;
    if (cmd && persistKey && !persistedRef.current.has(persistKey)) {
      persistedRef.current.add(persistKey);
      dispatch({
        type: 'UPDATE_SCENE_COMMAND',
        payload: { sceneId: scene.id, sceneCommand: cmd },
      });
    }
  }, [cmd, scene?.id, dispatch]);

  useEffect(() => {
    if (!scene?.id || !planResult) return;
    const assignments = planResult.modelAssignments;
    const hasAssignments = !!assignments?.playerModel
      || (assignments?.partyModels?.length || 0) > 0
      || (assignments?.npcModels?.length || 0) > 0;
    if (!hasAssignments || assignmentRef.current.has(scene.id)) return;
    assignmentRef.current.add(scene.id);
    dispatch({
      type: 'UPSERT_3D_MODEL_ASSIGNMENTS',
      payload: assignments,
    });
  }, [scene?.id, planResult, dispatch]);

  useEffect(() => {
    if (!scene?.id || !planResult?.wantedEntries?.length) return;
    if (wantedRef.current.has(scene.id)) return;
    wantedRef.current.add(scene.id);
    const campaignId = state.campaign?.id || state.campaign?.backendId || null;
    reportWanted3dEntries(planResult.wantedEntries, campaignId);
  }, [scene?.id, planResult, state.campaign?.id, state.campaign?.backendId]);

  if (cmd && cmd !== prevCmdRef.current) {
    prevCmdRef.current = cmd;
  }

  return prevCmdRef.current;
}
