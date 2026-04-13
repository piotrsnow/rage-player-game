import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';
import Toggle from '../../ui/Toggle';

export function SfxSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  return (
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
        <Toggle
          checked={!!settings.sfxEnabled}
          onClick={() => updateSettings({ sfxEnabled: !settings.sfxEnabled })}
        />
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
  );
}

export function MusicSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  return (
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
        <Toggle
          checked={!!settings.localMusicEnabled}
          onClick={() => updateSettings({ localMusicEnabled: !settings.localMusicEnabled })}
        />
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
  );
}
