import { useMemo, useRef, useEffect } from 'react';
import { useGame } from '../../../contexts/GameContext';
import { planScene } from '../../../services/scenePlanner';

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
  const combatSnapshotRef = useRef(null);

  const combatActive = state.combat?.active || false;
  const combatChanged = combatActive !== combatSnapshotRef.current;

  const cmd = useMemo(() => {
    if (!scene) return null;

    if (scene.sceneCommand && !combatChanged) {
      return scene.sceneCommand;
    }

    const options = {
      prevLocationType: prevLocationTypeRef.current,
    };

    return planScene(scene, state, options);
  }, [
    scene?.id,
    scene?.sceneCommand,
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
    state.party?.length,
  ]);

  useEffect(() => {
    combatSnapshotRef.current = combatActive;
  }, [combatActive]);

  useEffect(() => {
    if (cmd) {
      prevLocationTypeRef.current = cmd.environment?.type || null;
    }
  }, [cmd]);

  useEffect(() => {
    if (cmd && scene?.id && !persistedRef.current.has(scene.id)) {
      persistedRef.current.add(scene.id);
      dispatch({
        type: 'UPDATE_SCENE_COMMAND',
        payload: { sceneId: scene.id, sceneCommand: cmd },
      });
    }
  }, [cmd, scene?.id, dispatch]);

  if (cmd && cmd !== prevCmdRef.current) {
    prevCmdRef.current = cmd;
  }

  return prevCmdRef.current;
}
