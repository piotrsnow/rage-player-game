import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { elevenlabsService } from '../../services/elevenlabs';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import { useModalA11y } from '../../hooks/useModalA11y';
import Slider from '../ui/Slider';
import Button from '../ui/Button';

export default function DMSettingsPage({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateSharedVoiceSettings, updateDMSettings, resetSettings, importSettings, loadFromAccount, hasApiKey, backendUser, backendLogout } = useSettings();

  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [testingVoice, setTestingVoice] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const fileInputRef = useRef(null);
  const [cacheStats, setCacheStats] = useState(null);

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
    if (settings.useBackend && settings.backendUrl && apiClient.isConnected()) {
      loadCacheStats();
    }
  }, [settings.useBackend, settings.backendUrl, loadCacheStats]);

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
      }
      setImportStatus('success');
    } catch {
      setImportStatus('error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(null), 3000);
  };

  const handleReset = () => {
    resetSettings();
    setVoices([]);
  };

  const handleLoadVoices = async () => {
    if (!hasApiKey('elevenlabs')) return;
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const voiceList = await elevenlabsService.getVoices();
      setVoices(voiceList);
    } catch (err) {
      setVoiceError(err.message);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSelectVoice = (voice) => {
    updateSharedVoiceSettings({
      elevenlabsVoiceId: voice.voiceId,
      elevenlabsVoiceName: voice.name,
    });
  };

  const handleToggleCharacterVoice = (voice) => {
    const current = settings.characterVoices || [];
    const exists = current.some((v) => v.voiceId === voice.voiceId);
    if (exists) {
      updateSharedVoiceSettings({ characterVoices: current.filter((v) => v.voiceId !== voice.voiceId) });
    } else {
      updateSharedVoiceSettings({ characterVoices: [...current, { voiceId: voice.voiceId, voiceName: voice.name, gender: 'male' }] });
    }
  };

  const handleToggleVoiceGender = (voiceId) => {
    const current = settings.characterVoices || [];
    updateSharedVoiceSettings({
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
    if (!voiceId || !hasApiKey('elevenlabs')) return;
    setTestingVoice(true);
    try {
      const audioUrl = await elevenlabsService.textToSpeechStream(
        undefined,
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
  const combatCommentaryFrequency = settings.dmSettings.combatCommentaryFrequency ?? 3;
  const combatCommentaryLabel = combatCommentaryFrequency === 0
    ? t('settings.combatCommentaryDisabled')
    : t('settings.combatCommentaryEveryRounds', { count: combatCommentaryFrequency });

  const poeticismLabel = (settings.dmSettings.narratorPoeticism ?? 50) < 25 ? t('settings.poeticismLabels.prosaic') : (settings.dmSettings.narratorPoeticism ?? 50) < 50 ? t('settings.poeticismLabels.literary') : (settings.dmSettings.narratorPoeticism ?? 50) < 75 ? t('settings.poeticismLabels.poetic') : t('settings.poeticismLabels.lyrical');
  const grittinessLabel = (settings.dmSettings.narratorGrittiness ?? 30) < 25 ? t('settings.grittinessLabels.light') : (settings.dmSettings.narratorGrittiness ?? 30) < 50 ? t('settings.grittinessLabels.grounded') : (settings.dmSettings.narratorGrittiness ?? 30) < 75 ? t('settings.grittinessLabels.gritty') : t('settings.grittinessLabels.brutal');
  const detailLevelLabel = (settings.dmSettings.narratorDetail ?? 50) < 25 ? t('settings.detailLabels.minimal') : (settings.dmSettings.narratorDetail ?? 50) < 50 ? t('settings.detailLabels.balanced') : (settings.dmSettings.narratorDetail ?? 50) < 75 ? t('settings.detailLabels.rich') : t('settings.detailLabels.lavish');
  const humorLabel = (settings.dmSettings.narratorHumor ?? 20) < 25 ? t('settings.humorLabels.serious') : (settings.dmSettings.narratorHumor ?? 20) < 50 ? t('settings.humorLabels.dry') : (settings.dmSettings.narratorHumor ?? 20) < 75 ? t('settings.humorLabels.witty') : t('settings.humorLabels.absurd');
  const dramaLabel = (settings.dmSettings.narratorDrama ?? 50) < 25 ? t('settings.dramaLabels.subtle') : (settings.dmSettings.narratorDrama ?? 50) < 50 ? t('settings.dramaLabels.measured') : (settings.dmSettings.narratorDrama ?? 50) < 75 ? t('settings.dramaLabels.heightened') : t('settings.dramaLabels.theatrical');

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: DM & Gameplay Settings */}
              <section className="space-y-6 animate-fade-in">
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
                    label={t('settings.combatCommentaryFrequency')}
                    description={t('settings.combatCommentaryFrequencyDesc')}
                    min={0}
                    max={5}
                    value={combatCommentaryFrequency}
                    onChange={(v) => updateDMSettings({ combatCommentaryFrequency: v })}
                    displayValue={combatCommentaryLabel}
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
                  <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
                    <div className="mb-3">
                      <p className="font-headline text-tertiary">{t('settings.sceneVisualization')}</p>
                      <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                        {t('settings.sceneVisualizationDesc')}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'image', icon: 'image', label: t('settings.sceneVisImage') },
                        { id: '3d', icon: 'view_in_ar', label: t('settings.sceneVis3D') },
                        { id: 'canvas', icon: 'brush', label: t('settings.sceneVisCanvas') },
                        { id: 'none', icon: 'visibility_off', label: t('settings.sceneVisNone') },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => updateSettings({ sceneVisualization: opt.id })}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
                            (settings.sceneVisualization || 'image') === opt.id
                              ? 'bg-surface-tint/10 border-primary/30 text-primary'
                              : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                          <span className="font-headline text-xs">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Meshy 3D generation settings — hidden, using local models for now
                  {(settings.sceneVisualization || 'image') === '3d' && (
                    <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
                      <div className="mb-3">
                        <p className="font-headline text-tertiary">{t('settings.meshySettings')}</p>
                        <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                          {t('settings.meshySettingsDesc')}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-on-surface">{t('settings.meshyEnabled')}</p>
                            <p className="text-[10px] text-on-surface-variant">{t('settings.meshyEnabledDesc')}</p>
                          </div>
                          <button
                            onClick={() => updateSettings({ meshyEnabled: !settings.meshyEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.meshyEnabled ? 'bg-primary' : 'bg-outline-variant/30'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.meshyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        {settings.meshyEnabled && (
                          <div>
                            <label className="text-sm text-on-surface block mb-1">{t('settings.meshyApiKey')}</label>
                            <input
                              type="password"
                              value={settings.meshyApiKey || ''}
                              onChange={(e) => updateSettings({ meshyApiKey: e.target.value })}
                              placeholder={t('settings.meshyApiKeyPlaceholder')}
                              className="w-full bg-surface-container-highest/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary/40"
                            />
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            const { clearCache } = await import('../../services/assetCache');
                            await clearCache();
                            alert(t('settings.assetCacheCleared'));
                          }}
                          className="text-xs text-on-surface-variant hover:text-primary transition-colors underline"
                        >
                          {t('settings.clearAssetCache')}
                        </button>
                      </div>
                    </div>
                  )}
                  */}

                  {(settings.sceneVisualization || 'image') === 'image' && (
                    <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
                      <div className="mb-3">
                        <p className="font-headline text-tertiary">{t('settings.imageStyle')}</p>
                        <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
                          {t('settings.imageStyleDesc')}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { id: 'illustration', icon: 'palette' },
                          { id: 'pencil', icon: 'edit' },
                          { id: 'noir', icon: 'contrast' },
                          { id: 'anime', icon: 'animated_images' },
                          { id: 'painting', icon: 'brush' },
                          { id: 'watercolor', icon: 'water_drop' },
                          { id: 'comic', icon: 'auto_stories' },
                          { id: 'darkFantasy', icon: 'skull' },
                          { id: 'vanGogh', icon: 'texture' },
                          { id: 'photoreal', icon: 'photo_camera' },
                          { id: 'retro', icon: 'grid_on' },
                          { id: 'gothic', icon: 'castle' },
                        ].map((style) => (
                          <button
                            key={style.id}
                            onClick={() => updateDMSettings({ imageStyle: style.id })}
                            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-sm border text-center transition-all ${
                              (settings.dmSettings.imageStyle || 'painting') === style.id
                                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">{style.icon}</span>
                            <span className="font-headline text-[11px]">{t(`settings.imageStyles.${style.id}`)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
              </section>

              {/* Right Column: Media & Backend Settings */}
              <section className="space-y-6 animate-fade-in">
                {/* Narrator Section */}
                <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
                  <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-dim">record_voice_over</span>
                    {t('settings.narrator')}
                  </h2>
                  <p className="text-xs text-on-surface-variant mb-6">{t('settings.narratorDesc')}</p>
                  {backendUser && (
                    <div className="mb-6 rounded-sm border border-tertiary/20 bg-tertiary/5 px-4 py-3 text-xs text-tertiary">
                      {t('settings.sharedVoiceSettingsHint')}
                    </div>
                  )}

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

                  {/* Load Voices */}
                  <div className="mb-6">
                    <button
                      onClick={handleLoadVoices}
                      disabled={!hasApiKey('elevenlabs') || loadingVoices}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:text-tertiary transition-colors disabled:opacity-30"
                    >
                      {loadingVoices ? t('settings.loadingVoices') : t('settings.loadVoices')}
                    </button>
                    {!hasApiKey('elevenlabs') && (
                      <p className="text-[10px] text-on-surface-variant mt-2">{t('keys.configureElevenlabs')}</p>
                    )}
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
                        onClick={backendLogout}
                        className="w-full p-3 rounded-sm border border-error/20 text-error text-xs font-headline uppercase tracking-widest hover:bg-error/10 transition-all"
                      >
                        {t('settings.backendLogout')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
                      <span className="material-symbols-outlined text-outline/40">person_off</span>
                      <div className="flex-1">
                        <p className="text-on-surface-variant text-xs">
                          {t('settings.backendDisconnected')}
                        </p>
                        <p className="text-outline/40 text-[10px] mt-0.5">
                          {t('lobby.loginOnMainPage')}
                        </p>
                      </div>
                    </div>
                  )}
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

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex justify-end">
          <Button variant="ghost" onClick={handleReset}>
            {t('settings.resetGrimoire')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
