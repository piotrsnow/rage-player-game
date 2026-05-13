import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { useSettings } from '../../../../contexts/SettingsContext';

const ROLES = [
  { key: 'body', icon: 'notes', label: 'Tekst', desc: 'Chat, opisy, narracja — domyślna czcionka wszędzie', preview: 'Krzemuch wszedł do tawerny i rozejrzał się dookoła. Barman podniósł wzrok znad kufla.' },
  { key: 'headline', icon: 'title', label: 'Nagłówki', desc: 'Tytuły modali, nazwy sekcji, headery', preview: 'Wyprawa do Puszczy Mrocznej' },
  { key: 'accent', icon: 'priority_high', label: 'Ważne komunikaty', desc: 'Alerty, powiadomienia, krytyczne info', preview: 'Uwaga! Stracono punkt wytrzymałości!' },
  { key: 'mono', icon: 'terminal', label: 'Debug / techniczne', desc: 'Logi błędów, informacje systemowe', preview: 'ERR_TIMEOUT scene_gen elapsed=4821ms' },
];

const SHADOW_PRESETS = [
  { value: '', label: 'Brak' },
  { value: '#000000', blur: 2, x: 1, y: 1, label: 'Delikatny ciemny' },
  { value: '#000000', blur: 4, x: 2, y: 2, label: 'Mocny ciemny' },
  { value: 'rgba(197,154,255,0.6)', blur: 4, x: 0, y: 0, label: 'Fioletowy blask' },
  { value: 'rgba(255,200,120,0.5)', blur: 6, x: 0, y: 0, label: 'Złoty blask' },
  { value: 'rgba(120,220,255,0.5)', blur: 6, x: 0, y: 0, label: 'Lodowy blask' },
];

function makeDefaultRole() {
  return { font: '', color: '', sizeMultiplier: 1, letterSpacing: 0, fontStretch: 100, shadowColor: '', shadowBlur: 0, shadowX: 0, shadowY: 0, shadowSpread: 0, outlineWidth: 0, outlineColor: '' };
}

function buildTextShadow(role) {
  if (!role.shadowColor || (!role.shadowBlur && !role.shadowX && !role.shadowY && !role.shadowSpread)) return 'none';
  const spread = role.shadowSpread || 0;
  if (spread <= 0) return `${role.shadowX}px ${role.shadowY}px ${role.shadowBlur}px ${role.shadowColor}`;
  const layers = [];
  const s = Math.ceil(spread);
  for (let dx = -s; dx <= s; dx++) {
    for (let dy = -s; dy <= s; dy++) {
      if (dx * dx + dy * dy > spread * spread) continue;
      layers.push(`${role.shadowX + dx}px ${role.shadowY + dy}px ${role.shadowBlur}px ${role.shadowColor}`);
    }
  }
  return layers.join(', ');
}

