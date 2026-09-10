// Catches a render-time crash and shows what happened.
//
// Without this a thrown error unmounts the whole tree and leaves a blank white
// window — which tells the user nothing and tells us nothing either. The point
// is not to keep a broken app running, but to make a failure legible: what
// threw, where, and a way back.

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Also surface it on the console, where the smoke test and devtools see it.
    console.error('[CodeFactory] render error:', error, info && info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <h1>화면을 그리는 중 오류가 발생했습니다 / Something went wrong</h1>
        <p className="crash-message">{String(error && error.message ? error.message : error)}</p>

        <div className="crash-actions">
          <button type="button" className="btn primary" onClick={() => this.setState({ error: null, info: null })}>
            다시 시도 / Try again
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            새로 고침 / Reload
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const text = String(error && error.stack ? error.stack : error) + '\n' + ((info && info.componentStack) || '');
              navigator.clipboard.writeText(text).catch(() => {});
            }}
          >
            오류 복사 / Copy details
          </button>
        </div>

        {error && error.stack ? <pre className="crash-stack">{error.stack}</pre> : null}
        {info && info.componentStack ? <pre className="crash-stack">{info.componentStack}</pre> : null}
      </div>
    );
  }
}
