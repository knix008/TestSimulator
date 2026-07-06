import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';
import type { NoteItem, TaskItem } from '../types/project';
import type { ProjectContextMenuTarget } from '../utils/projectContextMenu';
import {
  GANTT_NOTE_DRAG_THRESHOLD,
  getNoteConnectorPoints,
  getNoteDisplayText,
  getNoteRect,
  ganttXToDate,
  type GanttRect,
} from '../utils/ganttNoteLayout';
import { getTaskBarContentRect } from '../utils/projectNotes';
import './GanttNotesOverlay.css';

interface GanttLayout {
  ganttStart: Date;
  columnWidth: number;
}

interface GanttNotesOverlayProps {
  notes: NoteItem[];
  tasks: TaskItem[];
  containerRef: RefObject<HTMLDivElement | null>;
  getGanttLayout: () => GanttLayout | null;
  selectedNoteId: number | null;
  editingNoteId: number | null;
  canModify: boolean;
  onSelectNote: (noteId: number) => void;
  onSetEditingNoteId: (noteId: number | null) => void;
  onUpdateNoteBody: (noteId: number, body: string) => void;
  onUpdateNotePosition: (noteId: number, anchorDate: string, contentY: number) => void;
  onEnsureNoteVisible?: (contentY: number) => void;
  onNotePositionPreview?: (noteId: number, contentY: number) => void;
  onContextMenuRequest?: (target: ProjectContextMenuTarget, clientX: number, clientY: number) => void;
}

interface DragState {
  noteId: number;
  startMouseX: number;
  startMouseY: number;
  startAnchorDate: string;
  startContentY: number;
  previewAnchorDate: string;
  previewContentY: number;
  active: boolean;
}

function getFrappeHost(container: HTMLElement): HTMLElement | null {
  const host = container.querySelector(':scope > .gantt-container');
  return host instanceof HTMLElement ? host : null;
}

function noteAtPosition(
  notes: NoteItem[],
  layout: GanttLayout,
  x: number,
  y: number,
): NoteItem | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const rect = getNoteRect(note.anchorDate, note.contentY, layout.ganttStart, layout.columnWidth);
    if (
      x >= rect.left &&
      x <= rect.left + rect.width &&
      y >= rect.top &&
      y <= rect.top + rect.height
    ) {
      return note;
    }
  }
  return null;
}

