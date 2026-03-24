import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { elevenlabsService } from '../../services/elevenlabs';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import { useModalA11y } from '../../hooks/useModalA11y';
import Slider from '../ui/Slider';
import Button from '../ui/Button';

const providerOptions = [
  { id: 'openai', icon: 'auto_awesome' },
  { id: 'anthropic', icon: 'psychology' },
];

export default function DMSettingsPage({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateDMSettings, resetSettings, importSettings, loadFromAccount } = useSettings();
  const [localKeys, setLocalKeys] = useState({
    openaiApiKey: settings.openaiApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    stabilityApiKey: settings.stabilityApiKey,
  });
  const [saved, setSaved] = useState(false);
  const [elevenlabsKey, setElevenlabsKey] = useState(settings.elevenlabsApiKey || '');
  const [sunoKey, setSunoKey] = useState(settings.sunoApiKey || '');
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [testingVoice, setTestingVoice] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const fileInputRef = useRef(null);

  const [backendUrl, setBackendUrl] = useState(settings.backendUrl || '');
  const [backendEmail, setBackendEmail] = useState('');
  const [backendPassword, setBackendPassword] = useState('');
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState(null);
  const [backendSuccess, setBackendSuccess] = useState(null);
  const [backendUser, setBackendUser] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);

  const loadBackendUser = useCallback(async () => {
    if (!apiClient.isConnected()) return;
    try {
      const user = await apiClient.get('/auth/me');
      setBackendUser(user);
    } catch {
      setBackendUser(null);
    }
  }, []);

  const loadCacheStats = useCallback(async () => {
    if (!apiClient.isConnected()) return;
    try {
      const stats = await apiClient.get('/media/stats/summary');
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  useEffect(() => {
    if (settings.useBackend && settings.backendUrl) {
      apiClient.configure({ baseUrl: settings.backendUrl });
      loadBackendUser();
      loadCacheStats();
      if (apiClient.isConnected()) {
        loadFromAccount();
      }
    }
  }, [settings.useBackend, settings.backendUrl, loadBackendUser, loadCacheStats, loadFromAccount]);

  const handleBackendLogin = async () => {
    setBackendLoading(true);
    setBackendError(null);
    setBackendSuccess(null);
    try {
      apiClient.configure({ baseUrl: backendUrl });
      const data = await apiClient.login(backendEmail, backendPassword);
      updateSettings({ backendUrl: backendUrl, useBackend: true });
      setBackendUser(data.user);
      setBackendSuccess(t('settings.backendLoginSuccess'));
      setBackendPassword('');
      loadCacheStats();
      await storage.migrateLocalDataToAccount(data.user.id);
      await loadFromAccount();
    } catch (err) {
      setBackendError(err.message);
    } finally {
      setBackendLoading(false);
    }
  };

  const handleBackendRegister = async () => {
    setBackendError(null);
    setBackendSuccess(null);
    if (backendPassword.length < 6) {
      setBackendError(t('settings.backendPasswordTooShort'));
      return;
    }
    setBackendLoading(true);
    try {
      apiClient.configure({ baseUrl: backendUrl });
      const data = await apiClient.register(backendEmail, backendPassword);
      updateSettings({ backendUrl: backendUrl, useBackend: true });
      setBackendUser(data.user);
      setBackendSuccess(t('settings.backendRegisterSuccess'));
      setBackendPassword('');
      await storage.migrateLocalDataToAccount(data.user.id);
      await loadFromAccount();
    } catch (err) {
      setBackendError(err.message);
    } finally {
      setBackendLoading(false);
    }
  };

  const handleBackendLogout = () => {
    apiClient.logout();
    updateSettings({ useBackend: false });
    setBackendUser(null);
    setCacheStats(null);
    setBackendSuccess(null);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleExportConfig = () => {
    storage.exportConfig();
  };

  const handleImportConfig = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await storage.importConfig(file);
      if (imported) {
        importSettings(imported);
        setLocalKeys({
          openaiApiKey: imported.openaiApiKey || '',
          anthropicApiKey: imported.anthropicApiKey || '',
          stabilityApiKey: imported.stabilityApiKey || '',
        });
        setElevenlabsKey(imported.elevenlabsApiKey || '');
        setSunoKey(imported.sunoApiKey || '');
      }
      setImportStatus('success');
    } catch {
      setImportStatus('error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(null), 3000);
  };

  useEffect(() => {
    setLocalKeys({
      openaiApiKey: settings.openaiApiKey,
      anthropicApiKey: settings.anthropicApiKey,
      stabilityApiKey: settings.stabilityApiKey,
    });
  }, [settings.openaiApiKey, settings.anthropicApiKey, settings.stabilityApiKey]);

  const handleApply = async () => {
    updateSettings({
      openaiApiKey: localKeys.openaiApiKey,
      anthropicApiKey: localKeys.anthropicApiKey,
      stabilityApiKey: localKeys.stabilityApiKey,
    });

    if (apiClient.isConnected()) {
      try {
        await apiClient.put('/auth/settings', {
          apiKeys: {
            openai: localKeys.openaiApiKey || '',
            anthropic: localKeys.anthropicApiKey || '',
            stability: localKeys.stabilityApiKey || '',
            elevenlabs: elevenlabsKey || '',
            suno: sunoKey || '',
          },
        });
      } catch {
        // local save still succeeds
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetSettings();
    setLocalKeys({ openaiApiKey: '', anthropicApiKey: '', stabilityApiKey: '' });
    setElevenlabsKey('');
    setSunoKey('');
    setVoices([]);
  };

  const handleLoadVoices = async () => {
    if (!elevenlabsKey.trim()) return;
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const voiceList = await elevenlabsService.getVoices(elevenlabsKey);
      setVoices(voiceList);
      updateSettings({ elevenlabsApiKey: elevenlabsKey });
    } catch (err) {
      setVoiceError(err.message);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSelectVoice = (voice) => {
    updateSettings({
      elevenlabsVoiceId: voice.voiceId,
      elevenlabsVoiceName: voice.name,
    });
  };

  const handleToggleCharacterVoice = (voice) => {
    const current = settings.characterVoices || [];
    const exists = current.some((v) => v.voiceId === voice.voiceId);
    if (exists) {
      updateSettings({ characterVoices: current.filter((v) => v.voiceId !== voice.voiceId) });
    } else {
      updateSettings({ characterVoices: [...current, { voiceId: voice.voiceId, voiceName: voice.name, gender: 'male' }] });
    }
  };

  const handleToggleVoiceGender = (voiceId) => {
    const current = settings.characterVoices || [];
    updateSettings({
      characterVoices: current.map((v) =>
        v.voiceId === voiceId
          ? { ...v, gender: v.gender === 'female' ? 'male' : 'female' }
          : v
      ),
    });
  };

  const getVoiceGender = (voiceId) => {
    const v = (settings.characterVoices || []).find((v) => v.voiceId === voiceId);
    return v?.gender || 'male';
  };

  const isInCharacterPool = (voiceId) => {
    return (settings.characterVoices || []).some((v) => v.voiceId === voiceId);
  };

  const handleTestVoice = async () => {
    const voiceId = settings.elevenlabsVoiceId;
    const apiKey = settings.elevenlabsApiKey;
    if (!voiceId || !apiKey) return;
    setTestingVoice(true);
    try {
      const audioUrl = await elevenlabsService.textToSpeechStream(
        apiKey,
        voiceId,
        settings.language === 'pl'
          ? 'Witaj, poszukiwaczu przygód. Jestem twoim Mistrzem Gry.'
          : 'Greetings, adventurer. I am your Dungeon Master.'
      );
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setTestingVoice(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setTestingVoice(false);
      };
      await audio.play();
    } catch {
      setTestingVoice(false);
    }
  };

  const difficultyLabel = settings.dmSettings.difficulty < 25 ? t('settings.difficultyLabels.easy') : settings.dmSettings.difficulty < 50 ? t('settings.difficultyLabels.normal') : settings.dmSettings.difficulty < 75 ? t('settings.difficultyLabels.hard') : t('settings.difficultyLabels.expert');
  const chaosLabel = settings.dmSettings.narrativeStyle < 25 ? t('settings.chaosLabels.stable') : settings.dmSettings.narrativeStyle < 50 ? t('settings.chaosLabels.balanced') : settings.dmSettings.narrativeStyle < 75 ? t('settings.chaosLabels.chaotic') : t('settings.chaosLabels.wild');
  const lengthLabel = settings.dmSettings.responseLength < 33 ? t('settings.lengthLabels.short') : settings.dmSettings.responseLength < 66 ? t('settings.lengthLabels.medium') : t('settings.lengthLabels.long');

  const poeticismLabel = (settings.dmSettings.narratorPoeticism ?? 50) < 25 ? t('settings.poeticismLabels.prosaic') : (settings.dmSettings.narratorPoeticism ?? 50) < 50 ? t('settings.poeticismLabels.literary') : (settings.dmSettings.narratorPoeticism ?? 50) < 75 ? t('settings.poeticismLabels.poetic') : t('settings.poeticismLabels.lyrical');
  const grittinessLabel = (settings.dmSettings.narratorGrittiness ?? 30) < 25 ? t('settings.grittinessLabels.light') : (settings.dmSettings.narratorGrittiness ?? 30) < 50 ? t('settings.grittinessLabels.grounded') : (settings.dmSettings.narratorGrittiness ?? 30) < 75 ? t('settings.grittinessLabels.gritty') : t('settings.grittinessLabels.brutal');
  const detailLevelLabel = (settings.dmSettings.narratorDetail ?? 50) < 25 ? t('settings.detailLabels.minimal') : (settings.dmSettings.narratorDetail ?? 50) < 50 ? t('settings.detailLabels.balanced') : (settings.dmSettings.narratorDetail ?? 50) < 75 ? t('settings.detailLabels.rich') : t('settings.detailLabels.lavish');
  const humorLabel = (settings.dmSettings.narratorHumor ?? 20) < 25 ? t('settings.humorLabels.serious') : (settings.dmSettings.narratorHumor ?? 20) < 50 ? t('settings.humorLabels.dry') : (settings.dmSettings.narratorHumor ?? 20) < 75 ? t('settings.humorLabels.witty') : t('settings.humorLabels.absurd');
  const dramaLabel = (settings.dmSettings.narratorDrama ?? 50) < 25 ? t('settings.dramaLabels.subtle') : (settings.dmSettings.narratorDrama ?? 50) < 50 ? t('settings.dramaLabels.measured') : (settings.dmSettings.narratorDrama ?? 50) < 75 ? t('settings.dramaLabels.heightened') : t('settings.dramaLabels.theatrical');

  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('settings.title')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-7xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">settings</span>
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
      <header className="mb-12 animate-fade-in">
        <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
          {t('settings.subtitle')}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Sliders */}
        <section className="lg:col-span-2 space-y-6 animate-fade-in">
          {/* Language Switcher */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">translate</span>
              {t('settings.language')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-4">{t('settings.languageDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => updateSettings({ language: 'pl' })}
                className={`flex items-center gap-2 px-5 py-3 rounded-sm border transition-all ${
                  settings.language === 'pl'
                    ? 'bg-surface-tint/10 border-primary/30 text-primary'
                    : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                <span className="text-lg">🇵🇱</span>
                <span className="font-headline text-sm">Polski</span>
              </button>
              <button
                onClick={() => updateSettings({ language: 'en' })}
                className={`flex items-center gap-2 px-5 py-3 rounded-sm border transition-all ${
                  settings.language === 'en'
                    ? 'bg-surface-tint/10 border-primary/30 text-primary'
                    : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                <span className="text-lg">🇬🇧</span>
                <span className="font-headline text-sm">English</span>
              </button>
            </div>
          </div>

          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
            <h2 className="font-headline text-xl text-tertiary mb-8 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">vital_signs</span>
              {t('settings.narrativeAnchors')}
            </h2>

            <Slider
              label={t('settings.storyChaos')}
              description={t('settings.storyChaosDesc')}
              value={settings.dmSettings.narrativeStyle}
              onChange={(v) => updateDMSettings({ narrativeStyle: v })}
              displayValue={`${settings.dmSettings.narrativeStyle}% — ${chaosLabel}`}
            />

            <Slider
              label={t('settings.responseLength')}
              description={t('settings.responseLengthDesc')}
              value={settings.dmSettings.responseLength}
              onChange={(v) => updateDMSettings({ responseLength: v })}
              displayValue={lengthLabel}
            />

            <Slider
              label={t('settings.difficulty')}
              description={t('settings.difficultyDesc')}
              value={settings.dmSettings.difficulty}
              onChange={(v) => updateDMSettings({ difficulty: v })}
              displayValue={difficultyLabel}
            />

            <Slider
              label={t('settings.skillChecks')}
              description={t('settings.skillChecksDesc')}
              value={settings.dmSettings.testsFrequency}
              onChange={(v) => updateDMSettings({ testsFrequency: v })}
              displayValue={`${settings.dmSettings.testsFrequency}%`}
            />

            <Slider
              label={t('settings.playerFreedom')}
              description={t('settings.playerFreedomDesc')}
              value={settings.dmSettings.freedom}
              onChange={(v) => updateDMSettings({ freedom: v })}
              displayValue={`${settings.dmSettings.freedom}%`}
            />
          </div>

          {/* Narrator Style */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">stylus_note</span>
              {t('settings.narratorStyle')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-8">{t('settings.narratorStyleDesc')}</p>

            <Slider
              label={t('settings.poeticism')}
              description={t('settings.poeticismDesc')}
              value={settings.dmSettings.narratorPoeticism ?? 50}
              onChange={(v) => updateDMSettings({ narratorPoeticism: v })}
              displayValue={`${settings.dmSettings.narratorPoeticism ?? 50}% — ${poeticismLabel}`}
            />

            <Slider
              label={t('settings.grittiness')}
              description={t('settings.grittinessDesc')}
              value={settings.dmSettings.narratorGrittiness ?? 30}
              onChange={(v) => updateDMSettings({ narratorGrittiness: v })}
              displayValue={`${settings.dmSettings.narratorGrittiness ?? 30}% — ${grittinessLabel}`}
            />

            <Slider
              label={t('settings.narratorDetail')}
              description={t('settings.narratorDetailDesc')}
              value={settings.dmSettings.narratorDetail ?? 50}
              onChange={(v) => updateDMSettings({ narratorDetail: v })}
              displayValue={`${settings.dmSettings.narratorDetail ?? 50}% — ${detailLevelLabel}`}
            />

            <Slider
              label={t('settings.narratorHumor')}
              description={t('settings.narratorHumorDesc')}
              value={settings.dmSettings.narratorHumor ?? 20}
              onChange={(v) => updateDMSettings({ narratorHumor: v })}
              displayValue={`${settings.dmSettings.narratorHumor ?? 20}% — ${humorLabel}`}
            />

            <Slider
              label={t('settings.narratorDrama')}
              description={t('settings.narratorDramaDesc')}
              value={settings.dmSettings.narratorDrama ?? 50}
              onChange={(v) => updateDMSettings({ narratorDrama: v })}
              displayValue={`${settings.dmSettings.narratorDrama ?? 50}% — ${dramaLabel}`}
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
              <div>
                <p className="font-headline text-tertiary">{t('settings.imageGeneration')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.imageGenerationDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ imageGenEnabled: !settings.imageGenEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.imageGenEnabled
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.imageGenEnabled
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
              <div>
                <p className="font-headline text-tertiary">{t('settings.canvasEffects')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.canvasEffectsDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ canvasEffectsEnabled: !settings.canvasEffectsEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.canvasEffectsEnabled !== false
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.canvasEffectsEnabled !== false
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
              <div>
                <p className="font-headline text-tertiary">{t('settings.needsSystem')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.needsSystemDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ needsSystemEnabled: !settings.needsSystemEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.needsSystemEnabled
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.needsSystemEnabled
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Effect Intensity */}
          {settings.canvasEffectsEnabled !== false && (
            <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
              <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-dim">auto_awesome</span>
                {t('settings.effectIntensityTitle')}
              </h2>
              <p className="text-xs text-on-surface-variant mb-6">{t('settings.effectIntensityDesc')}</p>
              <div className="flex gap-3">
                {['low', 'medium', 'high'].map((level) => (
                  <button
                    key={level}
                    onClick={() => updateSettings({ effectIntensity: level })}
                    className={`flex-1 px-4 py-3 rounded-sm border text-center transition-all ${
                      (settings.effectIntensity || 'medium') === level
                        ? 'bg-surface-tint/10 border-primary/30 text-primary'
                        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                    }`}
                  >
                    <span className="font-headline text-sm">{t(`settings.effectLevels.${level}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Narrator Section */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">record_voice_over</span>
              {t('settings.narrator')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.narratorDesc')}</p>

            {/* Enable Narrator Toggle */}
            <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
              <div>
                <p className="font-headline text-tertiary text-sm">{t('settings.narratorEnabled')}</p>
              </div>
              <button
                onClick={() => updateSettings({ narratorEnabled: !settings.narratorEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.narratorEnabled
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.narratorEnabled
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            {/* Auto-play Toggle */}
            <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
              <div>
                <p className="font-headline text-tertiary text-sm">{t('settings.narratorAutoPlay')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.narratorAutoPlayDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ narratorAutoPlay: !settings.narratorAutoPlay })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.narratorAutoPlay
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.narratorAutoPlay
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            {/* Dialogue Speed Slider */}
            <Slider
              label={t('settings.dialogueSpeed')}
              description={t('settings.dialogueSpeedDesc')}
              min={50}
              max={200}
              value={settings.dialogueSpeed ?? 100}
              onChange={(v) => updateSettings({ dialogueSpeed: v })}
              displayValue={`${((settings.dialogueSpeed ?? 100) / 100).toFixed(1)}x`}
            />

            {/* ElevenLabs API Key */}
            <div className="mb-6">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                {t('settings.elevenlabsApiKey')}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={elevenlabsKey}
                  onChange={(e) => setElevenlabsKey(e.target.value)}
                  placeholder="xi-..."
                  className="flex-1 bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                />
                <button
                  onClick={handleLoadVoices}
                  disabled={!elevenlabsKey.trim() || loadingVoices}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-tertiary transition-colors disabled:opacity-30"
                >
                  {loadingVoices ? t('settings.loadingVoices') : t('settings.loadVoices')}
                </button>
              </div>
              {voiceError && (
                <p className="text-error text-xs mt-2">{voiceError}</p>
              )}
            </div>

            {/* Voice Picker */}
            {voices.length > 0 && (
              <div className="mb-6">
                <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
                  {t('settings.voiceSelect')}
                </label>
                <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                  {voices.map((voice) => {
                    const isNarrator = settings.elevenlabsVoiceId === voice.voiceId;
                    const isNpc = isInCharacterPool(voice.voiceId);
                    return (
                      <div
                        key={voice.voiceId}
                        className={`w-full p-3 rounded-sm border flex items-center justify-between transition-all ${
                          isNarrator
                            ? 'bg-surface-tint/10 border-primary/30 text-primary'
                            : isNpc
                              ? 'bg-tertiary/5 border-tertiary/20 text-tertiary'
                              : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                        }`}
                      >
                        <button
                          onClick={() => handleSelectVoice(voice)}
                          className="flex-1 text-left"
                        >
                          <span className="font-headline text-sm">{voice.name}</span>
                          {voice.category && (
                            <span className="text-[10px] text-outline ml-2">{voice.category}</span>
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          {isNarrator && (
                            <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                          )}
                          {isNpc && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleVoiceGender(voice.voiceId); }}
                              title={t('settings.toggleGender')}
                              className={`w-6 h-6 rounded border flex items-center justify-center transition-all text-[11px] font-bold ${
                                getVoiceGender(voice.voiceId) === 'female'
                                  ? 'bg-pink-500/20 border-pink-400/40 text-pink-300'
                                  : 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                              }`}
                            >
                              {getVoiceGender(voice.voiceId) === 'female' ? '♀' : '♂'}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleCharacterVoice(voice); }}
                            title={t('settings.npcVoicePool')}
                            className={`w-6 h-6 rounded border flex items-center justify-center transition-all ${
                              isNpc
                                ? 'bg-tertiary/20 border-tertiary/40 text-tertiary'
                                : 'border-outline-variant/30 text-outline hover:border-tertiary/30'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {isNpc ? 'group' : 'group_add'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-on-surface-variant mt-2">
                  {t('settings.voicePickerHint')}
                </p>
              </div>
            )}

            {voices.length === 0 && settings.elevenlabsApiKey && !loadingVoices && (
              <p className="text-on-surface-variant text-xs mb-4">{t('settings.voiceSelectPlaceholder')}</p>
            )}

            {/* Selected Voice + Test */}
            {settings.elevenlabsVoiceName && (
              <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border border-primary/10 mb-4">
                <div>
                  <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">{t('settings.voiceSelect')}</p>
                  <p className="font-headline text-tertiary text-sm">{settings.elevenlabsVoiceName}</p>
                </div>
                <button
                  onClick={handleTestVoice}
                  disabled={testingVoice}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-tertiary transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    {testingVoice ? 'volume_up' : 'play_arrow'}
                  </span>
                  {t('settings.testVoice')}
                </button>
              </div>
            )}

            {/* NPC Voice Pool Summary */}
            {(settings.characterVoices || []).length > 0 && (
              <div className="p-4 bg-surface-container-high/40 rounded-sm border border-tertiary/10">
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('settings.npcVoicePool')} ({settings.characterVoices.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {settings.characterVoices.map((v) => (
                    <span
                      key={v.voiceId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-tertiary/10 border border-tertiary/20 text-tertiary text-xs font-headline"
                    >
                      <button
                        onClick={() => handleToggleVoiceGender(v.voiceId)}
                        title={t('settings.toggleGender')}
                        className={`font-bold transition-colors ${
                          v.gender === 'female'
                            ? 'text-pink-300 hover:text-pink-200'
                            : 'text-blue-300 hover:text-blue-200'
                        }`}
                      >
                        {v.gender === 'female' ? '♀' : '♂'}
                      </button>
                      {v.voiceName}
                      <button
                        onClick={() => handleToggleCharacterVoice(v)}
                        className="ml-0.5 text-tertiary/60 hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-on-surface-variant mt-2">{t('settings.npcVoicePoolDesc')}</p>
              </div>
            )}
          </div>

          {/* Sound Effects Section */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">surround_sound</span>
              {t('settings.sfxTitle')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.sfxDesc')}</p>

            <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
              <div>
                <p className="font-headline text-tertiary text-sm">{t('settings.sfxEnabled')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.sfxEnabledDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ sfxEnabled: !settings.sfxEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.sfxEnabled
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.sfxEnabled
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            {settings.sfxEnabled && (
              <Slider
                label={t('settings.sfxVolume')}
                description={t('settings.sfxVolumeDesc')}
                value={settings.sfxVolume ?? 70}
                onChange={(v) => updateSettings({ sfxVolume: v })}
                displayValue={`${settings.sfxVolume ?? 70}%`}
              />
            )}
          </div>

          {/* Background Music Section (Local MP3) */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">music_note</span>
              {t('settings.musicTitle')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.localMusicDesc')}</p>

            <div className="flex items-center justify-between mb-6 p-4 bg-surface-container-high/40 rounded-sm border-b border-outline-variant/15">
              <div>
                <p className="font-headline text-tertiary text-sm">{t('settings.localMusicEnabled')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                  {t('settings.localMusicEnabledDesc')}
                </p>
              </div>
              <button
                onClick={() => updateSettings({ localMusicEnabled: !settings.localMusicEnabled })}
                className={`w-12 h-6 rounded-full relative cursor-pointer border transition-all ${
                  settings.localMusicEnabled
                    ? 'bg-primary-dim/20 border-primary/30'
                    : 'bg-surface-container-highest border-outline-variant/30'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                    settings.localMusicEnabled
                      ? 'right-1 bg-primary shadow-[0_0_8px_rgba(197,154,255,0.8)]'
                      : 'left-1 bg-on-surface-variant'
                  }`}
                />
              </button>
            </div>

            {settings.localMusicEnabled && (
              <Slider
                label={t('settings.musicVolume')}
                description={t('settings.musicVolumeDesc')}
                value={settings.musicVolume ?? 40}
                onChange={(v) => updateSettings({ musicVolume: v })}
                displayValue={`${settings.musicVolume ?? 40}%`}
              />
            )}
          </div>
        </section>

        {/* Right Panel: AI Provider & Keys */}
        <section className="space-y-6 animate-fade-in">
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
            <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
              {t('settings.aiProvider')}
            </h2>

            {/* Provider Selection */}
            <div className="space-y-3 mb-8">
              {providerOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateSettings({ aiProvider: opt.id })}
                  className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                    settings.aiProvider === opt.id
                      ? 'bg-surface-tint/10 border-primary/30 text-primary'
                      : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                  }`}
                >
                  <span className="material-symbols-outlined">{opt.icon}</span>
                  <span className="font-headline text-sm">{providerLabels[opt.id]}</span>
                  {settings.aiProvider === opt.id && (
                    <span className="material-symbols-outlined text-primary ml-auto text-sm">
                      check_circle
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Model Tier */}
            <div className="mb-8">
              <h3 className="font-headline text-sm text-tertiary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-dim text-base">speed</span>
                {t('settings.modelTier')}
              </h3>
              <p className="text-[10px] text-on-surface-variant mb-4">{t('settings.modelTierDesc')}</p>
              <div className="space-y-2">
                {[
                  { id: 'standard', icon: 'bolt', label: t('settings.modelTierStandard'), desc: t('settings.modelTierStandardDesc') },
                  { id: 'premium', icon: 'diamond', label: t('settings.modelTierPremium'), desc: t('settings.modelTierPremiumDesc') },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => updateSettings({ aiModelTier: opt.id })}
                    className={`w-full p-3 rounded-sm border text-left flex items-center gap-3 transition-all ${
                      (settings.aiModelTier || 'premium') === opt.id
                        ? 'bg-surface-tint/10 border-primary/30 text-primary'
                        : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                    <div className="flex-1">
                      <span className="font-headline text-sm block">{opt.label}</span>
                      <span className="text-[10px] font-label uppercase tracking-widest opacity-70">{opt.desc}</span>
                    </div>
                    {(settings.aiModelTier || 'premium') === opt.id && (
                      <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-on-surface-variant mt-2 opacity-60">{t('settings.modelTierCostHint')}</p>
            </div>

            {/* API Keys */}
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('settings.openaiApiKey')}
                </label>
                <input
                  type="password"
                  value={localKeys.openaiApiKey}
                  onChange={(e) =>
                    setLocalKeys((p) => ({ ...p, openaiApiKey: e.target.value }))
                  }
                  placeholder="sk-..."
                  className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('settings.anthropicApiKey')}
                </label>
                <input
                  type="password"
                  value={localKeys.anthropicApiKey}
                  onChange={(e) =>
                    setLocalKeys((p) => ({ ...p, anthropicApiKey: e.target.value }))
                  }
                  placeholder="sk-ant-..."
                  className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Image Provider */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
            <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">image</span>
              {t('settings.imageProvider')}
            </h2>

            <div className="space-y-3 mb-8">
              {[
                { id: 'dalle', icon: 'auto_awesome', label: t('settings.dalleLabel') },
                { id: 'stability', icon: 'speed', label: t('settings.stabilityLabel') },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateSettings({ imageProvider: opt.id })}
                  className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                    settings.imageProvider === opt.id
                      ? 'bg-surface-tint/10 border-primary/30 text-primary'
                      : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                  }`}
                >
                  <span className="material-symbols-outlined">{opt.icon}</span>
                  <span className="font-headline text-sm">{opt.label}</span>
                  {settings.imageProvider === opt.id && (
                    <span className="material-symbols-outlined text-primary ml-auto text-sm">
                      check_circle
                    </span>
                  )}
                </button>
              ))}
            </div>

            {settings.imageProvider === 'stability' && (
              <div>
                <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                  {t('settings.stabilityApiKey')}
                </label>
                <input
                  type="password"
                  value={localKeys.stabilityApiKey}
                  onChange={(e) =>
                    setLocalKeys((p) => ({ ...p, stabilityApiKey: e.target.value }))
                  }
                  placeholder="sk-..."
                  className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                />
                <p className="text-[10px] text-on-surface-variant mt-2">
                  {t('settings.stabilityApiKeyDesc')}
                </p>
              </div>
            )}
          </div>

          {/* Backend Server */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">cloud</span>
              {t('settings.backendTitle')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.backendDesc')}</p>

            {backendUser ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border border-primary/10">
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                      {t('settings.backendLoggedInAs')}
                    </p>
                    <p className="font-headline text-tertiary text-sm">{backendUser.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(197,154,255,0.8)]" />
                    <span className="text-xs text-primary font-headline">{t('settings.backendConnected')}</span>
                  </div>
                </div>

                {cacheStats && (
                  <div className="p-4 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
                      {t('settings.cacheStats')}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-on-surface-variant">{t('settings.cacheTotal')}: </span>
                        <span className="text-tertiary font-headline">{cacheStats.total}</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant">{t('settings.cacheSize')}: </span>
                        <span className="text-tertiary font-headline">{formatBytes(cacheStats.totalSize)}</span>
                      </div>
                      {cacheStats.byType && Object.entries(cacheStats.byType).map(([type, data]) => (
                        <div key={type}>
                          <span className="text-on-surface-variant">
                            {t(`settings.cache${type.charAt(0).toUpperCase() + type.slice(1)}`, type)}:
                          </span>{' '}
                          <span className="text-tertiary font-headline">
                            {data.count} ({formatBytes(data.size)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBackendLogout}
                  className="w-full p-3 rounded-sm border border-error/20 text-error text-xs font-headline uppercase tracking-widest hover:bg-error/10 transition-all"
                >
                  {t('settings.backendLogout')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                    {t('settings.backendUrl')}
                  </label>
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder={t('settings.backendUrlPlaceholder')}
                    className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                    {t('settings.backendEmail')}
                  </label>
                  <input
                    type="email"
                    value={backendEmail}
                    onChange={(e) => setBackendEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                    {t('settings.backendPassword')}
                  </label>
                  <input
                    type="password"
                    value={backendPassword}
                    onChange={(e) => setBackendPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={6}
                    className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">{t('settings.backendPasswordHint')}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBackendLogin}
                    disabled={backendLoading || !backendUrl || !backendEmail || !backendPassword}
                    className="flex-1 p-3 rounded-sm border bg-surface-tint/10 border-primary/30 text-primary text-xs font-headline uppercase tracking-widest hover:bg-surface-tint/20 transition-all disabled:opacity-30"
                  >
                    {backendLoading ? t('common.loading') : t('settings.backendLogin')}
                  </button>
                  <button
                    onClick={handleBackendRegister}
                    disabled={backendLoading || !backendUrl || !backendEmail || !backendPassword}
                    className="flex-1 p-3 rounded-sm border border-outline-variant/15 text-on-surface-variant text-xs font-headline uppercase tracking-widest hover:border-primary/20 hover:text-primary transition-all disabled:opacity-30"
                  >
                    {t('settings.backendRegister')}
                  </button>
                </div>
                {backendError && (
                  <div className="flex items-center gap-2 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-xs font-headline">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {backendError}
                  </div>
                )}
                {backendSuccess && (
                  <div className="flex items-center gap-2 p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs font-headline">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    {backendSuccess}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Local LLM */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">memory</span>
              {t('settings.localLLM', 'Local LLM')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.localLLMDesc', 'Connect to a locally running LLM via Ollama or LM Studio for offline play.')}</p>

            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">{t('settings.enableLocalLLM', 'Enable Local LLM')}</span>
                <input
                  type="checkbox"
                  checked={settings.localLLMEnabled || false}
                  onChange={(e) => updateSettings({ localLLMEnabled: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
              </label>

              {settings.localLLMEnabled && (
                <>
                  <div>
                    <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                      {t('settings.localLLMEndpoint', 'Endpoint URL')}
                    </label>
                    <input
                      type="text"
                      value={settings.localLLMEndpoint || 'http://localhost:11434'}
                      onChange={(e) => updateSettings({ localLLMEndpoint: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="w-full bg-surface-container/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary/40 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                      {t('settings.localLLMModel', 'Model Name')}
                    </label>
                    <input
                      type="text"
                      value={settings.localLLMModel || ''}
                      onChange={(e) => updateSettings({ localLLMModel: e.target.value })}
                      placeholder="llama3, mistral, etc."
                      className="w-full bg-surface-container/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary/40 focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">{t('settings.reducedPrompt', 'Use reduced prompts (recommended for 7B-13B models)')}</span>
                    <input
                      type="checkbox"
                      checked={settings.localLLMReducedPrompt !== false}
                      onChange={(e) => updateSettings({ localLLMReducedPrompt: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-surface-container-highest/60 backdrop-blur-md p-6 rounded-sm border-r border-tertiary/10">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-tertiary mt-1">info</span>
              <div>
                <h3 className="font-headline text-tertiary text-sm mb-2">{t('settings.apiKeysTitle')}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {t('settings.apiKeysDescription')}
                </p>
              </div>
            </div>
          </div>

          {/* Export / Import Config */}
          <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-tertiary/20">
            <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">settings_backup_restore</span>
              {t('settings.configBackup')}
            </h2>
            <p className="text-xs text-on-surface-variant mb-6">{t('settings.configBackupDesc')}</p>

            <div className="space-y-3">
              <button
                onClick={handleExportConfig}
                className="w-full p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary text-left flex items-center gap-3 transition-all"
              >
                <span className="material-symbols-outlined">download</span>
                <div>
                  <span className="font-headline text-sm block">{t('settings.exportConfig')}</span>
                  <span className="text-[10px] font-label uppercase tracking-widest">{t('settings.exportConfigDesc')}</span>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20 hover:text-primary text-left flex items-center gap-3 transition-all"
              >
                <span className="material-symbols-outlined">upload</span>
                <div>
                  <span className="font-headline text-sm block">{t('settings.importConfig')}</span>
                  <span className="text-[10px] font-label uppercase tracking-widest">{t('settings.importConfigDesc')}</span>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportConfig}
                className="hidden"
              />

              {importStatus === 'success' && (
                <div className="flex items-center gap-2 p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs font-headline">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {t('settings.importSuccess')}
                </div>
              )}
              {importStatus === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-xs font-headline">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {t('settings.importError')}
                </div>
              )}
            </div>

            <p className="text-[10px] text-on-surface-variant mt-4">{t('settings.configBackupWarning')}</p>
          </div>
        </section>
      </div>

    </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-8 items-center">
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.activeProvider')}
              </p>
              <p className="font-headline text-tertiary">
                {settings.aiProvider === 'openai' ? t('settings.openaiProvider') : t('settings.anthropicProvider')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.modelTier')}
              </p>
              <p className="font-headline text-tertiary">
                {(settings.aiModelTier || 'premium') === 'premium' ? t('settings.modelTierPremium') : t('settings.modelTierStandard')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.status')}
              </p>
              <p className={`font-headline ${(localKeys.openaiApiKey || localKeys.anthropicApiKey) ? 'text-primary' : 'text-error'}`}>
                {(localKeys.openaiApiKey || localKeys.anthropicApiKey) ? t('settings.keyConfigured') : t('settings.noKeySet')}
              </p>
            </div>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <Button variant="ghost" onClick={handleReset} className="flex-1 md:flex-none">
              {t('settings.resetGrimoire')}
            </Button>
            <Button onClick={handleApply} className="flex-1 md:flex-none relative">
              {saved ? t('settings.saved') : t('settings.applyChanges')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
