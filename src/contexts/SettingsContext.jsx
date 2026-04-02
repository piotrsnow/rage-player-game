import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from '../services/storage';
import { apiClient } from '../services/apiClient';
import { gameData } from '../services/gameDataService';

const SettingsContext = createContext(null);

const EMPTY_BACKEND_KEYS = { openai: '', anthropic: '', elevenlabs: '', stability: '', gemini: '' };

const LOCAL_ONLY_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey', 'geminiApiKey', 'meshyApiKey',
];
const SHARED_VOICE_KEYS = ['elevenlabsVoiceId', 'elevenlabsVoiceName', 'characterVoices'];

function clampCombatCommentaryFrequency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(0, Math.min(5, Math.round(numeric)));
}

function normalizeDmSettings(dmSettings) {
  const contextDepthRaw = Number(dmSettings?.contextDepth ?? defaultSettings.dmSettings.contextDepth);
  const normalizedContextDepth = Number.isFinite(contextDepthRaw)
    ? Math.max(35, Math.min(100, Math.round(contextDepthRaw)))
    : defaultSettings.dmSettings.contextDepth;
  const promptProfile = ['starter', 'balanced', 'deep'].includes(dmSettings?.promptProfile)
    ? dmSettings.promptProfile
    : defaultSettings.dmSettings.promptProfile;
  return {
    ...defaultSettings.dmSettings,
    ...(dmSettings || {}),
    contextDepth: normalizedContextDepth,
    promptProfile,
    combatCommentaryFrequency: clampCombatCommentaryFrequency(
      dmSettings?.combatCommentaryFrequency ?? defaultSettings.dmSettings.combatCommentaryFrequency
    ),
  };
}

function mergeSettingsWithDefaults(source) {
  if (!source) return defaultSettings;

  const merged = { ...defaultSettings, ...source };
  merged.dmSettings = normalizeDmSettings(source.dmSettings);
  merged.autoPlayer = { ...defaultSettings.autoPlayer, ...(source.autoPlayer || {}) };

  if (source.imageGenEnabled !== undefined && source.sceneVisualization === undefined) {
    merged.sceneVisualization = source.imageGenEnabled ? 'image' : 'none';
  }

  delete merged.elevenlabsApiKey;
  delete merged.imageGenEnabled;
  return merged;
}

function sanitizeSharedVoiceSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const characterVoices = Array.isArray(source.characterVoices)
    ? source.characterVoices
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          voiceId: typeof entry.voiceId === 'string' ? entry.voiceId : '',
          voiceName: typeof entry.voiceName === 'string' ? entry.voiceName : '',
          gender: entry.gender === 'female' ? 'female' : 'male',
        }))
        .filter((entry) => entry.voiceId && entry.voiceName)
    : [];

  return {
    elevenlabsVoiceId: typeof source.elevenlabsVoiceId === 'string' ? source.elevenlabsVoiceId : '',
    elevenlabsVoiceName: typeof source.elevenlabsVoiceName === 'string' ? source.elevenlabsVoiceName : '',
    characterVoices,
  };
}

function extractSharedVoiceSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const subset = {};
  for (const key of SHARED_VOICE_KEYS) {
    if (source[key] !== undefined) {
      subset[key] = source[key];
    }
  }
  return sanitizeSharedVoiceSettings(subset);
}

function shouldCheckBackendSession(settings) {
  return Boolean(settings?.backendUrl && settings?.useBackend && apiClient.getToken());
}

