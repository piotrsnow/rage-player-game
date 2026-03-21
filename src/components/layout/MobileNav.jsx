import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function MobileNav() {
  const location = useLocation();
  const { t } = useTranslation();

  const mobileItems = [
    { path: '/play', icon: 'casino', label: t('nav.play') },
    { path: '/character', icon: 'backpack', label: t('nav.character') },
    { path: '/settings', icon: 'psychology', label: t('nav.settings') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 w-full h-20 bg-[#0e0e10]/90 backdrop-blur-2xl border-t border-primary/10 flex justify-around items-center px-4 pb-2 z-50 shadow-[0_-10px_30px_rgba(149,71,247,0.1)]">
      {mobileItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center p-2 transition-all active:scale-90 duration-150 ${
              isActive
                ? 'bg-gradient-to-tr from-primary-dim/20 to-primary/20 text-primary rounded-xl shadow-[0_0_15px_rgba(197,154,255,0.2)]'
                : 'text-on-surface-variant hover:text-tertiary'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-label font-medium text-[10px] uppercase tracking-widest mt-1">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
