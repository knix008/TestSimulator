// Last line of defence: a rendering error would otherwise unmount the whole
// app (blank window). Instead the error is shown with a way to reload — the
// session brings the tabs back.
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('render error', error, info && info.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h2>My Editor — 오류가 발생했습니다 / Something went wrong</h2>
        <p>화면을 그리는 중 오류가 나서 편집기를 다시 열어야 합니다. 열려 있던 문서는 세션에서 복원됩니다.<br />A rendering error occurred; reload the editor — the open documents come back from the session.</p>
        <pre className="selectable">{String(error && (error.stack || error.message || error))}</pre>
        <button className="btn primary" onClick={() => window.location.reload()}>다시 열기 / Reload</button>
      </div>
    );
  }
}

export default ErrorBoundary;
