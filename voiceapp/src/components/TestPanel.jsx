import { useState } from 'react';
import { useConfigStore } from '../store';

export default function TestPanel({ voices, onTest, testing }) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const language = useConfigStore((s) => s.language);

  const placeholder = language === 'pl'
    ? 'Witaj, poszukiwaczu przygód...'
    : 'Greetings, adventurer...';

  const handleTest = () => {
    if (!selectedVoice) return;
    onTest(selectedVoice, text || undefined);
  };

  return (
    <div className="glass-panel-elevated rounded-sm p-6">
      <h2 className="font-headline text-lg text-tertiary mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">hearing</span>
        Test Synthesis
      </h2>
      <p className="text-[10px] text-on-surface-variant mb-4">
        Uses per-voice params configured above. Expand a voice card to adjust.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-1">
            Text
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-surface-container px-3 py-2 rounded-sm text-on-surface font-body text-sm border border-outline-variant/30 focus:border-primary/50 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-1">
            Voice
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="bg-surface-container px-3 py-2 rounded-sm text-on-surface font-body text-xs border border-outline-variant/30 focus:border-primary/50 outline-none appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="">Select...</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleTest}
          disabled={!selectedVoice || !!testing}
          className="px-5 py-2 bg-primary/15 text-primary font-bold text-xs uppercase tracking-widest rounded-sm border border-primary/30 hover:bg-primary/25 disabled:opacity-40 transition-all flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">
            {testing ? 'hourglass_top' : 'play_arrow'}
          </span>
          {testing ? 'Generating...' : 'Synthesize'}
        </button>
      </div>
    </div>
  );
}
