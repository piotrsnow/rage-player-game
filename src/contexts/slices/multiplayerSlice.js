import { applyMultiplayerSceneStateChanges } from '../../../shared/domain/multiplayerState.js';

export function reduceMultiplayerSlice(state, action) {
  switch (action.type) {
    case 'LOAD_MULTIPLAYER_STATE': {
      const gs = action.payload;
      const myOdId = action.payload.myOdId || state.myOdId;
      const chars = gs.characters || state.characters;
      return {
        ...state,
        myOdId,
        campaign: gs.campaign || state.campaign,
        characters: chars,
        character: (myOdId && chars?.find((c) => c.odId === myOdId)) || chars?.[0] || state.character,
        world: gs.world || state.world,
        quests: gs.quests || state.quests,
        scenes: gs.scenes || state.scenes,
        chatHistory: gs.chatHistory || state.chatHistory,
      };
    }

    case 'MP_ADD_SCENE': {
      return {
        ...state,
        scenes: [...state.scenes, action.payload.scene],
        chatHistory: [...state.chatHistory, ...(action.payload.chatMessages || [])],
      };
    }

    case 'MP_APPLY_STATE_CHANGES': {
      const { stateChanges, myOdId: payloadOdId } = action.payload;
      const localOdId = payloadOdId || state.myOdId;
      const applied = applyMultiplayerSceneStateChanges(
        {
          campaign: state.campaign,
          characters: state.characters,
          world: state.world,
          quests: state.quests,
          scenes: state.scenes,
        },
        { stateChanges },
        { needsEnabled: false }
      );

      const nextCharacters = applied.characters || state.characters;
      return {
        ...state,
        campaign: applied.campaign || state.campaign,
        characters: nextCharacters,
        character: (localOdId && nextCharacters.find((c) => c.odId === localOdId)) || nextCharacters[0] || state.character,
        world: applied.world || state.world,
        quests: applied.quests || state.quests,
      };
    }

    default:
      return state;
  }
}
