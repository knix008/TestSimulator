import React, { useEffect, useState } from 'react';
import { ErrorDialog, ErrorReport } from './dialogs/Dialogs';

// A failure nobody caught, in any window. One while drawing would leave a blank window: the whole
// page becomes its report. One anywhere else appears over the page, which goes on working.
function Probe() {
  const [crash, setCrash] = useState(false);
  useEffect(() => {
    const on = () => setCrash(true);
    window.addEventListener('zm-test-crash', on);
    return () => window.removeEventListener('zm-test-crash', on);
  }, []);
  if (crash) throw new Error('zm-test-crash');
  return null;
}

// Not the program's fault, and harmless: the browser's own notes.
const isNoise = (message) => /ResizeObserver loop/.test(String(message));

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fatal: null, stray: null };
    this.onError = (event) => {
      const message = event.error?.message ?? event.message;
      if (isNoise(message)) return;
      this.setState({ stray: { detail: String(message), stack: event.error?.stack } });
    };
    this.onRejection = (event) => {
      const reason = event.reason;
      if (isNoise(reason?.message ?? reason)) return;
      this.setState({ stray: { detail: String(reason?.detail || reason?.message || reason), stack: reason?.stack } });
    };
  }

  static getDerivedStateFromError(error) {
    return { fatal: { detail: String(error?.message ?? error), stack: error?.stack } };
  }

  componentDidCatch(error, info) {
    this.setState({ fatal: { detail: String(error?.message ?? error), stack: `${error?.stack ?? ''}\n${info?.componentStack ?? ''}`.trim() } });
  }

  componentDidMount() {
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onRejection);
  }

  render() {
    const { fatal, stray } = this.state;
    if (fatal) return <ErrorReport detail={fatal.detail} stack={fatal.stack} />;
    return (
      <>
        <Probe />
        {this.props.children}
        {stray && <ErrorDialog code="unexpected" detail={stray.detail} stack={stray.stack} onClose={() => this.setState({ stray: null })} />}
      </>
    );
  }
}
