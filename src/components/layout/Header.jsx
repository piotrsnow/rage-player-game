import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Header() {
  const location = useLocation();
  const { t } = useTranslation();

  const navLinks = [
    { path: '/', label: t('nav.lobby') },
    { path: '/play', label: t('nav.grimoire') },
    { path: '/character', label: t('nav.armory') },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0e0e10]/80 backdrop-blur-xl border-b border-[#48474a]/15 flex justify-between items-center px-6 h-16">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-xl font-bold tracking-tighter text-tertiary drop-shadow-[0_0_8px_rgba(197,154,255,0.3)] font-headline">
          {t('common.appName')}
        </Link>
      </div>
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex gap-8 items-center text-on-surface-variant font-label text-sm tracking-widest uppercase">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`transition-colors duration-300 ${
                location.pathname === link.path
                  ? 'text-primary'
                  : 'hover:text-tertiary'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            to="/play"
            className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-colors active:scale-95 duration-200 cursor-pointer"
          >
            auto_awesome
          </Link>
          <Link
            to="/settings"
            className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-colors active:scale-95 duration-200 cursor-pointer"
          >
            settings
          </Link>
          <Link to="/character" className="w-8 h-8 rounded-full border border-primary/30 overflow-hidden bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-sm">person</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
