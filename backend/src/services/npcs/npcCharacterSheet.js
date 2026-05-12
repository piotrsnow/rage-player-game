/**
 * Re-export — canonical implementation lives in shared/domain for FE+BE parity.
 */
export {
  NPC_RACES,
  NPC_SHEET_ATTRIBUTE_KEYS,
  generateNpcSheet,
  mergeSheetOverride,
  npcStatsNeedsBaseline,
} from '../../../../shared/domain/npcCharacterSheet.js';
