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
  xtts: { configured: false },
};

const LOCAL_ONLY_KEYS = ['backendUrl', 'useBackend', 'appZoom'];

function inferWeight(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('thin')) return 100;
  if (lower.includes('extralight')) return 200;
  if (lower.includes('light')) return 300;
  if (lower.includes('medium')) return 500;
  if (lower.includes('semibold')) return 600;
  if (lower.includes('extrabold')) return 800;
  if (lower.includes('black')) return 900;
  if (lower.includes('bold')) return 700;
  return 400;
}

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
  // Voice pools moved to global ServerSettings — strip per-user leftovers.
  delete merged.narratorVoiceId;
  delete merged.narratorVoiceName;
  delete merged.maleVoices;
  delete merged.femaleVoices;
  delete merged.voicesByProvider;

  // Migrate old abstract tier IDs to 'none'. The new SceneCost uses actual
  // provider IDs ('elevenlabs', 'xtts', 'dalle', 'gpt-image', etc.).
  const KNOWN_TTS = ['none', 'elevenlabs', 'xtts'];
  const KNOWN_IMG = ['none', 'dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'];
  if (merged.sceneTtsTier && !KNOWN_TTS.includes(merged.sceneTtsTier)) {
    merged.sceneTtsTier = 'none';
  }
  if (merged.sceneImageTier && !KNOWN_IMG.includes(merged.sceneImageTier)) {
    merged.sceneImageTier = 'none';
  }

  return merged;
}

function shouldCheckBackendSession(settings) {
  // On mount, if backend is configured, we always kick off a bootstrap refresh
  // attempt against the httpOnly cookie — surface the spinner until it resolves.
  return Boolean(settings?.backendUrl && settings?.useBackend);
}

