import { apiClient } from '../apiClient';
import { normalizeCharacterAge } from '../characterAge';
import { CHARACTERS_KEY } from './keys.js';

export function getCharacters() {
  try {
    const data = localStorage.getItem(CHARACTERS_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed)
      ? parsed.map((character) => ({
        ...character,
        age: normalizeCharacterAge(character?.age),
      }))
      : [];
  } catch {
    return [];
  }
}

async function findBackendCharacterByName(name) {
  if (!name || !apiClient.isConnected()) return null;
  try {
    const all = await apiClient.get('/characters');
    return all.find((c) => c.name === name) || null;
  } catch {
    return null;
  }
}

// Campaign loads can surface the same character twice (once from the
// backend `/characters` list, once from a still-cached local record after a
// rename). Dedup by case-insensitive name, keeping whichever row has the
// newer `updatedAt`.
function deduplicateCharacters(chars) {
  if (!Array.isArray(chars) || chars.length === 0) return chars;
  const seen = new Map();
  for (const ch of chars) {
    const key = (ch.name || '').trim().toLowerCase();
    if (!key) { seen.set(`__unnamed_${seen.size}`, ch); continue; }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, ch);
    } else {
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentTime = ch.updatedAt ? new Date(ch.updatedAt).getTime() : 0;
      if (currentTime > existingTime) {
        seen.set(key, ch);
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Match a character embedded in a loaded campaign to a library record. Tries
 * backendId → localId → case-insensitive name, so hosts and joined MP
 * guests both resolve the right character on reconnect.
 */
export function findMatchingLibraryCharacter(campaignChar, libraryChars) {
  if (!campaignChar || !Array.isArray(libraryChars) || libraryChars.length === 0) return null;
  if (campaignChar.backendId) {
    const byBackend = libraryChars.find((c) => c.backendId === campaignChar.backendId || c.id === campaignChar.backendId);
    if (byBackend) return byBackend;
  }
  if (campaignChar.localId) {
    const byLocal = libraryChars.find((c) => c.localId === campaignChar.localId);
    if (byLocal) return byLocal;
  }
  const name = (campaignChar.name || '').trim().toLowerCase();
  if (name) {
    const byName = libraryChars.find((c) => (c.name || '').trim().toLowerCase() === name);
    if (byName) return byName;
  }
  return null;
}

export async function getCharactersAsync() {
  let chars;
  if (apiClient.isConnected()) {
    try {
      chars = await apiClient.get('/characters');
    } catch (err) {
      console.warn('[storage] Backend getCharacters failed, falling back to local:', err.message);
      chars = getCharacters();
    }
  } else {
    chars = getCharacters();
  }
  return deduplicateCharacters(chars);
}

export async function saveCharacter(character) {
  if (apiClient.isConnected()) {
    try {
      const payload = {
        name: character.name,
        age: normalizeCharacterAge(character.age),
        gender: character.gender || '',
        species: character.species,
        // RPGon stats
        attributes: character.attributes || {},
        skills: character.skills || {},
        wounds: character.wounds ?? 0,
        maxWounds: character.maxWounds ?? 0,
        movement: character.movement ?? 4,
        characterLevel: character.characterLevel || 1,
        characterXp: character.characterXp || 0,
        attributePoints: character.attributePoints || 0,
        // Magic
        mana: character.mana || { current: 0, max: 0 },
        spells: character.spells || { known: [], usageCounts: {}, scrolls: [] },
        // Inventory & equipment
        inventory: character.inventory || [],
        materialBag: character.materialBag || [],
        money: character.money || { gold: 0, silver: 0, copper: 0 },
        equipped: character.equipped || { mainHand: null, offHand: null, armour: null },
        // Status & needs
        status: character.status || null,
        lockedCampaignId: character.lockedCampaignId || null,
        lockedCampaignName: character.lockedCampaignName || null,
        lockedLocation: character.lockedLocation || null,
        statuses: character.statuses || [],
        needs: character.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
        // Narrative
        backstory: character.backstory || '',
        customAttackPresets: character.customAttackPresets || [],
        // Presentation
        portraitUrl: character.portraitUrl || '',
        campaignCount: character.campaignCount || 0,
        voiceId: character.voiceId || '',
        voiceName: character.voiceName || '',
        // Legacy WFRP fields kept for the CharacterCreationModal back-compat
        careerData: character.career || character.careerData || {},
        characteristics: character.characteristics || {},
        advances: character.advances || {},
      };

      let saved;
      if (character.backendId) {
        saved = await apiClient.put(`/characters/${character.backendId}`, payload);
      } else {
        const existing = await findBackendCharacterByName(character.name);
        if (existing) {
          saved = await apiClient.put(`/characters/${existing.id}`, payload);
        } else {
          saved = await apiClient.post('/characters', payload);
        }
      }

      return {
        ...character,
        ...saved,
        age: normalizeCharacterAge(saved.age ?? character.age),
        backendId: saved.id,
        updatedAt: saved.updatedAt ? new Date(saved.updatedAt).getTime() : Date.now(),
      };
    } catch (err) {
      console.warn('[storage] Backend saveCharacter failed, falling back to local:', err.message);
    }
  }

  const characters = getCharacters();
  const localId = character.localId || character.backendId || `char_${Date.now()}`;
  character.localId = localId;
  const idx = characters.findIndex(
    (c) => c.localId === localId || (c.backendId && c.backendId === character.backendId),
  );
  const entry = { ...character, age: normalizeCharacterAge(character.age), updatedAt: Date.now() };
  if (idx >= 0) {
    characters[idx] = entry;
  } else {
    characters.unshift(entry);
  }
  try {
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters));
  } catch (e) {
    console.warn('[storage] Failed to save characters to localStorage:', e.message);
  }
  return entry;
}

export async function deleteCharacter(id) {
  if (apiClient.isConnected()) {
    try {
      await apiClient.del(`/characters/${id}`);
      return;
    } catch (err) {
      console.warn('[storage] Backend deleteCharacter failed, falling back to local:', err.message);
    }
  }

  const characters = getCharacters().filter(
    (c) => c.localId !== id && c.backendId !== id,
  );
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters));
}

export async function loadCharacter(id) {
  if (apiClient.isConnected()) {
    try {
      const char = await apiClient.get(`/characters/${id}`);
      return {
        ...char,
        age: normalizeCharacterAge(char.age),
        career: char.careerData,
        backendId: char.id,
      };
    } catch (err) {
      console.warn('[storage] Backend loadCharacter failed, falling back to local:', err.message);
    }
  }
  const characters = getCharacters();
  return characters.find((c) => c.localId === id || c.backendId === id) || null;
}

/**
 * Apply an AI/manual state-change delta directly to a Character record.
 * Backend-authoritative — returns the updated, deserialized Character snapshot.
 * Used for manual mutations (equip, advancement) that bypass the AI scene flow.
 */
export async function patchCharacterStateChanges(characterId, changes) {
  if (!characterId || !apiClient.isConnected()) return null;
  try {
    return await apiClient.patch(`/characters/${characterId}/state-changes`, changes);
  } catch (err) {
    console.warn('[storage] Character state-change PATCH failed:', err.message);
    return null;
  }
}
