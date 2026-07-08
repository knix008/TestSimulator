import { useEffect, useId } from 'react';
import { useStatusBar } from '../context/StatusBarContext.jsx';

export function useStatusBarReport({ hint, activity, activityKind = 'info', message } = {}) {
  const { setPageReport, clearPageReport } = useStatusBar();
  const pageId = useId();

  useEffect(() => {
    if (!hint && !activity && !message) {
      clearPageReport(pageId);
      return;
    }
    setPageReport(pageId, { hint, activity, activityKind, message });
  }, [pageId, hint, activity, activityKind, message, setPageReport, clearPageReport]);

  useEffect(() => () => clearPageReport(pageId), [pageId, clearPageReport]);
}
