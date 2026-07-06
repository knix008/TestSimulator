import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ProjectSplitPane } from '@web/components/ProjectSplitPane';
import './DesktopThreePaneLayout.css';

interface DesktopThreePaneLayoutProps {
  gridPane: ReactNode;
  ganttPane: ReactNode;
  propertiesPane: ReactNode | null;
  propertiesVisible: boolean;
  initialPropertiesWidth?: number;
  onPropertiesWidthChange?: (width: number) => void;
}

const MIN_PROPERTIES_WIDTH = 220;
const MAX_PROPERTIES_WIDTH = 420;
const DEFAULT_PROPERTIES_WIDTH = 260;

export function DesktopThreePaneLayout({
  gridPane,
  ganttPane,
  propertiesPane,
  propertiesVisible,
  initialPropertiesWidth = DEFAULT_PROPERTIES_WIDTH,
  onPropertiesWidthChange,
}: DesktopThreePaneLayoutProps) {
  const propertiesWidthRef = useRef(initialPropertiesWidth);
  const [propertiesWidth, setPropertiesWidth] = useState(initialPropertiesWidth);
  const [isResizingProperties, setIsResizingProperties] = useState(false);

  useEffect(() => {
    const clamped = Math.max(MIN_PROPERTIES_WIDTH, Math.min(MAX_PROPERTIES_WIDTH, initialPropertiesWidth));
    propertiesWidthRef.current = clamped;
    setPropertiesWidth(clamped);
  }, [initialPropertiesWidth]);

  const applyPropertiesWidth = useCallback(
    (width: number) => {
      const next = Math.max(MIN_PROPERTIES_WIDTH, Math.min(MAX_PROPERTIES_WIDTH, width));
      propertiesWidthRef.current = next;
      setPropertiesWidth(next);
      onPropertiesWidthChange?.(next);
    },
    [onPropertiesWidthChange],
  );

  const handlePropertiesSplitterMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (!propertiesVisible) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = propertiesWidthRef.current;
      setIsResizingProperties(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        applyPropertiesWidth(startWidth - delta);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsResizingProperties(false);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [applyPropertiesWidth, propertiesVisible],
  );

  return (
    <div className="desktop-three-pane">
      <div className="desktop-three-pane__workspace">
        <ProjectSplitPane gridPane={gridPane} ganttPane={ganttPane} />
      </div>
      {propertiesPane && propertiesVisible && (
        <>
          <div
            className={`desktop-three-pane__splitter${isResizingProperties ? ' is-dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={propertiesWidth}
            onMouseDown={handlePropertiesSplitterMouseDown}
          />
          <aside className="desktop-three-pane__properties" style={{ width: propertiesWidth }}>
            {propertiesPane}
          </aside>
        </>
      )}
    </div>
  );
}
