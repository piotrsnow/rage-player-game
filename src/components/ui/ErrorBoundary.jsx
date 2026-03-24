import { Component } from 'react';
import i18next from 'i18next';
import Button from './Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const t = i18next.t.bind(i18next);
      return (
        <div className="min-h-screen bg-surface-dim flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <span className="material-symbols-outlined text-6xl text-error/40 mb-4 block">
              error
            </span>
            <h2 className="font-headline text-2xl text-tertiary mb-2">{t('common.somethingWentWrong')}</h2>
            <p className="text-on-surface-variant text-sm mb-6">
              {this.state.error?.message || t('common.unexpectedError')}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
            >
              {t('common.returnToLobby')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
