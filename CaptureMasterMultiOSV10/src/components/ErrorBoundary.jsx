import React from 'react';
import { platform } from '../lib/platform.js';
import { describeError } from '../lib/errors.js';

/**
 * Last line of defence: a render error would otherwise blank the window with
 * no explanation. The details are shown in place (with a copy button) so the
 * user can report them even when the rest of the UI is gone.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const d = describeError(error, 'render');
    const text = `${d.name}: ${d.message}\n\n${d.stack}`;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#eee', background: '#1a1a1a', height: '100%', overflow: 'auto', userSelect: 'text' }}>
        <h2 style={{ marginTop: 0 }}>CaptureMaster — unexpected error / 예기치 않은 오류</h2>
        <p>{d.message}</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 12, borderRadius: 6, fontSize: 12 }}>{d.stack}</pre>
        <button onClick={() => platform.clipboard.writeText(text)} style={{ padding: '6px 14px' }}>Copy / 복사</button>
        <button onClick={() => window.location.reload()} style={{ padding: '6px 14px', marginLeft: 8 }}>Reload / 다시 시작</button>
      </div>
    );
  }
}
