import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { MusicProvider } from '../../contexts/MusicContext';

export default function Layout() {
  return (
    <MusicProvider>
      <div className="min-h-screen bg-surface-dim">
        <Header />
        <Sidebar />
        <main className="lg:pl-64 pt-16 pb-24 lg:pb-0 min-h-screen">
          <Outlet />
        </main>
        <MobileNav />
        <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03] mix-blend-overlay">
          <div className="absolute inset-0 noise-overlay" />
        </div>
      </div>
    </MusicProvider>
  );
}