const defaultSettings = {
  aiProvider: 'openai',
  openaiApiKey: '',
  anthropicApiKey: '',
  sceneVisualization: 'image',
  imageProvider: 'dalle',
  stabilityApiKey: '',
  geminiApiKey: '',
  language: 'pl',
  elevenlabsVoiceId: '',
  elevenlabsVoiceName: '',
  characterVoices: [],
  narratorEnabled: false,
  narratorAutoPlay: true,
  dialogueSpeed: 100,
  canvasEffectsEnabled: true,
  effectIntensity: 'medium',
  sfxEnabled: true,
  sfxVolume: 70,
  musicVolume: 40,
  localMusicEnabled: true,
  needsSystemEnabled: false,
  backendUrl: 'http://localhost:3001',
  useBackend: false,
  localLLMEnabled: false,
  localLLMEndpoint: 'http://localhost:11434',
  localLLMModel: '',
  localLLMReducedPrompt: true,
  aiModelTier: 'premium',
  aiModel: '',
  meshyApiKey: '',
  meshyEnabled: false,
  autoPlayer: {
    enabled: false,
    style: 'balanced',
    delay: 3000,
    verbosity: 'medium',
    customInstructions: '',
    maxTurns: 0,
    model: '',
    decisionVariety: true,
  },
  dmSettings: {
    narrativeStyle: 50,
    responseLength: 50,
    difficulty: 50,
    testsFrequency: 50,
    combatCommentaryFrequency: 3,
    freedom: 50,
    narratorPoeticism: 50,
    narratorGrittiness: 30,
    narratorDetail: 50,
    narratorHumor: 20,
    narratorDrama: 50,
    narratorCustomInstructions: '',
    imageStyle: 'painting',
    darkPalette: false,
    contextDepth: 100,
    promptProfile: 'balanced',
  },
};