export function GanttNotesOverlay({
  notes,
  tasks,
  containerRef,
  getGanttLayout,
  selectedNoteId,
  editingNoteId,
  canModify,
  onSelectNote,
  onSetEditingNoteId,
  onUpdateNoteBody,
  onUpdateNotePosition,
  onEnsureNoteVisible,
  onNotePositionPreview,
  onContextMenuRequest,
}: GanttNotesOverlayProps) {
  const t = useTranslation();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const layout = getGanttLayout();

  const refreshPortalHost = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      setPortalHost(null);
      return;
    }
    setPortalHost(getFrappeHost(container));
  }, [containerRef]);

  useEffect(() => {
    refreshPortalHost();
  }, [refreshPortalHost, notes.length, tasks.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const host = getFrappeHost(container);
    if (!host) return;

    const bump = () => setLayoutTick((value) => value + 1);
    host.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('resize', bump);

    const outerScroll = container.closest('.gantt-scroll');
    outerScroll?.addEventListener('scroll', bump, { passive: true });

    return () => {
      host.removeEventListener('scroll', bump);
      window.removeEventListener('resize', bump);
      outerScroll?.removeEventListener('scroll', bump);
    };
  }, [containerRef, portalHost]);

  useEffect(() => {
    if (editingNoteId != null) {
      editorRef.current?.focus();
      editorRef.current?.select();
    }
  }, [editingNoteId]);

  const noteRects = useMemo(() => {
    if (!layout) return new Map<number, GanttRect>();
    const map = new Map<number, GanttRect>();
    for (const note of notes) {
      const dragging = dragRef.current?.noteId === note.noteId;
      const anchorDate = dragging ? dragRef.current!.previewAnchorDate : note.anchorDate;
      const contentY = dragging ? dragRef.current!.previewContentY : note.contentY;
      map.set(
        note.noteId,
        getNoteRect(anchorDate, contentY, layout.ganttStart, layout.columnWidth),
      );
    }
    return map;
    // layoutTick keeps rects in sync while scrolling/zooming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, layout, layoutTick]);

  const commitEditor = useCallback(
    (noteId: number, value: string) => {
      const note = notes.find((entry) => entry.noteId === noteId);
      if (note && value !== note.body) {
        onUpdateNoteBody(noteId, value);
      }
      onSetEditingNoteId(null);
    },
    [notes, onSetEditingNoteId, onUpdateNoteBody],
  );

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag?.active) {
      dragRef.current = null;
      return;
    }

    const note = notes.find((entry) => entry.noteId === drag.noteId);
    if (
      note &&
      (note.anchorDate !== drag.previewAnchorDate || note.contentY !== drag.previewContentY)
    ) {
      onUpdateNotePosition(drag.noteId, drag.previewAnchorDate, drag.previewContentY);
    }
    dragRef.current = null;
    setLayoutTick((value) => value + 1);
  }, [notes, onUpdateNotePosition]);

  useEffect(() => {
    if (!canModify) return;

    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      const currentLayout = getGanttLayout();
      if (!drag || !currentLayout) return;

      if (!drag.active) {
        const dx = event.clientX - drag.startMouseX;
        const dy = event.clientY - drag.startMouseY;
        if (
          Math.abs(dx) < GANTT_NOTE_DRAG_THRESHOLD &&
          Math.abs(dy) < GANTT_NOTE_DRAG_THRESHOLD
        ) {
          return;
        }
        drag.active = true;
      }

      const deltaX = event.clientX - drag.startMouseX;
      const deltaY = event.clientY - drag.startMouseY;
      const deltaDays = Math.round(deltaX / currentLayout.columnWidth);
      const nextAnchor = new Date(drag.startAnchorDate);
      nextAnchor.setDate(nextAnchor.getDate() + deltaDays);
      drag.previewAnchorDate = nextAnchor.toISOString();
      drag.previewContentY = drag.startContentY + deltaY;
      onNotePositionPreview?.(drag.noteId, drag.previewContentY);
      setLayoutTick((value) => value + 1);
    };

    const onMouseUp = () => {
      if (!dragRef.current) return;
      finishDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [canModify, finishDrag, getGanttLayout, onNotePositionPreview]);

  if (!portalHost || !layout) return null;
  if (notes.length === 0) return null;

  const container = containerRef.current;
  const connectors = notes
    .map((note) => {
      if (note.taskId < 0 || !container) return null;
      const noteRect = noteRects.get(note.noteId);
      const barRect = getTaskBarContentRect(note.taskId, container);
      if (!noteRect || !barRect) return null;
      const points = getNoteConnectorPoints(noteRect, barRect);
      return { noteId: note.noteId, ...points };
    })
    .filter(Boolean) as Array<{ noteId: number; from: { x: number; y: number }; to: { x: number; y: number } }>;

  const layer = (
    <div className="gantt-notes-layer" aria-label={t('gantt.notesLayer')}>
      <svg className="gantt-notes-connectors" aria-hidden="true">
        {connectors.map((line) => (
          <line
            key={line.noteId}
            x1={line.from.x}
            y1={line.from.y}
            x2={line.to.x}
            y2={line.to.y}
            className="gantt-note-connector"
          />
        ))}
      </svg>

      {notes.map((note) => {
        const rect = noteRects.get(note.noteId);
        if (!rect) return null;

        const isSelected = selectedNoteId === note.noteId;
        const isEditing = editingNoteId === note.noteId;
        const isDragging = dragRef.current?.active && dragRef.current.noteId === note.noteId;
        const displayText = getNoteDisplayText(note.body, note.bodyRtf);

        return (
          <div
            key={note.noteId}
            className={[
              'gantt-note',
              isSelected ? 'selected' : '',
              isDragging ? 'dragging' : '',
              canModify ? 'editable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${rect.left}px`, top: `${rect.top}px` }}
            onMouseDown={(event) => {
              if (!canModify || event.button !== 0 || isEditing) return;
              event.stopPropagation();
              onSelectNote(note.noteId);
              onEnsureNoteVisible?.(note.contentY);
              dragRef.current = {
                noteId: note.noteId,
                startMouseX: event.clientX,
                startMouseY: event.clientY,
                startAnchorDate: note.anchorDate,
                startContentY: note.contentY,
                previewAnchorDate: note.anchorDate,
                previewContentY: note.contentY,
                active: false,
              };
            }}
            onDoubleClick={(event) => {
              if (!canModify) return;
              event.stopPropagation();
              onSelectNote(note.noteId);
              onSetEditingNoteId(note.noteId);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectNote(note.noteId);
              onContextMenuRequest?.({ kind: 'gantt-note', noteId: note.noteId }, event.clientX, event.clientY);
            }}
          >
            {isEditing ? (
              <textarea
                key={note.noteId}
                ref={editorRef}
                className="gantt-note-editor"
                defaultValue={note.body}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => commitEditor(note.noteId, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    onSetEditingNoteId(null);
                  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    commitEditor(note.noteId, event.currentTarget.value);
                  }
                }}
              />
            ) : (
              <div className="gantt-note-text">{displayText || ' '}</div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!portalHost || !layout) return null;
  return createPortal(layer, portalHost);
}

export function hitTestGanttNote(
  notes: NoteItem[],
  getGanttLayout: () => GanttLayout | null,
  container: HTMLElement,
  clientX: number,
  clientY: number,
): NoteItem | null {
  const host = getFrappeHost(container);
  const layout = getGanttLayout();
  if (!host || !layout) return null;

  const hostRect = host.getBoundingClientRect();
  const x = clientX - hostRect.left + host.scrollLeft;
  const y = clientY - hostRect.top + host.scrollTop;
  return noteAtPosition(notes, layout, x, y);
}

export function clientToGanttContentPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const host = getFrappeHost(container);
  if (!host) return null;
  const hostRect = host.getBoundingClientRect();
  return {
    x: clientX - hostRect.left + host.scrollLeft,
    y: clientY - hostRect.top + host.scrollTop,
  };
}

export function contentPointToAnchorDate(
  x: number,
  layout: GanttLayout,
): string {
  return ganttXToDate(x, layout.ganttStart, layout.columnWidth).toISOString();
}
