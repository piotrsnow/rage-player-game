// Assembled `storage` facade. Existing call sites import this module as
// `import { storage } from '../services/storage'` (via the barrel at
// ../storage.js) and call `storage.methodX()` — the split keeps that
// surface stable.
//
// Internally each method is a free function in a topic module. The
// facade object just ties them together so callers don't have to learn
// a new import pattern.

import { getCampaigns, loadCampaign, deleteCampaign } from './campaignLoad.js';
import { saveCampaign } from './campaignSave.js';
import { markSceneSavedRemotely } from './campaignParse.js';
import {
  saveLocalSnapshot,
  loadLocalSnapshot,
  clearLocalSnapshot,
} from './localSnapshot.js';
import { getActiveCampaignId, setActiveCampaignId } from './activeCampaign.js';
import {
  getSettings,
  saveSettings,
  getLastCharacterName,
  saveLastCharacterName,
  getSettingsFromAccount,
  saveSettingsToAccount,
} from './settings.js';
import {
  getCharacters,
  getCharactersAsync,
  saveCharacter,
  deleteCharacter,
  loadCharacter,
  patchCharacterStateChanges,
  findMatchingLibraryCharacter,
  libraryCharacterDiffers,
} from './characters.js';
import {
  migrateLocalCampaignsToBackend,
  migrateLocalDataToAccount,
} from './migrations.js';
import { exportConfig, importConfig } from './importExport.js';

export const storage = {
  // Campaign list + load + delete
  getCampaigns,
  loadCampaign,
  deleteCampaign,
  // Campaign save
  saveCampaign,
  markSceneSavedRemotely,
  // Local snapshot
  saveLocalSnapshot,
  loadLocalSnapshot,
  clearLocalSnapshot,
  // Active campaign pointer
  getActiveCampaignId,
  setActiveCampaignId,
  // Settings
  getSettings,
  saveSettings,
  getLastCharacterName,
  saveLastCharacterName,
  getSettingsFromAccount,
  saveSettingsToAccount,
  // Characters
  getCharacters,
  getCharactersAsync,
  saveCharacter,
  deleteCharacter,
  loadCharacter,
  patchCharacterStateChanges,
  findMatchingLibraryCharacter,
  libraryCharacterDiffers,
  // Migrations
  migrateLocalCampaignsToBackend,
  migrateLocalDataToAccount,
  // Config export/import
  exportConfig,
  importConfig,
};
