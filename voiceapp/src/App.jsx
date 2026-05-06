import { useCallback } from 'react';
import { useVoices } from './hooks/useVoices';
import { useTestVoice } from './hooks/useTestVoice';
import { useConfigStore } from './store';
import HealthIndicator from './components/HealthIndicator';
import UploadPanel from './components/UploadPanel';
import VoiceList from './components/VoiceList';
import TestPanel from './components/TestPanel';
import PresetSelector from './components/PresetSelector';
import ConfigSummary from './components/ConfigSummary';

export default function App() {
  const { voices, loading, error, upload, patch, remove } = useVoices();
  const { testing, test, stop } = useTestVoice();
  const removeVoiceFromConfig = useConfigStore((s) => s.removeVoiceFromConfig);

  const handleDelete = useCallback(async (id) => {
    await remove(id);
    removeVoiceFromConfig(id);
  }, [remove, removeVoiceFromConfig]);

  const handleTest = useCallback((voiceId, customText) => {
    if (testing === voiceId) {
      stop();
    } else {
      test(voiceId, customText);
    }
  }, [testing, test, stop]);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* Header */}
      <header className="border-b border-outline-variant/15 bg-surface-container/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-headline text-xl text-tertiary flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">graphic_eq</span>
              XTTS Voice Studio
            </h1>
            <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-0.5">
              Voice cloning &amp; TTS for RPGon
            </p>
          </div>
          <HealthIndicator />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <UploadPanel onUpload={upload} />

        <section>
          <h2 className="font-headline text-lg text-tertiary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">library_music</span>
            Voice Library
            {voices.length > 0 && (
              <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest ml-1">
                ({voices.length})
              </span>
            )}
          </h2>
          <VoiceList
            voices={voices}
            loading={loading}
            error={error}
            onTest={handleTest}
            testing={testing}
            onDelete={handleDelete}
            onPatch={patch}
          />
        </section>

        <TestPanel voices={voices} onTest={handleTest} testing={testing} />
      </main>

      {/* Sticky bottom bar */}
      <footer className="border-t border-outline-variant/15 bg-surface-container/80 backdrop-blur-xl sticky bottom-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <PresetSelector />
          <ConfigSummary voices={voices} />
        </div>
      </footer>
    </div>
  );
}
