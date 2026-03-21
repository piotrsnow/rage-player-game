import { Component } from 'react';
import Button from './Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-dim flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <span className="material-symbols-outlined text-6xl text-error/40 mb-4 block">
              error
            </span>
            <h2 className="font-headline text-2xl text-tertiary mb-2">Something Went Wrong</h2>
            <p className="text-on-surface-variant text-sm mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
            >
              Return to Lobby
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
