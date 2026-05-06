import VoiceCard from './VoiceCard';

export default function VoiceList({ voices, loading, error, onTest, testing, onDelete, onPatch }) {
  if (loading && voices.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl animate-shimmer">mic</span>
        <p className="mt-2 font-body text-sm">Loading voices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-4xl text-error">error</span>
        <p className="mt-2 font-body text-sm text-error">{error}</p>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl">library_music</span>
        <p className="mt-2 font-body text-sm">No voices yet. Upload a WAV sample to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {voices.map((voice) => (
        <VoiceCard
          key={voice.id}
          voice={voice}
          onTest={onTest}
          testing={testing}
          onDelete={onDelete}
          onPatch={onPatch}
        />
      ))}
    </div>
  );
}
