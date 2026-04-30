import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from '../services/storage';
import { apiClient } from '../services/apiClient';
import { gameData } from '../services/gameDataService';

const SettingsContext = (import.meta.hot?.data?.SettingsContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.SettingsContext = SettingsContext;

// `backendKeys[provider]` is an availability descriptor coming from
// GET /v1/auth/api-keys. Keys are env-only on the server now — the FE
// never stores or sends secrets; it just renders status.
const EMPTY_BACKEND_KEYS = {
  openai: { configured: false },
  anthropic: { configured: false },
  elevenlabs: { configured: false },
  stability: { configured: false },
  gemini: { configured: false },
  meshy: { configured: false },
  'sd-webui': { configured: false },
};

const LOCAL_ONLY_KEYS = ['backendUrl', 'useBackend'];

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

  // Legacy per-user API key fields are no longer supported — keys come
  // from server env only. Strip anything that might still live in old
  // saved-settings blobs so it doesn't leak into the FE state.
  delete merged.elevenlabsApiKey;
  delete merged.openaiApiKey;
  delete merged.anthropicApiKey;
  delete merged.stabilityApiKey;
  delete merged.geminiApiKey;
  delete merged.meshyApiKey;
  delete merged.imageGenEnabled;
  return merged;
}

function shouldCheckBackendSession(settings) {
  // On mount, if backend is configured, we always kick off a bootstrap refresh
  // attempt against the httpOnly cookie — surface the spinner until it resolves.
  return Boolean(settings?.backendUrl && settings?.useBackend);
}

const defaultSettings = {
  aiProvider: 'openai',
  sceneVisualization: 'image',
  imageProvider: 'dalle',
  sdWebuiModel: '',
  language: 'pl',
  narratorVoiceId: '',
  narratorVoiceName: '',
  maleVoices: [],
  femaleVoices: [],
  narratorEnabled: false,
  narratorAutoPlay: true,
  dialogueSpeed: 100,
  canvasEffectsEnabled: true,
  itemImagesEnabled: true,
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
    narratorSeriousness: 50,
    narratorCustomInstructions: '',
    imageStyle: 'painting',
    darkPalette: false,
    contextDepth: 100,
    promptProfile: 'balanced',
    llmPremiumTimeoutMs: 45000,
    llmNanoTimeoutMs: 15000,
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
      // /v1/auth holds the refresh token in an httpOnly cookie; on mount we
      // exchange it for a fresh access token + user payload before rendering
      // any authed UI. Silent failure just leaves the user logged out.
      let cancelled = false;
      setBackendAuthChecking(true);

      // Proactive refresh — access token lives 15 min; rotate every 12 min so
      // long-lived consumers that snapshot the token (SSE stream body, WS
      // upgrade URL, media <img src>?token=...) always see a fresh one.
      const REFRESH_INTERVAL_MS = 12 * 60 * 1000;
      const refreshTimer = setInterval(() => {
        if (!apiClient.isConnected()) return;
        apiClient.refreshAccessToken().catch(() => { /* 401 retry path handles it */ });
      }, REFRESH_INTERVAL_MS);

      (async () => {
        try {
          const data = await apiClient.bootstrapAuth();
          if (cancelled) return;
          if (data?.user) {
            setBackendUser(data.user);
          }
        } catch {
          /* refresh cookie missing/expired — user logged out */
        } finally {
          if (!cancelled) setBackendAuthChecking(false);
        }
      })();
      return () => {
        cancelled = true;
        clearInterval(refreshTimer);
      };
    }
    apiClient.configure({ baseUrl: '', token: '' });
    setBackendUser(null);
    setBackendKeys(EMPTY_BACKEND_KEYS);
    setBackendAuthChecking(false);
    return undefined;
  }, [settings.backendUrl, settings.useBackend]);

  const fetchBackendKeys = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setBackendKeys(EMPTY_BACKEND_KEYS);
      return;
    }
    try {
      const keys = await apiClient.get('/auth/api-keys');
      // Backend returns `{ provider: { configured, masked? } }`. Merge with
      // defaults so callers can safely read `backendKeys.foo.configured`
      // for any known provider without null-guarding.
      const normalized = { ...EMPTY_BACKEND_KEYS };
      for (const [provider, value] of Object.entries(keys || {})) {
        if (value && typeof value === 'object') {
          normalized[provider] = { configured: !!value.configured, masked: value.masked };
        }
      }
      setBackendKeys(normalized);
    } catch {
      setBackendKeys(EMPTY_BACKEND_KEYS);
    }
  }, []);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend && backendUser) {
      fetchBackendKeys();
      gameData.loadAll().catch((err) => console.warn('[settings] Game data preload failed:', err.message));
    }
  }, [settings.backendUrl, settings.useBackend, backendUser, fetchBackendKeys]);

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

    storage.migrateLocalCampaignsToBackend().catch((err) => {
      console.warn('[SettingsContext] Campaign migration failed:', err.message);
    });
  }, [fetchBackendKeys]);

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
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
    return backendKeys[provider]?.configured ? '__server_managed__' : '';
  }, [settings.aiProvider, backendKeys]);

  const hasApiKey = useCallback((provider) => {
    return apiClient.isConnected() && !!backendKeys[provider]?.configured;
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
