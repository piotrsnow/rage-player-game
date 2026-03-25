import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from '../services/storage';
import { apiClient } from '../services/apiClient';

const SettingsContext = createContext(null);

const EMPTY_BACKEND_KEYS = { openai: '', anthropic: '', elevenlabs: '', stability: '', gemini: '' };

const LOCAL_KEY_MAP = {
  openai: 'openaiApiKey',
  anthropic: 'anthropicApiKey',
  elevenlabs: 'elevenlabsApiKey',
  stability: 'stabilityApiKey',
  gemini: 'geminiApiKey',
};

const LOCAL_ONLY_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey', 'elevenlabsApiKey', 'geminiApiKey', 'meshyApiKey',
];

const defaultSettings = {
  aiProvider: 'openai',
  openaiApiKey: '',
  anthropicApiKey: '',
  sceneVisualization: 'image',
  imageProvider: 'dalle',
  stabilityApiKey: '',
  geminiApiKey: '',
  language: 'pl',
  elevenlabsApiKey: '',
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
  },
  dmSettings: {
    narrativeStyle: 50,
    responseLength: 50,
    difficulty: 50,
    testsFrequency: 50,
    freedom: 50,
    narratorPoeticism: 50,
    narratorGrittiness: 30,
    narratorDetail: 50,
    narratorHumor: 20,
    narratorDrama: 50,
    imageStyle: 'painting',
  },
};

export function SettingsProvider({ children }) {
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState(() => {
    const saved = storage.getSettings();
    if (!saved) return defaultSettings;
    const merged = { ...defaultSettings, ...saved };
    if (saved.imageGenEnabled !== undefined && saved.sceneVisualization === undefined) {
      merged.sceneVisualization = saved.imageGenEnabled ? 'image' : 'none';
    }
    delete merged.imageGenEnabled;
    return merged;
  });

  const [backendKeys, setBackendKeys] = useState(EMPTY_BACKEND_KEYS);
  const [backendUser, setBackendUser] = useState(null);
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
    }
  }, [settings.backendUrl, settings.useBackend]);

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
    if (!apiClient.isConnected()) return;
    try {
      const user = await apiClient.get('/auth/me');
      setBackendUser(user);
    } catch {
      setBackendUser(null);
    }
  }, []);

  useEffect(() => {
    if (settings.backendUrl && settings.useBackend && apiClient.isConnected()) {
      loadBackendUser();
    }
  }, [settings.backendUrl, settings.useBackend, loadBackendUser]);

  const loadFromAccount = useCallback(async () => {
    const accountSettings = await storage.getSettingsFromAccount();
    if (!accountSettings || Object.keys(accountSettings).length === 0) return;

    syncingFromBackendRef.current = true;
    setSettings((prev) => {
      const merged = { ...defaultSettings, ...accountSettings };
      if (accountSettings.dmSettings) {
        merged.dmSettings = { ...defaultSettings.dmSettings, ...accountSettings.dmSettings };
      }
      if (accountSettings.autoPlayer) {
        merged.autoPlayer = { ...defaultSettings.autoPlayer, ...accountSettings.autoPlayer };
      }
      for (const key of LOCAL_ONLY_KEYS) {
        if (prev[key] !== undefined && prev[key] !== '') {
          merged[key] = prev[key];
        }
      }
      return merged;
    });
    setTimeout(() => { syncingFromBackendRef.current = false; }, 200);

    fetchBackendKeys();

    storage.syncCampaigns().catch((err) => {
      console.warn('[SettingsContext] Campaign sync after login failed:', err.message);
    });
  }, [fetchBackendKeys]);

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateDMSettings = useCallback((updates) => {
    setSettings((prev) => ({
      ...prev,
      dmSettings: { ...prev.dmSettings, ...updates },
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
    setSettings({ ...defaultSettings, ...imported });
  }, []);

  const getApiKey = useCallback(() => {
    return settings.aiProvider === 'openai'
      ? settings.openaiApiKey
      : settings.anthropicApiKey;
  }, [settings]);

  const hasApiKey = useCallback((provider) => {
    const localField = LOCAL_KEY_MAP[provider];
    if (localField && settings[localField]) return true;
    return apiClient.isConnected() && !!backendKeys[provider];
  }, [settings, backendKeys]);

  const backendLogin = useCallback(async (url, email, password) => {
    apiClient.configure({ baseUrl: url });
    const data = await apiClient.login(email, password);
    setSettings((prev) => ({ ...prev, backendUrl: url, useBackend: true }));
    setBackendUser(data.user);
    await storage.migrateLocalDataToAccount(data.user.id);
    await loadFromAccount();
    return data;
  }, [loadFromAccount]);

  const backendRegister = useCallback(async (url, email, password) => {
    apiClient.configure({ baseUrl: url });
    const data = await apiClient.register(email, password);
    setSettings((prev) => ({ ...prev, backendUrl: url, useBackend: true }));
    setBackendUser(data.user);
    await storage.migrateLocalDataToAccount(data.user.id);
    await loadFromAccount();
    return data;
  }, [loadFromAccount]);

  const backendLogout = useCallback(() => {
    apiClient.logout();
    setSettings((prev) => ({ ...prev, useBackend: false }));
    setBackendUser(null);
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
