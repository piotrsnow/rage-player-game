import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { storage } from '../../services/storage';
import { apiClient } from '../../services/apiClient';
import GlassCard from '../ui/GlassCard';

function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-4">
      <div className="h-px w-10 bg-gradient-to-r from-transparent to-primary/30" />
      <span className="material-symbols-outlined text-primary/30 text-[10px]">diamond</span>
      <div className="h-px w-10 bg-gradient-to-l from-transparent to-primary/30" />
    </div>
  );
}

function LoggedInBanner({ user, onLogout }) {
  const { t } = useTranslation();
  const [topChar, setTopChar] = useState(null);

  useEffect(() => {
    const chars = storage.getCharacters();
    if (chars.length > 0) {
      const sorted = [...chars].sort(
        (a, b) => (b.characterLevel || 1) - (a.characterLevel || 1),
      );
      setTopChar(sorted[0]);
    }
  }, []);

  const displayName = topChar?.name || t('lobby.adventurer');
  const level = topChar?.characterLevel || topChar?.level || 1;
  const species = topChar?.species;
  const portraitSrc = topChar?.portraitUrl
    ? apiClient.resolveMediaUrl(topChar.portraitUrl)
    : null;

  return (
    <div data-testid="logged-in-banner" className="holo-card p-4">
      <div className="flex gap-4 items-stretch">
        {/* Portrait */}
        <div className="w-24 shrink-0 rounded-lg overflow-hidden bg-surface-container-lowest/60 border border-outline-variant/10 flex items-center justify-center aspect-[3/4]">
          {portraitSrc ? (
            <img
              src={portraitSrc}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="material-symbols-outlined text-4xl text-primary/40">person</span>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col justify-between py-0.5 min-w-0">
          <div>
            <div className="inline-flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(197,154,255,0.9)] animate-pulse" />
              <span className="text-[9px] text-primary font-label uppercase tracking-[0.2em]">
                {t('lobby.connectedAs')}
              </span>
            </div>

            <h2 className="font-headline text-xl md:text-2xl text-tertiary tracking-wide truncate leading-tight">
              {t('lobby.welcomeBack', { name: displayName })}
            </h2>

            <div className="flex items-center gap-2 mt-1.5">
              {topChar && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-label uppercase tracking-wider">
                  <span className="material-symbols-outlined text-xs">star</span>
                  Lvl {level}
                </span>
              )}
              {species && (
                <span className="text-on-surface-variant/50 text-xs">{species}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            {user?.email && (
              <span className="text-outline/40 text-[10px] font-mono truncate">{user.email}</span>
            )}
            <button
              onClick={onLogout}
              className="shrink-0 text-[10px] text-outline/50 hover:text-error/70 font-label uppercase tracking-widest transition-colors"
            >
              {t('settings.backendLogout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionCheckBanner() {
  const { t } = useTranslation();

  return (
    <div className="text-center py-6">
      <span className="material-symbols-outlined text-primary/50 text-4xl mb-3 block animate-spin">
        progress_activity
      </span>
      <h3 className="font-headline text-tertiary text-lg tracking-wide">
        {t('common.loading')}
      </h3>
    </div>
  );
}

function LoginForm() {
  const { t } = useTranslation();
  const { backendLogin, backendRegister, settings } = useSettings();

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const defaultUrl = isLocalhost ? 'http://localhost:3001' : window.location.origin;

  const [serverUrl, setServerUrl] = useState(() => settings?.backendUrl || defaultUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const canSubmit = serverUrl.trim() && email && password && !loading;

  useEffect(() => {
    setServerUrl(settings?.backendUrl || defaultUrl);
  }, [settings?.backendUrl, defaultUrl]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await backendLogin(serverUrl.trim(), email, password);
      setSuccess(t('settings.backendLoginSuccess'));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setSuccess(null);
    if (password.length < 6) {
      setError(t('settings.backendPasswordTooShort'));
      return;
    }
    setLoading(true);
    try {
      await backendRegister(serverUrl.trim(), email, password);
      setSuccess(t('settings.backendRegisterSuccess'));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) handleLogin();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto" autoComplete="on">
      <div className="text-center mb-6">
        <span className="material-symbols-outlined text-primary/40 text-4xl mb-2 block">
          shield_person
        </span>
        <h3 className="font-headline text-tertiary text-lg tracking-wide">
          {t('lobby.loginTitle')}
        </h3>
        <p className="text-on-surface-variant/50 text-xs mt-1 max-w-xs mx-auto">
          {t('lobby.loginSubtitle')}
        </p>
      </div>

      <OrnamentalDivider />

      <input type="hidden" name="serverUrl" value={serverUrl} readOnly />

      <div className="space-y-4">
        <div>
          <label htmlFor="auth-email" className="block text-[10px] text-on-surface-variant/60 font-label uppercase tracking-widest mb-1.5">
            {t('settings.backendEmail')}
          </label>
          <input
            id="auth-email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full bg-transparent border-0 border-b border-outline-variant/15 focus:border-primary/40 focus:ring-0 text-sm py-2.5 px-1 placeholder:text-on-surface-variant/60 font-mono text-on-surface"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-[10px] text-on-surface-variant/60 font-label uppercase tracking-widest mb-1.5">
            {t('settings.backendPassword')}
          </label>
          <input
            id="auth-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            minLength={6}
            className="w-full bg-transparent border-0 border-b border-outline-variant/15 focus:border-primary/40 focus:ring-0 text-sm py-2.5 px-1 placeholder:text-on-surface-variant/60 text-on-surface-variant"
          />
          <p className="text-[10px] text-outline/30 mt-1">{t('settings.backendPasswordHint')}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-sm border bg-surface-tint/10 border-primary/25 text-primary text-xs font-headline uppercase tracking-widest hover:bg-surface-tint/20 hover:border-primary/40 transition-all disabled:opacity-30 disabled:hover:bg-surface-tint/10"
          >
            {loading ? t('common.loading') : t('settings.backendLogin')}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-sm border border-outline-variant/15 text-on-surface-variant text-xs font-headline uppercase tracking-widest hover:border-primary/25 hover:text-primary transition-all disabled:opacity-30"
          >
            {t('settings.backendRegister')}
          </button>
        </div>

        {error && (
          <div data-testid="auth-error" className="flex items-center gap-2 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-xs font-headline animate-slide-up">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}
        {success && (
          <div data-testid="auth-success" className="flex items-center gap-2 p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary text-xs font-headline animate-slide-up">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            {success}
          </div>
        )}
      </div>
    </form>
  );
}

export default function AuthPanel() {
  const { backendUser, backendLogout, backendAuthChecking } = useSettings();

  if (!backendAuthChecking && backendUser) {
    return (
      <div className="w-full max-w-md animate-slide-up relative z-10" style={{ animationDelay: '0.1s' }}>
        <LoggedInBanner user={backendUser} onLogout={backendLogout} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-slide-up relative z-10" style={{ animationDelay: '0.1s' }}>
      <GlassCard elevated className="p-8 md:p-10">
        {backendAuthChecking ? (
          <SessionCheckBanner />
        ) : (
          <LoginForm />
        )}
      </GlassCard>
    </div>
  );
}
