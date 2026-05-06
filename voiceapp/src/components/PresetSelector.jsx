import { useConfigStore } from '../store';

const LANGUAGES = [
  { code: 'pl', label: 'Polski' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'cs', label: 'Čeština' },
];

export default function PresetSelector() {
  const language = useConfigStore((s) => s.language);
  const setLanguage = useConfigStore((s) => s.setLanguage);

  return (
    <div>
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        Synthesis Language
      </label>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-surface-container px-3 py-1.5 rounded-sm text-on-surface font-body text-xs border border-outline-variant/30 focus:border-primary/50 outline-none appearance-none cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
