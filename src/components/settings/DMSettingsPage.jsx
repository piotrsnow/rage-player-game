import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { elevenlabsService } from '../../services/elevenlabs';
import Slider from '../ui/Slider';
import Button from '../ui/Button';

const providerOptions = [
  { id: 'openai', icon: 'auto_awesome' },
  { id: 'anthropic', icon: 'psychology' },
];

export default function DMSettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings, updateDMSettings, resetSettings } = useSettings();
  const [localKeys, setLocalKeys] = useState({
    openaiApiKey: settings.openaiApiKey,
    anthropicApiKey: settings.anthropicApiKey,
  });
  const [saved, setSaved] = useState(false);
  const [elevenlabsKey, setElevenlabsKey] = useState(settings.elevenlabsApiKey || '');
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    setLocalKeys({
      openaiApiKey: settings.openaiApiKey,
      anthropicApiKey: settings.anthropicApiKey,
    });
  }, [settings.openaiApiKey, settings.anthropicApiKey]);

  const handleApply = () => {
    updateSettings({
      openaiApiKey: localKeys.openaiApiKey,
      anthropicApiKey: localKeys.anthropicApiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetSettings();
    setLocalKeys({ openaiApiKey: '', anthropicApiKey: '' });
    setElevenlabsKey('');
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

  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
      {/* Header */}
      <header className="mb-12 animate-fade-in">
        <h1 className="font-headline text-4xl lg:text-5xl font-bold text-tertiary tracking-tight mb-2 drop-shadow-[0_0_10px_rgba(149,71,247,0.15)]">
          {t('settings.title')}
        </h1>
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
          </div>

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
                  {voices.map((voice) => (
                    <button
                      key={voice.voiceId}
                      onClick={() => handleSelectVoice(voice)}
                      className={`w-full p-3 rounded-sm border text-left flex items-center justify-between transition-all ${
                        settings.elevenlabsVoiceId === voice.voiceId
                          ? 'bg-surface-tint/10 border-primary/30 text-primary'
                          : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                      }`}
                    >
                      <div>
                        <span className="font-headline text-sm">{voice.name}</span>
                        {voice.category && (
                          <span className="text-[10px] text-outline ml-2">{voice.category}</span>
                        )}
                      </div>
                      {settings.elevenlabsVoiceId === voice.voiceId && (
                        <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {voices.length === 0 && settings.elevenlabsApiKey && !loadingVoices && (
              <p className="text-on-surface-variant text-xs mb-4">{t('settings.voiceSelectPlaceholder')}</p>
            )}

            {/* Selected Voice + Test */}
            {settings.elevenlabsVoiceName && (
              <div className="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-sm border border-primary/10">
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
        </section>
      </div>

      {/* Footer Actions */}
      <footer className="mt-12 pt-8 border-t border-outline-variant/15 flex flex-col md:flex-row justify-between items-center gap-8">
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
  );
}