export default function FontConfigTab() {
  const { fetchFontConfig } = useSettings();
  const [availableFonts, setAvailableFonts] = useState([]);
  const [config, setConfig] = useState({
    body: makeDefaultRole(),
    headline: makeDefaultRole(),
    accent: makeDefaultRole(),
    mono: makeDefaultRole(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    Promise.all([
      apiClient.get('/v1/admin/livingWorld/available-fonts'),
      apiClient.get('/font-config'),
    ]).then(([fonts, current]) => {
      setAvailableFonts(Array.isArray(fonts) ? fonts : []);
      if (current) {
        const parsed = {};
        for (const role of Object.keys(config)) {
          const d = current[role] || {};
          parsed[role] = {
            font: d.font || '',
            color: d.color || '',
            sizeMultiplier: d.sizeMultiplier ?? 1,
            letterSpacing: d.letterSpacing ?? 0,
            fontStretch: d.fontStretch ?? 100,
            shadowColor: d.shadowColor || '',
            shadowBlur: d.shadowBlur ?? 0,
            shadowX: d.shadowX ?? 0,
            shadowY: d.shadowY ?? 0,
            shadowSpread: d.shadowSpread ?? 0,
            outlineWidth: d.outlineWidth ?? 0,
            outlineColor: d.outlineColor || '',
          };
        }
        setConfig(parsed);
      }
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateRole(role, field, value) {
    setConfig((prev) => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
  }

  function applyShadowPreset(roleKey, preset) {
    if (!preset.value) {
      updateRole(roleKey, 'shadowColor', '');
      updateRole(roleKey, 'shadowBlur', 0);
      updateRole(roleKey, 'shadowX', 0);
      updateRole(roleKey, 'shadowY', 0);
    } else {
      setConfig((prev) => ({
        ...prev,
        [roleKey]: { ...prev[roleKey], shadowColor: preset.value, shadowBlur: preset.blur, shadowX: preset.x, shadowY: preset.y },
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.put('/font-config', config);
      await fetchFontConfig();
      setMessage({ type: 'ok', text: 'Konfiguracja zapisana — zmiany widoczne natychmiast u wszystkich.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Błąd zapisu' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        Ładowanie konfiguracji czcionek…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-headline text-lg text-tertiary flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary-dim">font_download</span>
          Konfiguracja czcionek
        </h2>
        <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
          Ustawienia obowiązują wszystkich użytkowników. Czcionki dostępne w katalogu <code className="font-mono text-xs px-1 py-0.5 bg-surface-container rounded-sm">public/fonts/</code>.
        </p>
      </header>

      {ROLES.map(({ key, icon, label, desc, preview }) => {
        const role = config[key];
        const shadowStr = buildTextShadow(role);
        const outlineStr = (role.outlineWidth > 0 && role.outlineColor)
          ? `${role.outlineWidth}px ${role.outlineColor}`
          : undefined;

        return (
          <section
            key={key}
            className="bg-surface-container-high/60 backdrop-blur-xl rounded-sm border border-outline-variant/15 overflow-hidden"
          >
            {/* Section header */}
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-dim">{icon}</span>
              <div>
                <h3 className="font-headline text-on-surface text-base">{label}</h3>
                <p className="text-xs text-on-surface-variant">{desc}</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Row 1: font + color + size */}
              <div className="grid grid-cols-[1fr_160px_180px] gap-4">
                <Field label="Czcionka">
                  <select
                    value={role.font}
                    onChange={(e) => updateRole(key, 'font', e.target.value)}
                    className="w-full h-9 bg-surface-container border border-outline-variant/30 rounded-sm px-3 text-sm text-on-surface focus:border-primary/60 outline-none transition-colors"
                  >
                    <option value="">— domyślna —</option>
                    {availableFonts.map((f) => (
                      <option key={f.name} value={f.name}>{f.name.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Kolor tekstu">
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="color"
                      value={role.color || '#fffbfe'}
                      onChange={(e) => updateRole(key, 'color', e.target.value)}
                      className="w-9 h-9 rounded-sm border border-outline-variant/30 cursor-pointer bg-transparent shrink-0"
                    />
                    <input
                      type="text"
                      value={role.color}
                      onChange={(e) => updateRole(key, 'color', e.target.value)}
                      placeholder="inherit"
                      className="flex-1 h-9 bg-surface-container border border-outline-variant/30 rounded-sm px-2 text-xs text-on-surface font-mono focus:border-primary/60 outline-none transition-colors"
                    />
                  </div>
                </Field>

                <Field label="Mnożnik rozmiaru">
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="range"
                      min="0.6"
                      max="2.0"
                      step="0.05"
                      value={role.sizeMultiplier}
                      onChange={(e) => updateRole(key, 'sizeMultiplier', parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs font-mono text-on-surface-variant w-10 text-center bg-surface-container rounded-sm py-1">
                      {role.sizeMultiplier.toFixed(2)}x
                    </span>
                  </div>
                </Field>
              </div>

              {/* Row 2: letter-spacing + font-stretch */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Odległość między znakami (letter-spacing)">
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="range"
                      min="-2"
                      max="10"
                      step="0.5"
                      value={role.letterSpacing}
                      onChange={(e) => updateRole(key, 'letterSpacing', parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs font-mono text-on-surface-variant w-14 text-center bg-surface-container rounded-sm py-1">
                      {role.letterSpacing.toFixed(1)}px
                    </span>
                  </div>
                </Field>

                <Field label="Szerokość znaków (font-stretch)">
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="5"
                      value={role.fontStretch}
                      onChange={(e) => updateRole(key, 'fontStretch', parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs font-mono text-on-surface-variant w-14 text-center bg-surface-container rounded-sm py-1">
                      {role.fontStretch.toFixed(0)}%
                    </span>
                  </div>
                </Field>
              </div>

              {/* Row 3: Shadow */}
              <div className="p-4 rounded-sm bg-surface-container-low/50 border border-outline-variant/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Cień tekstu</span>
                  <div className="flex gap-1">
                    {SHADOW_PRESETS.map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyShadowPreset(key, preset)}
                        className="px-2 py-0.5 text-[10px] rounded-sm border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <MiniLabel>kolor</MiniLabel>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={role.shadowColor || '#000000'}
                        onChange={(e) => updateRole(key, 'shadowColor', e.target.value)}
                        className="w-7 h-7 rounded-sm border border-outline-variant/30 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={role.shadowColor}
                        onChange={(e) => updateRole(key, 'shadowColor', e.target.value)}
                        placeholder="brak"
                        className="flex-1 h-7 bg-surface-container border border-outline-variant/30 rounded-sm px-1.5 text-[10px] text-on-surface font-mono focus:border-primary/60 outline-none"
                      />
                    </div>
                  </div>
                  <Slider label="rozmycie" value={role.shadowBlur} min={0} max={15} step={0.5} onChange={(v) => updateRole(key, 'shadowBlur', v)} />
                  <Slider label="wielkość" value={role.shadowSpread} min={0} max={5} step={0.5} onChange={(v) => updateRole(key, 'shadowSpread', v)} />
                  <Slider label="przesunięcie X" value={role.shadowX} min={-8} max={8} step={0.5} onChange={(v) => updateRole(key, 'shadowX', v)} />
                  <Slider label="przesunięcie Y" value={role.shadowY} min={-8} max={8} step={0.5} onChange={(v) => updateRole(key, 'shadowY', v)} />
                </div>
              </div>

              {/* Row 4: Outline */}
              <div className="p-4 rounded-sm bg-surface-container-low/50 border border-outline-variant/10 space-y-3">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Obrys (stroke)</span>
                <div className="grid grid-cols-[200px_1fr] gap-4">
                  <div>
                    <MiniLabel>kolor</MiniLabel>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={role.outlineColor || '#000000'}
                        onChange={(e) => updateRole(key, 'outlineColor', e.target.value)}
                        className="w-7 h-7 rounded-sm border border-outline-variant/30 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={role.outlineColor}
                        onChange={(e) => updateRole(key, 'outlineColor', e.target.value)}
                        placeholder="brak"
                        className="flex-1 h-7 bg-surface-container border border-outline-variant/30 rounded-sm px-1.5 text-[10px] text-on-surface font-mono focus:border-primary/60 outline-none"
                      />
                    </div>
                  </div>
                  <Slider label="grubość" value={role.outlineWidth} min={0} max={4} step={0.25} onChange={(v) => updateRole(key, 'outlineWidth', v)} />
                </div>
              </div>

              {/* Live preview */}
              <div className="p-5 rounded-sm bg-surface-dim/70 border border-outline-variant/10">
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">visibility</span>
                  Podgląd na żywo
                </div>
                <div
                  className="leading-relaxed"
                  style={{
                    fontFamily: role.font ? `'${role.font}', sans-serif` : 'inherit',
                    color: role.color || undefined,
                    fontSize: `${(role.sizeMultiplier * 28).toFixed(0)}px`,
                    letterSpacing: role.letterSpacing ? `${role.letterSpacing}px` : undefined,
                    fontStretch: role.fontStretch !== 100 ? `${role.fontStretch}%` : undefined,
                    textShadow: shadowStr,
                    WebkitTextStroke: outlineStr,
                  }}
                >
                  {preview}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* Save bar */}
      <div className="sticky bottom-0 py-4 px-6 -mx-6 bg-surface-dim/90 backdrop-blur-lg border-t border-outline-variant/15 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-bold uppercase tracking-widest rounded-sm bg-primary text-on-primary hover:bg-primary-dim disabled:opacity-50 transition-colors shadow-lg shadow-primary/20"
        >
          {saving ? 'Zapisuję…' : 'Zapisz konfigurację'}
        </button>
        {message && (
          <span className={`text-sm ${message.type === 'ok' ? 'text-tertiary' : 'text-error'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5 font-bold">{label}</div>
      {children}
    </div>
  );
}

function MiniLabel({ children }) {
  return <div className="text-[9px] text-on-surface-variant mb-1">{children}</div>;
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <MiniLabel>{label}</MiniLabel>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="text-[10px] font-mono text-on-surface-variant w-8 text-right">
          {Number(value).toFixed(step < 1 ? 1 : 0)}
        </span>
      </div>
    </div>
  );
}
