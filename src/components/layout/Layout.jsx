import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { MusicProvider } from '../../contexts/MusicContext';
import { ModalProvider, useModals } from '../../contexts/ModalContext';
import CharacterSheet from '../character/CharacterSheet';
import DMSettingsPage from '../settings/DMSettingsPage';

function ModalLayer() {
  const { characterSheetOpen, closeCharacterSheet, settingsOpen, closeSettings } = useModals();
  return (
    <>
      {characterSheetOpen && <CharacterSheet onClose={closeCharacterSheet} />}
      {settingsOpen && <DMSettingsPage onClose={closeSettings} />}
    </>
  );
}

export default function Layout() {
  return (
    <MusicProvider>
      <ModalProvider>
        <div className="min-h-screen bg-surface-dim">
          <Header />
          <Sidebar />
          <main className="lg:pl-64 pt-16 pb-24 lg:pb-0 min-h-screen">
            <Outlet />
          </main>
          <MobileNav />
          <ModalLayer />
          <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03] mix-blend-overlay">
            <div className="absolute inset-0 noise-overlay" />
          </div>
        </div>
      </ModalProvider>
    </MusicProvider>
  );
}
