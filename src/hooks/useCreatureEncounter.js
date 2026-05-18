import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { aiService } from '../services/ai';
import { rollD50 } from '../services/gameState.js';
import { devLog } from '../stores/devEventLogStore';

export function useCreatureEncounter({ generateScene } = {}) {
  const { t } = useTranslation();
  const { state } = useGame();
  const { settings } = useSettings();

  const [encounter, setEncounter] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fleeResult, setFleeResult] = useState(null);

  const dismiss = useCallback(() => {
    setEncounter(null);
    setIsLoading(false);
    setFleeResult(null);
  }, []);

  const submitEncounter = useCallback(async (campaignId, opts = {}) => {
    setIsLoading(true);
    try {
      const outcome = await aiService.creatureEncounterViaBackend(campaignId, {
        provider: settings.aiProvider,
        language: settings.language,
        dmSettings: settings.dmSettings,
        ...opts,
      });

      if (outcome.kind === 'complete') {
        setEncounter(outcome.data);
      } else {
        devLog.emit({
          category: 'system',
          type: 'creature_encounter_error',
          label: `Creature encounter error: ${outcome.message?.slice(0, 80)}`,
          severity: 'error',
          data: { code: outcome.code, message: outcome.message },
        });
      }
    } catch (err) {
      devLog.emit({
        category: 'system',
        type: 'creature_encounter_error',
        label: `Error: ${err.message?.slice(0, 80)}`,
        severity: 'error',
        data: { message: err.message },
      });
    } finally {
      setIsLoading(false);
    }
  }, [settings.aiProvider, settings.language, settings.dmSettings]);

  const respondToCreature = useCallback((action) => {
    const name = encounter?.creatureName;
    setEncounter(null);
    setFleeResult(null);
    if (typeof generateScene === 'function' && name) {
      generateScene(`[CREATURE_ENCOUNTER: ${name}] ${action}`);
    }
  }, [encounter?.creatureName, generateScene]);

  const fleeFromCreature = useCallback((character) => {
    if (!encounter) return { success: false };

    const zrecznosc = character.attributes?.zrecznosc || 1;
    const uniki = Array.isArray(character?.skills)
      ? (character.skills.find(s => s.name === 'Uniki')?.level || 0)
      : (character?.skills?.Uniki?.level || 0);
    const target = zrecznosc + uniki + encounter.fleePenalty;
    const roll = rollD50();

    let success;
    if (roll === 50) success = true;
    else if (roll === 1) success = false;
    else success = roll >= target;

    const margin = roll - target;
    const result = { success, roll, target, margin };
    setFleeResult(result);

    const name = encounter.creatureName;

    setTimeout(() => {
      setEncounter(null);
      setFleeResult(null);
      if (!success && typeof generateScene === 'function') {
        generateScene(`[CREATURE_FLEE_FAILED: ${name}, roll: ${roll} vs ${target}]`);
      }
    }, 2000);

    return { success };
  }, [encounter, generateScene]);

  return { encounter, isLoading, fleeResult, submitEncounter, respondToCreature, fleeFromCreature, dismiss };
}
