import { useMemo, useRef, useEffect, useState } from 'react';
import { useGameSlice, useGameDispatch } from '../../../stores/gameSelectors';
import { getGameState } from '../../../stores/gameStore';
import { planScene, SCENE_PLANNER_VERSION } from '../../../services/scenePlanner';
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
  const dispatch = useGameDispatch();
  // Fine-grained subscriptions: planner consumes many slices, but we only want
  // to re-plan when these specific fields change. Full state snapshot is pulled
  // imperatively inside the memo via getGameState().
  const currentLocation = useGameSlice((s) => s.world?.currentLocation);
  const timeOfDay = useGameSlice((s) => s.world?.timeState?.timeOfDay);
  const hour = useGameSlice((s) => s.world?.timeState?.hour);
  const weatherType = useGameSlice((s) => s.world?.weather?.type);
  const combatActive = useGameSlice((s) => s.combat?.active || false);
  const combatRound = useGameSlice((s) => s.combat?.round);
  const charName = useGameSlice((s) => s.character?.name);
  const charSpecies = useGameSlice((s) => s.character?.species);
  const charCareerName = useGameSlice((s) => s.character?.career?.name);
  const charModelId = useGameSlice((s) => s.character?.model3d?.modelId);
  const party = useGameSlice((s) => s.party);
  const npcs = useGameSlice((s) => s.world?.npcs);
  const campaignId = useGameSlice((s) => s.campaign?.id);
  const campaignBackendId = useGameSlice((s) => s.campaign?.backendId);

  const prevCmdRef = useRef(null);
  const prevLocationTypeRef = useRef(null);
  const persistedRef = useRef(new Set());
  const assignmentRef = useRef(new Set());
  const wantedRef = useRef(new Set());
  const combatSnapshotRef = useRef(null);
  const [catalogVersion, setCatalogVersion] = useState(() => getModelCatalogVersion());

  const combatChanged = combatActive !== combatSnapshotRef.current;

  useEffect(() => {
    const unsubscribe = subscribeModelCatalogVersion(setCatalogVersion);
    refreshModelCatalog();
    return unsubscribe;
  }, []);

  const planResult = useMemo(() => {
    if (!scene) return null;

    const sceneCatalogVersion = scene.sceneCommand?.catalogVersion || 0;
    const scenePlannerVersion = scene.sceneCommand?.plannerVersion || 0;
    if (
      scene.sceneCommand &&
      !combatChanged &&
      hasResolvedModelMetadata(scene.sceneCommand) &&
      sceneCatalogVersion === catalogVersion &&
      scenePlannerVersion === SCENE_PLANNER_VERSION
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

    return planScene(scene, getGameState(), {
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
    currentLocation,
    timeOfDay,
    hour,
    weatherType,
    combatActive,
    combatRound,
    charName,
    charSpecies,
    charCareerName,
    charModelId,
    party,
    npcs,
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
    const persistKey = scene?.id ? `${scene.id}:${catalogVersion}:${SCENE_PLANNER_VERSION}` : null;
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
    const assignmentKey = `${scene.id}:${SCENE_PLANNER_VERSION}`;
    const assignments = planResult.modelAssignments;
    const hasAssignments = !!assignments?.playerModel
      || (assignments?.partyModels?.length || 0) > 0
      || (assignments?.npcModels?.length || 0) > 0;
    if (!hasAssignments || assignmentRef.current.has(assignmentKey)) return;
    assignmentRef.current.add(assignmentKey);
    dispatch({
      type: 'UPSERT_3D_MODEL_ASSIGNMENTS',
      payload: assignments,
    });
  }, [scene?.id, planResult, dispatch]);

  useEffect(() => {
    if (!scene?.id || !planResult?.wantedEntries?.length) return;
    const wantedKey = `${scene.id}:${SCENE_PLANNER_VERSION}`;
    if (wantedRef.current.has(wantedKey)) return;
    wantedRef.current.add(wantedKey);
    const cid = campaignId || campaignBackendId || null;
    reportWanted3dEntries(planResult.wantedEntries, cid);
  }, [scene?.id, planResult, campaignId, campaignBackendId]);

  if (cmd && cmd !== prevCmdRef.current) {
    prevCmdRef.current = cmd;
  }

  return prevCmdRef.current;
}
