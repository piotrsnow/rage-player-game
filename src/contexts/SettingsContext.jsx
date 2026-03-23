import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from '../services/storage';
import { apiClient } from '../services/apiClient';

const SettingsContext = createContext(null);

const LOCAL_ONLY_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey', 'elevenlabsApiKey', 'sunoApiKey',
];

const defaultSettings = {
  aiProvider: 'openai',
  openaiApiKey: '',
  anthropicApiKey: '',
  imageGenEnabled: true,
  imageProvider: 'dalle',
  stabilityApiKey: '',
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
  sunoApiKey: '',
  musicEnabled: false,
  musicVolume: 40,
  sunoModel: 'V4_5',
  localMusicEnabled: true,
  needsSystemEnabled: false,
  backendUrl: 'http://localhost:3001',
  useBackend: false,
  localLLMEnabled: false,
  localLLMEndpoint: 'http://localhost:11434',
  localLLMModel: '',
  localLLMReducedPrompt: true,
  aiModelTier: 'premium',
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
  },
};

export function SettingsProvider({ children }) {
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState(() => {
    const saved = storage.getSettings();
    return saved ? { ...defaultSettings, ...saved } : defaultSettings;
  });

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

  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
    document.documentElement.lang = settings.language || 'en';
  }, [settings.language, i18n]);

  const loadFromAccount = useCallback(async () => {
    const accountSettings = await storage.getSettingsFromAccount();
    if (!accountSettings || Object.keys(accountSettings).length === 0) return;

    syncingFromBackendRef.current = true;
    setSettings((prev) => {
      const merged = { ...defaultSettings, ...accountSettings };
      if (accountSettings.dmSettings) {
        merged.dmSettings = { ...defaultSettings.dmSettings, ...accountSettings.dmSettings };
      }
      for (const key of LOCAL_ONLY_KEYS) {
        if (prev[key] !== undefined && prev[key] !== '') {
          merged[key] = prev[key];
        }
      }
      return merged;
    });
    setTimeout(() => { syncingFromBackendRef.current = false; }, 200);
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateDMSettings = useCallback((updates) => {
    setSettings((prev) => ({
      ...prev,
      dmSettings: { ...prev.dmSettings, ...updates },
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

  const value = {
    settings,
    updateSettings,
    updateDMSettings,
    resetSettings,
    importSettings,
    getApiKey,
    loadFromAccount,
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
