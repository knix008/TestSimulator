import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '../i18n';

const STORAGE_KEY = 'myproject.gridPaneWidth';
export const SPLIT_PANE_RESIZE_END_EVENT = 'myproject:split-pane-resize-end';
const DEFAULT_GRID_WIDTH = 552;
const GRID_PANE_MIN = 200;
const GANTT_PANE_MIN = 300;
const SPLITTER_WIDTH = 5;

function loadStoredGridWidth(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < GRID_PANE_MIN) return null;
    return value;
  } catch {
    return null;
  }
}

function clampGridWidth(width: number, containerWidth: number): number {
  const maxWidth = Math.max(GRID_PANE_MIN, containerWidth - GANTT_PANE_MIN - SPLITTER_WIDTH);
  return Math.min(maxWidth, Math.max(GRID_PANE_MIN, width));
}

interface ProjectSplitPaneProps {
  gridPane: ReactNode;
  ganttPane: ReactNode;
}

export function ProjectSplitPane({ gridPane, ganttPane }: ProjectSplitPaneProps) {
  const t = useTranslation();
  const splitRef = useRef<HTMLDivElement>(null);
  const gridWidthRef = useRef(loadStoredGridWidth() ?? DEFAULT_GRID_WIDTH);
  const [gridPaneWidth, setGridPaneWidth] = useState(gridWidthRef.current);
  const [isResizing, setIsResizing] = useState(false);

  const applyWidth = useCallback((width: number) => {
    const container = splitRef.current;
    if (!container) return;
    const next = clampGridWidth(width, container.getBoundingClientRect().width);
    gridWidthRef.current = next;
    setGridPaneWidth(next);
  }, []);

  useEffect(() => {
    const container = splitRef.current;
    if (!container) return;

    const stored = loadStoredGridWidth();
    if (stored != null) {
      applyWidth(stored);
      return;
    }

    const initial = clampGridWidth(
      Math.round(container.getBoundingClientRect().width * 0.42),
      container.getBoundingClientRect().width,
    );
    applyWidth(initial);
  }, [applyWidth]);

  useEffect(() => {
    const container = splitRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      applyWidth(gridWidthRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyWidth]);

  const handleSplitterMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const container = splitRef.current;
      if (!container) return;

      const startX = event.clientX;
      const startWidth = gridWidthRef.current;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        applyWidth(startWidth + delta);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsResizing(false);
        try {
          localStorage.setItem(STORAGE_KEY, String(gridWidthRef.current));
        } catch {
          // Ignore storage failures.
        }
        window.dispatchEvent(new CustomEvent(SPLIT_PANE_RESIZE_END_EVENT));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [applyWidth],
  );

  return (
    <div className="project-split" ref={splitRef}>
      <div className="project-grid-pane" style={{ width: `${gridPaneWidth}px` }}>
        {gridPane}
      </div>
      <div
        className={`project-split-divider${isResizing ? ' dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={gridPaneWidth}
        aria-valuemin={GRID_PANE_MIN}
        aria-label={t('splitPane.divider')}
        tabIndex={0}
        onMouseDown={handleSplitterMouseDown}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            applyWidth(gridWidthRef.current - 16);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            applyWidth(gridWidthRef.current + 16);
          }
        }}
      />
      <div className="project-gantt-pane">{ganttPane}</div>
    </div>
  );
}