const defaultSettings = {
  appZoom: 100,
  aiProvider: 'openai',
  sceneVisualization: 'image',
  imageProvider: 'dalle',
  sdWebuiModel: '',
  // null = random seed per request; number = fixed (reproducible, cacheable).
  // Toggled from SdWebuiModelPicker via double-click on the seed field.
  sdWebuiSeed: null,
  imagePromptLlmEnabled: false,
  imagePromptLlmProvider: 'openai',
  imagePromptLlmModel: '',
  imagePromptCustomStyleEnabled: false,
  imagePromptCustomStyle: '',
  language: 'pl',
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
  ttsProvider: 'elevenlabs',
  sceneTtsTier: 'none',
  sceneImageTier: 'none',
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
    // Settings now live on the user account. The only thing we still read
    // from localStorage at boot is the tiny `backendUrl`/`useBackend` pair —
    // without them we wouldn't know where to ask for the rest.
    const localOnly = storage.readLocalOnlySettings();
    return mergeSettingsWithDefaults(localOnly);
  });

  const [backendKeys, setBackendKeys] = useState(EMPTY_BACKEND_KEYS);
  const [globalVoiceConfig, setGlobalVoiceConfig] = useState({});
  const [sceneModelConfig, setSceneModelConfig] = useState({});
  const [taskModelConfig, setTaskModelConfig] = useState({ models: {}, defaults: {} });
  const [fontConfig, setFontConfig] = useState(null);
  const [backendUser, setBackendUser] = useState(null);
  const [backendAuthChecking, setBackendAuthChecking] = useState(() => shouldCheckBackendSession(settings));
  const syncingFromBackendRef = useRef(false);
  const saveTimerRef = useRef(null);
  // `loadFromAccount` is defined further down (depends on `fetchBackendKeys`).
  // The effect that wants to invoke it on `backendUser` change runs earlier in
  // the file, so we forward through a ref to dodge the temporal-dead-zone.
  const loadFromAccountRef = useRef(null);

  // Mirror only the server-coordinates + device-local prefs so a refresh
  // remembers which backend to talk to and the UI zoom level.
  useEffect(() => {
    storage.writeLocalOnlySettings({
      backendUrl: settings.backendUrl,
      useBackend: settings.useBackend,
      appZoom: settings.appZoom,
    });
  }, [settings.backendUrl, settings.useBackend, settings.appZoom]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (syncingFromBackendRef.current) return;
    if (backendAuthChecking) return;
    if (!apiClient.isConnected()) return;

    saveTimerRef.current = setTimeout(() => {
      storage.saveSettingsToAccount(settings);
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings, backendAuthChecking]);

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
            // backendAuthChecking stays true — loadFromAccount will clear it
            // once account settings have been merged into React state.
          } else {
            setBackendAuthChecking(false);
          }
        } catch {
          /* refresh cookie missing/expired — user logged out */
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

  const fetchGlobalVoiceConfig = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setGlobalVoiceConfig({});
      return;
    }
    try {
      const config = await apiClient.get('/voice-settings');
      setGlobalVoiceConfig(config || {});
    } catch {
      setGlobalVoiceConfig({});
    }
  }, []);

  const updateGlobalVoiceConfig = useCallback(async (provider, data) => {
    const result = await apiClient.put('/voice-settings', { provider, ...data });
    setGlobalVoiceConfig(result || {});
    return result;
  }, []);

  const fetchSceneModelConfig = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setSceneModelConfig({});
      return;
    }
    try {
      const config = await apiClient.get('/scene-model-config');
      setSceneModelConfig(config || {});
    } catch {
      setSceneModelConfig({});
    }
  }, []);

  const updateSceneModelConfig = useCallback(async (patch) => {
    const result = await apiClient.put('/scene-model-config', patch);
    setSceneModelConfig(result || {});
    return result;
  }, []);

  const fetchTaskModelConfig = useCallback(async () => {
    if (!apiClient.isConnected()) {
      setTaskModelConfig({ models: {}, defaults: {} });
      return;
    }
    try {
      const config = await apiClient.get('/ai/model-config');
      setTaskModelConfig(config || { models: {}, defaults: {} });
    } catch {
      setTaskModelConfig({ models: {}, defaults: {} });
    }
  }, []);

  const resolveTaskModel = useCallback((taskCategory) => {
    const provider = settings.aiProvider || 'openai';
    const override = taskModelConfig.models?.[taskCategory]?.[provider];
    if (override) return override;
    const tierMap = {
      sceneGeneration: 'premium',
      campaignGeneration: 'premium',
      intentClassification: 'nano',
      memoryExtraction: 'nanoReasoning',
      imagePrompt: 'nano',
      auxiliary: 'standard',
    };
    const tier = tierMap[taskCategory] || 'premium';
    return taskModelConfig.defaults?.[tier]?.[provider] || null;
  }, [settings.aiProvider, taskModelConfig]);

  const fetchFontConfig = useCallback(async () => {
    if (!apiClient.isConnected()) return;
    try {
      const config = await apiClient.get('/font-config');
      setFontConfig(config || null);
    } catch {
      // silent — defaults from CSS :root remain active
    }
  }, []);

  function buildFontShadowCss(data) {
    if (!data.shadowColor || (!data.shadowBlur && !data.shadowX && !data.shadowY && !data.shadowSpread)) return 'none';
    const spread = data.shadowSpread || 0;
    const bx = data.shadowX ?? 0, by = data.shadowY ?? 0, blur = data.shadowBlur ?? 0;
    if (spread <= 0) return `${bx}px ${by}px ${blur}px ${data.shadowColor}`;
    const layers = [];
    const s = Math.ceil(spread);
    for (let dx = -s; dx <= s; dx++) {
      for (let dy = -s; dy <= s; dy++) {
        if (dx * dx + dy * dy > spread * spread) continue;
        layers.push(`${bx + dx}px ${by + dy}px ${blur}px ${data.shadowColor}`);
      }
    }
    return layers.join(', ');
  }

  useEffect(() => {
    if (!fontConfig) return;
    const FALLBACKS = { body: 'cursive', headline: 'cursive', accent: 'sans-serif', mono: 'monospace' };
    const root = document.documentElement;
    const style = document.getElementById('dynamic-fonts') || (() => {
      const el = document.createElement('style');
      el.id = 'dynamic-fonts';
      document.head.appendChild(el);
      return el;
    })();

    const faces = [];
    const fontNames = new Set();
    for (const [, data] of Object.entries(fontConfig)) {
      if (!data?.font || !data?.files?.length) continue;
      const familyName = data.font;
      fontNames.add(familyName);
      for (const file of data.files) {
        const weight = inferWeight(file);
        const isItalic = /cursive|italic/i.test(file);
        faces.push(
          `@font-face { font-family: '${familyName}'; src: url('/fonts/${familyName}/${file}') format('truetype'); font-weight: ${weight}; font-style: ${isItalic ? 'italic' : 'normal'}; font-display: swap; }`
        );
      }
    }
    style.textContent = faces.join('\n');

    const loadPromises = [...fontNames].map((name) =>
      document.fonts.load(`400 16px '${name}'`).catch(() => {})
    );

    Promise.all(loadPromises).then(() => {
      for (const [role, data] of Object.entries(fontConfig)) {
        if (!data?.font) continue;
        const fallback = FALLBACKS[role] || 'sans-serif';
        root.style.setProperty(`--font-${role}`, `'${data.font}', ${fallback}`);
        root.style.setProperty(`--font-${role}-color`, data.color || '');
        root.style.setProperty(`--font-${role}-size`, String(data.sizeMultiplier ?? 1));
        root.style.setProperty(`--font-${role}-letter-spacing`, data.letterSpacing ? `${data.letterSpacing}px` : 'normal');
        root.style.setProperty(`--font-${role}-stretch`, data.fontStretch && data.fontStretch !== 100 ? `${data.fontStretch}%` : 'normal');
        const shadow = buildFontShadowCss(data);
        root.style.setProperty(`--font-${role}-shadow`, shadow);
        const outline = (data.outlineWidth > 0 && data.outlineColor)
          ? `${data.outlineWidth}px ${data.outlineColor}`
          : '0';
        root.style.setProperty(`--font-${role}-outline`, outline);
      }
    });
  }, [fontConfig]);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend && backendUser) {
      fetchBackendKeys();
      fetchGlobalVoiceConfig();
      fetchSceneModelConfig();
      fetchTaskModelConfig();
      fetchFontConfig();
      // Hydrate account settings whenever a user lands on this provider — on
      // cookie-bootstrap, login, and register. backendLogin/Register also
      // call this directly (after legacy migration); the duplicate is cheap
      // and idempotent thanks to `syncingFromBackendRef`.
      loadFromAccountRef.current?.();
      gameData.loadAll().catch((err) => console.warn('[settings] Game data preload failed:', err.message));
    }
  }, [settings.backendUrl, settings.useBackend, backendUser, fetchBackendKeys, fetchGlobalVoiceConfig, fetchSceneModelConfig, fetchTaskModelConfig, fetchFontConfig]);

  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
    document.documentElement.lang = settings.language || 'en';
  }, [settings.language, i18n]);

  useEffect(() => {
    const zoom = settings.appZoom ?? 100;
    document.documentElement.style.zoom = `${zoom}%`;
  }, [settings.appZoom]);

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
    try {
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
    } finally {
      setBackendAuthChecking(false);
    }
  }, [fetchBackendKeys]);

  useEffect(() => {
    loadFromAccountRef.current = loadFromAccount;
  }, [loadFromAccount]);

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

  // Derive the active TTS provider from sceneTtsTier (user's SceneCost pick).
  // Fall back to ttsProvider for backward compat / admin voice-config context.
  const KNOWN_TTS_PROVIDERS = ['elevenlabs', 'xtts'];
  const ttsFromTier = KNOWN_TTS_PROVIDERS.includes(settings.sceneTtsTier) ? settings.sceneTtsTier : null;
  const activeProvider = ttsFromTier || settings.ttsProvider || 'elevenlabs';
  const activeVoices = globalVoiceConfig[activeProvider] || {};
  const voicePools = {
    narratorVoiceId: activeVoices.narratorVoiceId || '',
    narratorVoiceName: activeVoices.narratorVoiceName || '',
    maleVoices: activeVoices.maleVoices || [],
    femaleVoices: activeVoices.femaleVoices || [],
  };

  const value = {
    settings,
    voicePools,
    updateSettings,
    updateDMSettings,
    updateAutoPlayerSettings,
    resetSettings,
    importSettings,
    getApiKey,
    hasApiKey,
    backendKeys,
    fetchBackendKeys,
    globalVoiceConfig,
    fetchGlobalVoiceConfig,
    updateGlobalVoiceConfig,
    sceneModelConfig,
    fetchSceneModelConfig,
    updateSceneModelConfig,
    resolveTaskModel,
    fetchTaskModelConfig,
    fontConfig,
    fetchFontConfig,
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
