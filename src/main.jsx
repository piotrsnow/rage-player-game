import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { GameProvider } from './contexts/GameContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { MultiplayerProvider } from './contexts/MultiplayerContext';
import ErrorBoundary from './components/ui/ErrorBoundary';
import BackendConnectivityGate from './components/ui/BackendConnectivityGate';
import { captureEntryIntent } from './services/entryIntent';
import './i18n';
import './index.css';

const initialPath = window.location.pathname + window.location.search + window.location.hash;
if (initialPath.startsWith('/play/')) {
  captureEntryIntent(initialPath);
  window.history.replaceState(null, '', '/');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <SettingsProvider>
          <BackendConnectivityGate>
            <MultiplayerProvider>
              <GameProvider>
                <App />
              </GameProvider>
            </MultiplayerProvider>
          </BackendConnectivityGate>
        </SettingsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  // </React.StrictMode>
);