export function SettingsProvider({ children }) {
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState(() => {
    const saved = storage.getSettings();
    return mergeSettingsWithDefaults(saved);
  });

  const [backendKeys, setBackendKeys] = useState(EMPTY_BACKEND_KEYS);
  const [backendUser, setBackendUser] = useState(null);
  const [backendAuthChecking, setBackendAuthChecking] = useState(() => shouldCheckBackendSession(settings));
  const syncingFromBackendRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (syncingFromBackendRef.current) return;
    if (!apiClient.isConnected()) return;

    saveTimerRef.current = setTimeout(() => {
      storage.saveSettingsToAccount(settings);
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings]);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend) {
      apiClient.configure({ baseUrl: settings.backendUrl });
    } else {
      apiClient.configure({ baseUrl: '', token: '' });
      setBackendUser(null);
      setBackendKeys(EMPTY_BACKEND_KEYS);
      setBackendAuthChecking(false);
    }
  }, [settings.backendUrl, settings.useBackend]);

  useEffect(() => {
    if (!settings.backendUrl || !settings.useBackend) return;
    if (backendUser) {
      setBackendAuthChecking(false);
      return;
    }
    setBackendAuthChecking(shouldCheckBackendSession(settings));
  }, [settings, backendUser]);

  const fetchBackendKeys = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setBackendKeys(EMPTY_BACKEND_KEYS);
      return;
    }
    try {
      const keys = await apiClient.get('/auth/api-keys');
      setBackendKeys({ ...EMPTY_BACKEND_KEYS, ...keys });
    } catch {
      setBackendKeys(EMPTY_BACKEND_KEYS);
    }
  }, []);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend) {
      const timer = setTimeout(() => {
        if (apiClient.isConnected()) {
          fetchBackendKeys();
          gameData.loadAll().catch((err) => console.warn('[settings] Game data preload failed:', err.message));
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [settings.backendUrl, settings.useBackend, fetchBackendKeys]);

  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
    document.documentElement.lang = settings.language || 'en';
  }, [settings.language, i18n]);

  const loadBackendUser = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setBackendUser(null);
      setBackendAuthChecking(false);
      return null;
    }
    setBackendAuthChecking(true);
    try {
      const user = await apiClient.get('/auth/me');
      setBackendUser(user);
      return user;
    } catch {
      setBackendUser(null);
      return null;
    } finally {
      setBackendAuthChecking(false);
    }
  }, []);

  const loadSharedVoiceSettings = useCallback(async () => {
    if (!apiClient.isConnected()) return null;
    try {
      const voiceSettings = sanitizeSharedVoiceSettings(await apiClient.get('/auth/shared-voices'));
      syncingFromBackendRef.current = true;
      setSettings((prev) => ({ ...prev, ...voiceSettings }));
      setTimeout(() => { syncingFromBackendRef.current = false; }, 200);
      return voiceSettings;
    } catch (err) {
      console.warn('[SettingsContext] Failed to load shared voice settings:', err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend && apiClient.isConnected()) {
      loadBackendUser();
      loadSharedVoiceSettings();
    }
  }, [settings.backendUrl, settings.useBackend, loadBackendUser, loadSharedVoiceSettings]);

  const loadFromAccount = useCallback(async () => {
    const accountSettings = await storage.getSettingsFromAccount();
    if (!accountSettings || Object.keys(accountSettings).length === 0) return;

    syncingFromBackendRef.current = true;
    setSettings((prev) => {
      const merged = mergeSettingsWithDefaults(accountSettings);
      for (const key of LOCAL_ONLY_KEYS) {
        if (prev[key] !== undefined && prev[key] !== '') {
          merged[key] = prev[key];
        }
      }
      return merged;
    });
    setTimeout(() => { syncingFromBackendRef.current = false; }, 200);

    fetchBackendKeys();
    await loadSharedVoiceSettings();

    storage.migrateLocalCampaignsToBackend().catch((err) => {
      console.warn('[SettingsContext] Campaign migration failed:', err.message);
    });
  }, [fetchBackendKeys, loadSharedVoiceSettings]);

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateSharedVoiceSettings = useCallback(async (updates) => {
    let nextVoiceSettings = null;

    setSettings((prev) => {
      const next = { ...prev, ...updates };
      nextVoiceSettings = extractSharedVoiceSettings(next);
      return next;
    });

    if (!apiClient.isConnected()) {
      return true;
    }

    try {
      await apiClient.put('/auth/shared-voices', nextVoiceSettings);
      return true;
    } catch (err) {
      console.warn('[SettingsContext] Failed to save shared voice settings:', err.message);
      return false;
    }
  }, []);

  const updateDMSettings = useCallback((updates) => {
    setSettings((prev) => ({
      ...prev,
      dmSettings: normalizeDmSettings({ ...prev.dmSettings, ...updates }),
    }));
  }, []);

  const updateAutoPlayerSettings = useCallback((updates) => {
    setSettings((prev) => ({
      ...prev,
      autoPlayer: { ...prev.autoPlayer, ...updates },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  const importSettings = useCallback((imported) => {
    setSettings(mergeSettingsWithDefaults(imported));
  }, []);

  const getApiKey = useCallback(() => {
    if (!apiClient.isConnected()) return '';
    const provider = settings.aiProvider === 'openai' ? 'openai' : 'anthropic';
    return backendKeys[provider] ? '__server_managed__' : '';
  }, [settings.aiProvider, backendKeys]);

  const hasApiKey = useCallback((provider) => {
    return apiClient.isConnected() && !!backendKeys[provider];
  }, [backendKeys]);

  const backendLogin = useCallback(async (url, email, password) => {
    apiClient.configure({ baseUrl: url });
    const data = await apiClient.login(email, password);
    setSettings((prev) => ({ ...prev, backendUrl: url, useBackend: true }));
    setBackendUser(data.user);
    setBackendAuthChecking(false);
    await storage.migrateLocalDataToAccount(data.user.id);
    await loadFromAccount();
    return data;
  }, [loadFromAccount]);

  const backendRegister = useCallback(async (url, email, password) => {
    apiClient.configure({ baseUrl: url });
    const data = await apiClient.register(email, password);
    setSettings((prev) => ({ ...prev, backendUrl: url, useBackend: true }));
    setBackendUser(data.user);
    setBackendAuthChecking(false);
    await storage.migrateLocalDataToAccount(data.user.id);
    await loadFromAccount();
    return data;
  }, [loadFromAccount]);

  const backendLogout = useCallback(() => {
    apiClient.logout();
    setSettings((prev) => ({ ...prev, useBackend: false }));
    setBackendUser(null);
    setBackendAuthChecking(false);
  }, []);

  const value = {
    settings,
    updateSettings,
    updateSharedVoiceSettings,
    updateDMSettings,
    updateAutoPlayerSettings,
    resetSettings,
    importSettings,
    getApiKey,
    hasApiKey,
    backendKeys,
    fetchBackendKeys,
    loadFromAccount,
    backendUser,
    backendAuthChecking,
    loadBackendUser,
    backendLogin,
    backendRegister,
    backendLogout,
  };

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
