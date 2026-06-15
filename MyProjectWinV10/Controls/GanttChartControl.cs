using MyProject.Forms;
using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace MyProject.Controls
{
    public class GanttChartControl : Control
    {
        private ProjectModel? _model;
        private readonly GanttViewport _viewport = new();
        private TimeScaleRenderer? _timeScaleRenderer;
        private TaskBarRenderer? _taskBarRenderer;
        private DependencyRenderer? _depRenderer;
        private NoteRenderer? _noteRenderer;

        private int _selectedNoteId = -1;
        private bool _noteModeActive = false;
        private bool _isDraggingNote = false;
        private int _dragNoteId = -1;
        private Point _dragNoteStartMouse;
        private DateTime _dragNoteStartAnchorDate;
        private int _dragNoteStartContentY;
        private DateTime _dragNotePreviewAnchorDate;
        private int _dragNotePreviewContentY;

        private RichTextBox? _noteInlineEditor;
        private int _editingNoteId = -1;

        private int _selectedTaskId = -1;
        private int _hoveredTaskId = -1;
        private int _scrollY = 0;

        // Link preview (silhouette line while choosing successor)
        private bool _linkModeActive;
        private int _linkSourceId = -1;
        private int _linkTargetId = -1;
        private DependencyType _linkPreviewType = DependencyType.FS;
        private Point? _linkPreviewMousePoint;

        // Drag state
        private bool _isDragging = false;
        private bool _isResizingRight = false;
        private bool _isResizingLeft = false;
        private Point _dragStartMouse;
        private DateTime _dragStartDate;
        private int _dragStartDuration;
        private int _dragTaskId = -1;

        // Pan state
        private bool _isPanning = false;
        private int _panStartX;
        private DateTime _panStartDate;

        // Scrollbar
        private VScrollBar _vScrollBar;
        private HScrollBar _hScrollBar;
        private bool _isSyncingHorizontalScroll;

        private int _paintClipBottom;
        private bool _paintExportMode;
        private bool _paintTransparentBackground;

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? TaskHovered;
        public event EventHandler<int>? LinkShapeClicked;
        public event EventHandler<int>? TaskDoubleClicked;
        public event EventHandler<int>? NoteSelected;
        public event EventHandler? ModelChanged;
        public event EventHandler<int>? ScrollYChanged;
        public event EventHandler<ContextMenuRequestEventArgs>? ContextMenuRequested;
        public event EventHandler? ViewZoomChanged;

        public GanttViewport Viewport => _viewport;
        public int SelectedTaskId => _selectedTaskId;
        public int SelectedNoteId => _selectedNoteId;
        public bool NoteModeActive => _noteModeActive;

        public bool ShowCriticalPath
        {
            get => _showCriticalPath;
            set
            {
                if (_showCriticalPath == value)
                    return;
                _showCriticalPath = value;
                Invalidate();
            }
        }

        private bool _showCriticalPath;

        public void SetNoteModeActive(bool active)
        {
            _noteModeActive = active;
            Invalidate();
        }

        public void ClearNoteSelection()
        {
            _selectedNoteId = -1;
            Invalidate();
        }

        public void BeginInlineNoteEdit(int noteId)
        {
            if (_model == null)
                return;

            EndInlineNoteEdit(true);

            var note = _model.GetNote(noteId);
            if (note == null)
                return;

            _selectedNoteId = noteId;
            _editingNoteId = noteId;

            var rect = GetNoteScreenRect(note);
            _noteInlineEditor = new RichTextBox
            {
                Multiline = true,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = NoteRenderer.NoteEditorBack,
                Font = NoteRenderer.NoteEditorFont,
                Location = new Point(rect.X, rect.Y),
                Size = new Size(rect.Width, rect.Height),
                ScrollBars = RichTextBoxScrollBars.Vertical,
                DetectUrls = false
            };
            NoteRtfHelper.ApplyToRichTextBox(_noteInlineEditor, note.BodyRtf, note.Body);
            _noteInlineEditor.KeyDown += OnNoteInlineEditorKeyDown;
            _noteInlineEditor.LostFocus += OnNoteInlineEditorLostFocus;
            Controls.Add(_noteInlineEditor);
            _noteInlineEditor.BringToFront();
            _noteInlineEditor.Focus();
            _noteInlineEditor.SelectAll();
            Invalidate();
        }

        public void EndInlineNoteEdit(bool commit)
        {
            var editor = _noteInlineEditor;
            if (editor == null)
                return;

            int noteId = _editingNoteId;
            _noteInlineEditor = null;
            _editingNoteId = -1;

            editor.LostFocus -= OnNoteInlineEditorLostFocus;
            editor.KeyDown -= OnNoteInlineEditorKeyDown;

            if (commit && noteId >= 0 && _model != null)
                _model.UpdateNoteRtf(noteId, NoteRtfHelper.GetRtfFromRichTextBox(editor));

            Controls.Remove(editor);
            editor.Dispose();
            Invalidate();
        }

        public void AddNoteForTask(int taskId)
        {
            if (_model == null)
                return;

            var task = _model.GetTask(taskId);
            if (task == null)
                return;

            var note = _model.AddNote(taskId);
            _selectedNoteId = note.Id;
            _selectedTaskId = taskId;
            NoteSelected?.Invoke(this, note.Id);
            TaskSelected?.Invoke(this, taskId);
            Invalidate();
        }

        private Rectangle GetNoteScreenRect(ProjectNote note)
        {
            var hitRects = BuildNoteHitRects();
            return hitRects.GetValueOrDefault(note.Id, new Rectangle(0, 0, NoteRenderer.NoteWidth, NoteRenderer.NoteHeight));
        }

        private void OnNoteInlineEditorLostFocus(object? sender, EventArgs e)
        {
            EndInlineNoteEdit(true);
        }

        private void OnNoteInlineEditorKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                EndInlineNoteEdit(false);
                e.Handled = true;
                e.SuppressKeyPress = true;
            }
        }

        public GanttChartControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.UserPaint |
                     ControlStyles.DoubleBuffer |
                     ControlStyles.ResizeRedraw, true);

            _vScrollBar = new VScrollBar
            {
                Dock = DockStyle.Right,
                SmallChange = AppTheme.RowHeight,
                LargeChange = AppTheme.RowHeight * 5
            };
            _hScrollBar = new HScrollBar
            {
                Dock = DockStyle.Bottom,
                SmallChange = AppTheme.DefaultDayWidth,
                LargeChange = AppTheme.DefaultDayWidth * 7
            };

            _vScrollBar.Scroll += (s, e) => { _scrollY = _vScrollBar.Value; ScrollYChanged?.Invoke(this, _scrollY); Invalidate(); };
            _hScrollBar.Scroll += (s, e) =>
            {
                if (_isSyncingHorizontalScroll)
                    return;

                _viewport.ViewStartDate = GetTimelineScrollOrigin()
                    .AddDays((double)_hScrollBar.Value / _viewport.DayWidth);
                Invalidate();
            };

            Controls.Add(_vScrollBar);
            Controls.Add(_hScrollBar);

            MouseDown += OnMouseDown;
            MouseMove += OnMouseMove;
            MouseUp += OnMouseUp;
            MouseWheel += OnMouseWheel;
            MouseDoubleClick += OnMouseDoubleClick;
            MouseEnter += OnMouseEnter;
            MouseLeave += (_, _) => NotifyTaskHovered(-1);
            Resize += (s, e) => UpdateScrollbars();
        }

        public void DetachModel()
        {
            if (_model != null)
                _model.ModelChanged -= OnModelChanged;
            _model = null;
        }

        public void PrepareForShutdown()
        {
            EndInlineNoteEdit(false);

            _isDraggingNote = false;
            _isDragging = false;
            _isResizingRight = false;
            _isResizingLeft = false;
            _isPanning = false;
            _dragNoteId = -1;
            _dragTaskId = -1;
            Capture = false;
        }

        public void SetModel(ProjectModel model)
        {
            if (_model != null) _model.ModelChanged -= OnModelChanged;
            _model = model;
            _model.ModelChanged += OnModelChanged;

            _viewport.ViewStartDate = model.GetTimelineScrollOrigin();
            _timeScaleRenderer = new TimeScaleRenderer(_viewport);
            _taskBarRenderer = new TaskBarRenderer(_viewport);
            _depRenderer = new DependencyRenderer(_viewport, _taskBarRenderer);
            _noteRenderer = new NoteRenderer(_viewport);

            UpdateScrollbars();
            Invalidate();
        }

        private void OnModelChanged(object? sender, EventArgs e)
        {
            UpdateScrollbars();
            Invalidate();
        }

        public void SetSelectedTask(int taskId)
        {
            _selectedTaskId = taskId;
            Invalidate();
        }

        public void SetLinkPreview(bool active, int sourceId, int targetId, DependencyType type)
        {
            bool changed = _linkModeActive != active
                || _linkSourceId != sourceId
                || _linkTargetId != targetId
                || _linkPreviewType != type;

            _linkModeActive = active;
            _linkSourceId = sourceId;
            _linkTargetId = targetId;
            _linkPreviewType = type;
            if (!active)
                _linkPreviewMousePoint = null;

            if (changed)
                Invalidate();
        }

        public void ClearLinkPreview()
        {
            _linkPreviewMousePoint = null;
            SetLinkPreview(false, -1, -1, DependencyType.FS);
        }

        public void ScrollToTask(int taskId)
        {
            if (_model == null) return;
            var visibleTasks = _model.GetVisibleTasks().ToList();
            int idx = visibleTasks.FindIndex(t => t.Id == taskId);
            if (idx < 0) return;

            int rowY = idx * AppTheme.RowHeight - _scrollY;
            int chartH = GetChartAreaHeight();

            if (rowY < 0)
                _scrollY = Math.Max(0, idx * AppTheme.RowHeight);
            else if (rowY + AppTheme.RowHeight > chartH)
                _scrollY = idx * AppTheme.RowHeight - chartH + AppTheme.RowHeight;

            _vScrollBar.Value = Math.Min(_scrollY, Math.Max(0, _vScrollBar.Maximum));
            Invalidate();
        }

        public void SyncScrollY(int scrollY)
        {
            _scrollY = scrollY;
            _vScrollBar.Value = Math.Min(scrollY, Math.Max(0, _vScrollBar.Maximum));
            Invalidate();
        }

        public void ZoomIn()
        {
            _viewport.ZoomIn();
            ScrollToTimelineOrigin();
            UpdateScrollbars();
            Invalidate();
            ViewZoomChanged?.Invoke(this, EventArgs.Empty);
        }

        public void ZoomOut()
        {
            _viewport.ZoomOut();
            ScrollToTimelineOrigin();
            UpdateScrollbars();
            Invalidate();
            ViewZoomChanged?.Invoke(this, EventArgs.Empty);
        }

        public void ResetZoom()
        {
            _viewport.ResetZoom();
            ScrollToTimelineOrigin();
            UpdateScrollbars();
            Invalidate();
            ViewZoomChanged?.Invoke(this, EventArgs.Empty);
        }

        public void GoToToday()
        {
            _viewport.ScrollToDate(DateTime.Today);
            SyncHorizontalScrollFromViewport();
            Invalidate();
        }

        public void ApplyDayWidth(int dayWidth)
        {
            _viewport.ApplyDayWidth(dayWidth);
            UpdateScrollbars();
            Invalidate();
        }

        /// <summary>Renders the full Gantt chart (timeline + tasks + notes) to a bitmap.</summary>
        public Bitmap ExportToBitmap(bool transparentBackground)
        {
            if (_model == null || _timeScaleRenderer == null)
                throw new InvalidOperationException("No project is loaded.");

            var (width, height, chartStart) = CalculateExportDimensions();

            var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(bitmap);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var savedViewStart = _viewport.ViewStartDate;
            var savedChartLeft = _viewport.ChartLeft;
            var savedChartWidth = _viewport.ChartWidth;
            var savedScrollY = _scrollY;
            var savedClipBottom = _paintClipBottom;
            var savedExportMode = _paintExportMode;
            var savedTransparent = _paintTransparentBackground;

            try
            {
                _viewport.ViewStartDate = chartStart;
                _viewport.ChartLeft = 0;
                _viewport.ChartWidth = width;
                _scrollY = 0;
                _paintClipBottom = height;
                _paintExportMode = true;
                _paintTransparentBackground = transparentBackground;

                var chartArea = new Rectangle(0, AppTheme.TimescaleHeaderHeight, width, height - AppTheme.TimescaleHeaderHeight);
                PaintChart(g, chartArea, drawBorders: false);
            }
            finally
            {
                _viewport.ViewStartDate = savedViewStart;
                _viewport.ChartLeft = savedChartLeft;
                _viewport.ChartWidth = savedChartWidth;
                _scrollY = savedScrollY;
                _paintClipBottom = savedClipBottom;
                _paintExportMode = savedExportMode;
                _paintTransparentBackground = savedTransparent;
            }

            return bitmap;
        }

        private (int width, int height, DateTime chartStart) CalculateExportDimensions()
        {
            DateTime chartStart = _model!.GetTimelineScrollOrigin();
            DateTime chartEnd = _model.GetProjectEnd().Date.AddDays(7);
            if (chartEnd < chartStart)
                chartEnd = chartStart.AddDays(30);

            int totalDays = (chartEnd - chartStart).Days + 1;
            int width = Math.Max(totalDays * _viewport.DayWidth, _viewport.DayWidth);

            int taskRows = _model.GetVisibleTasks().Count();
            int contentHeight = AppTheme.TimescaleHeaderHeight + taskRows * AppTheme.RowHeight;

            int maxNoteBottom = contentHeight;
            foreach (var note in _model.Notes)
                maxNoteBottom = Math.Max(maxNoteBottom, note.ContentY + NoteRenderer.NoteHeight + 16);

            int height = maxNoteBottom;
            return (width, height, chartStart);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            _paintClipBottom = Height;
            _paintExportMode = false;
            _paintTransparentBackground = false;

            if (DesignTime.IsActive && _model == null)
            {
                e.Graphics.Clear(BackColor);
                return;
            }

            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var chartArea = GetChartArea();
            PaintChart(g, chartArea, drawBorders: true);
        }

        private void PaintChart(Graphics g, Rectangle chartArea, bool drawBorders)
        {
            _viewport.ChartLeft = chartArea.Left;
            _viewport.ChartWidth = chartArea.Width;

            if (_paintTransparentBackground)
                g.Clear(Color.Transparent);
            else
                DrawBackground(g, chartArea);

            _timeScaleRenderer?.DrawWeekendShading(g, chartArea);
            _timeScaleRenderer?.DrawVerticalGridLines(g, chartArea);
            DrawHorizontalGridLines(g, chartArea);
            DrawRows(g, chartArea);
            _timeScaleRenderer?.DrawTodayLine(g, chartArea);

            var headerRect = new Rectangle(chartArea.Left, 0, chartArea.Width, AppTheme.TimescaleHeaderHeight);
            _timeScaleRenderer?.Draw(g, headerRect);

            if (drawBorders)
                DrawBorders(g);
        }

        private void DrawBackground(Graphics g, Rectangle chartArea)
        {
            using var brush = new SolidBrush(AppTheme.SurfaceColor);
            g.FillRectangle(brush, chartArea);
        }

        private void DrawHorizontalGridLines(Graphics g, Rectangle chartArea)
        {
            if (_model == null) return;
            var visibleTasks = _model.GetVisibleTasks().ToList();
            using var pen = new Pen(AppTheme.GridLineColor);

            for (int i = 0; i < visibleTasks.Count; i++)
            {
                int rowY = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;
                if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                if (rowY > _paintClipBottom) break;

                // Alternate row coloring
                if (i % 2 == 1)
                {
                    using var altBrush = new SolidBrush(AppTheme.RowAltColor);
                    g.FillRectangle(altBrush, chartArea.Left, rowY, chartArea.Width, AppTheme.RowHeight);
                }

                g.DrawLine(pen, chartArea.Left, rowY + AppTheme.RowHeight - 1, chartArea.Right, rowY + AppTheme.RowHeight - 1);
            }
        }

        private void DrawRows(Graphics g, Rectangle chartArea)
        {
            if (_model == null || _taskBarRenderer == null || _depRenderer == null) return;
            _taskBarRenderer.ShowCriticalPath = ShowCriticalPath;
            var visibleTasks = _model.GetVisibleTasks().ToList();

            var rowYByTaskId = new Dictionary<int, int>();
            for (int i = 0; i < visibleTasks.Count; i++)
                rowYByTaskId[visibleTasks[i].Id] = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;

            int selectedTaskId = _paintExportMode ? -1 : _selectedTaskId;
            int hoveredTaskId = _paintExportMode ? -1 : _hoveredTaskId;
            int selectedNoteId = _paintExportMode ? -1 : _selectedNoteId;
            bool linkModeActive = !_paintExportMode && _linkModeActive;

            // Hover/select row highlight
            if (!_paintExportMode)
            {
                foreach (var task in visibleTasks)
                {
                    int rowY = rowYByTaskId[task.Id];
                    if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                    if (rowY > _paintClipBottom) break;

                    if (task.Id == selectedTaskId)
                    {
                        using var selBrush = new SolidBrush(Color.FromArgb(60, AppTheme.Accent));
                        g.FillRectangle(selBrush, chartArea.Left, rowY, chartArea.Width, AppTheme.RowHeight);
                    }
                    else if (task.Id == hoveredTaskId)
                    {
                        using var hoverBrush = new SolidBrush(Color.FromArgb(30, AppTheme.Accent));
                        g.FillRectangle(hoverBrush, chartArea.Left, rowY, chartArea.Width, AppTheme.RowHeight);
                    }
                }
            }

            // Dependency arrows (drawn behind bars)
            var clip = g.Clip;
            g.SetClip(chartArea);
            _depRenderer.DrawDependencies(
                g,
                _model.Dependencies,
                visibleTasks,
                id => rowYByTaskId.GetValueOrDefault(id, -999),
                ShowCriticalPath,
                dep => _model.IsDependencyOnCriticalPath(dep));

            if (ShowCriticalPath)
                _depRenderer.DrawCriticalPathChain(
                    g,
                    _model.CriticalPathLinks,
                    visibleTasks,
                    id => rowYByTaskId.GetValueOrDefault(id, -999));

            if (linkModeActive
                && _linkSourceId >= 0
                && rowYByTaskId.TryGetValue(_linkSourceId, out int srcRowY))
            {
                var pred = visibleTasks.FirstOrDefault(t => t.Id == _linkSourceId);
                if (pred != null)
                {
                    if (_linkTargetId >= 0
                        && _linkTargetId != _linkSourceId
                        && rowYByTaskId.TryGetValue(_linkTargetId, out int tgtRowY))
                    {
                        var succ = visibleTasks.FirstOrDefault(t => t.Id == _linkTargetId);
                        if (succ != null)
                            _depRenderer.DrawPreview(g, _linkPreviewType, pred, succ, srcRowY, tgtRowY);
                    }
                    else if (_linkPreviewMousePoint.HasValue)
                    {
                        _depRenderer.DrawPreviewToPoint(
                            g,
                            _linkPreviewType,
                            pred,
                            srcRowY,
                            _linkPreviewMousePoint.Value.X,
                            _linkPreviewMousePoint.Value.Y);
                    }
                }
            }

            // Task bars
            foreach (var task in visibleTasks)
            {
                int rowY = rowYByTaskId[task.Id];
                if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                if (rowY > _paintClipBottom) break;

                string assignee = _model.GetTaskAssigneeDisplay(task.Id);
                bool isLinkSource = linkModeActive && task.Id == _linkSourceId;
                _taskBarRenderer.DrawTaskBar(g, task, rowY, task.Id == selectedTaskId, task.Id == hoveredTaskId, assignee);

                if (isLinkSource)
                {
                    var barRect = _taskBarRenderer.GetTaskBarRect(task, rowY);
                    int radius = TaskBarRenderer.GetTaskBarCornerRadius(barRect.Height);
                    using var outlinePen = new Pen(AppTheme.Accent, 2f);
                    g.DrawRoundedRectangle(outlinePen, barRect, radius);
                }
            }
            DrawNotes(g, chartArea, visibleTasks, rowYByTaskId, selectedNoteId);
            g.Clip = clip;
        }

        private void DrawNotes(
            Graphics g,
            Rectangle chartArea,
            List<ProjectTask> visibleTasks,
            Dictionary<int, int> rowYByTaskId,
            int selectedNoteId)
        {
            if (_model == null || _noteRenderer == null || _taskBarRenderer == null)
                return;

            foreach (var note in _model.Notes.OrderBy(n => n.Id))
            {
                if (_isDraggingNote && note.Id == _dragNoteId)
                    continue;

                var noteRect = _noteRenderer.GetNoteRect(note, _scrollY);
                if (noteRect.Bottom < AppTheme.TimescaleHeaderHeight || noteRect.Top > _paintClipBottom)
                    continue;
                if (noteRect.Right < chartArea.Left || noteRect.Left > chartArea.Right)
                    continue;

                if (note.TaskId >= 0 && rowYByTaskId.TryGetValue(note.TaskId, out int rowY))
                {
                    var task = visibleTasks.FirstOrDefault(t => t.Id == note.TaskId);
                    if (task != null)
                    {
                        var barRect = _taskBarRenderer.GetTaskBarRect(task, rowY);
                        _noteRenderer.DrawConnector(g, barRect, noteRect);
                    }
                }

                if (!_paintExportMode && note.Id == _editingNoteId)
                    continue;

                _noteRenderer.DrawNote(g, note, noteRect, note.Id == selectedNoteId);
            }

            if (_isDraggingNote && _dragNoteId >= 0 && _model != null)
            {
                var previewRect = new Rectangle(
                    _viewport.DateToX(_dragNotePreviewAnchorDate),
                    _dragNotePreviewContentY - _scrollY,
                    NoteRenderer.NoteWidth,
                    NoteRenderer.NoteHeight);

                if (previewRect.Bottom >= AppTheme.TimescaleHeaderHeight && previewRect.Top <= _paintClipBottom)
                {
                    var draggedNote = _model.GetNote(_dragNoteId);
                    if (draggedNote?.TaskId >= 0 && rowYByTaskId.TryGetValue(draggedNote.TaskId, out int rowY))
                    {
                        var task = visibleTasks.FirstOrDefault(t => t.Id == draggedNote.TaskId);
                        if (task != null)
                        {
                            var barRect = _taskBarRenderer.GetTaskBarRect(task, rowY);
                            _noteRenderer.DrawConnectorSilhouette(g, barRect, previewRect);
                        }
                    }

                    _noteRenderer.DrawNoteSilhouette(g, previewRect);
                }
            }
        }

        private Dictionary<int, Rectangle> BuildNoteHitRects()
        {
            var result = new Dictionary<int, Rectangle>();
            if (_model == null || _noteRenderer == null)
                return result;

            foreach (var note in _model.Notes)
                result[note.Id] = _noteRenderer.GetNoteRect(note, _scrollY);

            return result;
        }

        private ProjectNote? HitTestNote(Point pt)
        {
            if (_model == null || _noteRenderer == null)
                return null;

            foreach (var kvp in BuildNoteHitRects())
            {
                if (kvp.Value.Contains(pt))
                    return _model.GetNote(kvp.Key);
            }

            return null;
        }

        private void DrawBorders(Graphics g)
        {
            using var pen = new Pen(AppTheme.BorderColor);
            g.DrawLine(pen, 0, AppTheme.TimescaleHeaderHeight, Width, AppTheme.TimescaleHeaderHeight);
            g.DrawLine(pen, Width - _vScrollBar.Width - 1, 0, Width - _vScrollBar.Width - 1, Height);
        }

        private Rectangle GetChartArea() =>
            new Rectangle(0, AppTheme.TimescaleHeaderHeight, Width - _vScrollBar.Width, Height - AppTheme.TimescaleHeaderHeight - _hScrollBar.Height);

        private int GetChartAreaHeight() => Height - AppTheme.TimescaleHeaderHeight - _hScrollBar.Height;

        private void UpdateScrollbars()
        {
            if (_model == null) return;
            int totalRows = _model.GetVisibleTasks().Count();
            int totalH = totalRows * AppTheme.RowHeight;
            int visibleH = GetChartAreaHeight();

            _vScrollBar.Maximum = Math.Max(0, totalH - visibleH + _vScrollBar.LargeChange);
            _vScrollBar.Enabled = totalH > visibleH;
            if (!_vScrollBar.Enabled) { _scrollY = 0; _vScrollBar.Value = 0; }

            var origin = GetTimelineScrollOrigin();
            int totalDays = Math.Max(1, (int)(_model.GetProjectEnd() - origin).TotalDays + 60);
            int totalPx = totalDays * _viewport.DayWidth;
            _hScrollBar.Maximum = Math.Max(0, totalPx);
            _hScrollBar.LargeChange = Math.Max(1, Width - _vScrollBar.Width);
            SyncHorizontalScrollFromViewport();
        }

        private DateTime GetTimelineScrollOrigin() =>
            _model?.GetTimelineScrollOrigin() ?? DateTime.Today.AddDays(-1);

        private void ScrollToTimelineOrigin()
        {
            _viewport.ViewStartDate = GetTimelineScrollOrigin();
        }

        private void SyncHorizontalScrollFromViewport()
        {
            if (_model == null)
                return;

            int scrollPx = (int)Math.Round(
                (_viewport.ViewStartDate - GetTimelineScrollOrigin()).TotalDays * _viewport.DayWidth);
            int value = Math.Clamp(scrollPx, 0, Math.Max(0, _hScrollBar.Maximum));

            if (_hScrollBar.Value == value)
                return;

            _isSyncingHorizontalScroll = true;
            try
            {
                _hScrollBar.Value = value;
            }
            finally
            {
                _isSyncingHorizontalScroll = false;
            }
        }

        private void OnMouseDown(object? sender, MouseEventArgs e)
        {
            if (_model == null) return;
            Focus();

            if (e.Button == MouseButtons.Right)
            {
                HandleRightClick(e);
                return;
            }

            if (e.Button == MouseButtons.Middle)
            {
                _isPanning = true;
                _panStartX = e.X;
                _panStartDate = _viewport.ViewStartDate;
                Cursor = Cursors.SizeWE;
                return;
            }

            if (e.Y < AppTheme.TimescaleHeaderHeight) return;

            if (_noteInlineEditor != null
                && !_noteInlineEditor.Bounds.Contains(e.Location))
                EndInlineNoteEdit(true);

            var hitNote = HitTestNote(e.Location);
            if (hitNote != null)
            {
                _selectedNoteId = hitNote.Id;
                _selectedTaskId = hitNote.TaskId >= 0 ? hitNote.TaskId : -1;
                NoteSelected?.Invoke(this, hitNote.Id);
                if (hitNote.TaskId >= 0)
                    TaskSelected?.Invoke(this, hitNote.TaskId);

                if (e.Button == MouseButtons.Left)
                {
                    _isDraggingNote = true;
                    _dragNoteId = hitNote.Id;
                    _dragNoteStartMouse = e.Location;
                    _dragNoteStartAnchorDate = hitNote.AnchorDate;
                    _dragNoteStartContentY = hitNote.ContentY;
                    _dragNotePreviewAnchorDate = hitNote.AnchorDate;
                    _dragNotePreviewContentY = hitNote.ContentY;
                    Cursor = Cursors.SizeAll;
                }

                Invalidate();
                return;
            }

            _selectedNoteId = -1;

            if (_noteModeActive)
            {
                var barTask = HitTestTaskBar(e.Location);
                if (barTask != null)
                {
                    int contentY = e.Y + _scrollY;
                    DateTime anchor = _viewport.XToDate(e.X).Date;
                    var note = _model.AddNoteAt(barTask.Id, anchor, contentY);
                    _selectedNoteId = note.Id;
                    _selectedTaskId = barTask.Id;
                    NoteSelected?.Invoke(this, note.Id);
                    TaskSelected?.Invoke(this, barTask.Id);
                    Invalidate();
                    return;
                }
            }

            if (_linkModeActive)
            {
                var barTask = HitTestTaskBar(e.Location);
                if (barTask == null)
                    return;

                _selectedTaskId = barTask.Id;
                TaskSelected?.Invoke(this, barTask.Id);
                LinkShapeClicked?.Invoke(this, barTask.Id);
                Invalidate();
                return;
            }

            var task = HitTestTask(e.Location);
            if (task == null)
            {
                _selectedTaskId = -1;
                TaskSelected?.Invoke(this, -1);
                Invalidate();
                return;
            }

            _selectedTaskId = task.Id;
            TaskSelected?.Invoke(this, task.Id);

            if (e.Button == MouseButtons.Left)
            {
                int rowY = GetTaskRowY(task);
                var barRect = _taskBarRenderer!.GetTaskBarRect(task, rowY);
                int resizeZone = 6;

                if (task.TaskType != TaskType.Milestone)
                {
                    if (e.X >= barRect.Right - resizeZone && e.X <= barRect.Right + resizeZone)
                    {
                        _isResizingRight = true;
                        _dragTaskId = task.Id;
                        _dragStartMouse = e.Location;
                        _dragStartDate = task.StartDate;
                        _dragStartDuration = task.DurationDays;
                        Cursor = Cursors.SizeWE;
                        return;
                    }
                    else if (e.X >= barRect.Left - resizeZone && e.X <= barRect.Left + resizeZone)
                    {
                        _isResizingLeft = true;
                        _dragTaskId = task.Id;
                        _dragStartMouse = e.Location;
                        _dragStartDate = task.StartDate;
                        _dragStartDuration = task.DurationDays;
                        Cursor = Cursors.SizeWE;
                        return;
                    }
                }

                if (barRect.Contains(e.Location))
                {
                    _isDragging = true;
                    _dragTaskId = task.Id;
                    _dragStartMouse = e.Location;
                    _dragStartDate = task.StartDate;
                    _dragStartDuration = task.DurationDays;
                    Cursor = Cursors.SizeAll;
                }
            }

            Invalidate();
        }

        private void HandleRightClick(MouseEventArgs e)
        {
            var hitNote = e.Y >= AppTheme.TimescaleHeaderHeight ? HitTestNote(e.Location) : null;
            if (hitNote != null)
            {
                _selectedNoteId = hitNote.Id;
                NoteSelected?.Invoke(this, hitNote.Id);
                if (hitNote.TaskId >= 0)
                {
                    _selectedTaskId = hitNote.TaskId;
                    TaskSelected?.Invoke(this, hitNote.TaskId);
                }

                ContextMenuRequested?.Invoke(this, new ContextMenuRequestEventArgs
                {
                    Target = ContextMenuTarget.GanttNote,
                    TaskId = hitNote.TaskId,
                    NoteId = hitNote.Id,
                    Location = e.Location
                });
                Invalidate();
                return;
            }

            ProjectTask? task = null;
            if (e.Y >= AppTheme.TimescaleHeaderHeight)
            {
                task = HitTestTask(e.Location);
                if (task != null)
                {
                    _selectedTaskId = task.Id;
                    TaskSelected?.Invoke(this, task.Id);
                }
                else
                {
                    _selectedTaskId = -1;
                    TaskSelected?.Invoke(this, -1);
                }
            }

            var target = e.Y < AppTheme.TimescaleHeaderHeight
                ? ContextMenuTarget.GanttHeader
                : task != null
                    ? ContextMenuTarget.GanttTask
                    : ContextMenuTarget.GanttEmpty;

            ContextMenuRequested?.Invoke(this, new ContextMenuRequestEventArgs
            {
                Target = target,
                TaskId = task?.Id ?? -1,
                Location = e.Location
            });

            Invalidate();
        }

        private void OnMouseMove(object? sender, MouseEventArgs e)
        {
            if (_model == null) return;

            if (_isPanning)
            {
                int deltaPx = e.X - _panStartX;
                double deltaDays = -(double)deltaPx / _viewport.DayWidth;
                var origin = GetTimelineScrollOrigin();
                var nextDate = _panStartDate.AddDays(deltaDays);
                _viewport.ViewStartDate = nextDate < origin ? origin : nextDate;
                SyncHorizontalScrollFromViewport();
                Invalidate();
                return;
            }

            if (_isDragging || _isResizingRight || _isResizingLeft)
            {
                var task = _model.GetTask(_dragTaskId);
                if (task != null)
                {
                    int deltaPx = e.X - _dragStartMouse.X;
                    int deltaDays = (int)Math.Round((double)deltaPx / _viewport.DayWidth);

                    if (_isDragging)
                        task.StartDate = _dragStartDate.AddDays(deltaDays);
                    else if (_isResizingRight)
                        task.DurationDays = Math.Max(1, _dragStartDuration + deltaDays);
                    else if (_isResizingLeft)
                    {
                        task.StartDate = _dragStartDate.AddDays(deltaDays);
                        task.DurationDays = Math.Max(1, _dragStartDuration - deltaDays);
                    }
                    Invalidate();
                }
                return;
            }

            if (_isDraggingNote)
            {
                int deltaPx = e.X - _dragNoteStartMouse.X;
                int deltaDays = (int)Math.Round((double)deltaPx / _viewport.DayWidth);
                _dragNotePreviewContentY = _dragNoteStartContentY + (e.Y - _dragNoteStartMouse.Y);
                _dragNotePreviewAnchorDate = _dragNoteStartAnchorDate.AddDays(deltaDays);
                Invalidate();
                return;
            }

            // Hover detection
            var hoveredTask = _linkModeActive ? HitTestTaskBar(e.Location) : HitTestTask(e.Location);
            int newHovered = hoveredTask?.Id ?? -1;
            if (newHovered != _hoveredTaskId)
            {
                _hoveredTaskId = newHovered;
                Invalidate();
            }
            NotifyTaskHovered(_linkModeActive && newHovered == _linkSourceId ? -1 : newHovered);

            if (_linkModeActive)
            {
                if (_linkSourceId >= 0 && e.Y >= AppTheme.TimescaleHeaderHeight)
                {
                    _linkPreviewMousePoint = e.Location;
                    Invalidate();
                }

                Cursor = hoveredTask != null ? Cursors.Hand : Cursors.Cross;
                return;
            }

            // Cursor update
            if (hoveredTask != null && hoveredTask.TaskType != TaskType.Milestone)
            {
                int rowY = GetTaskRowY(hoveredTask);
                var barRect = _taskBarRenderer!.GetTaskBarRect(hoveredTask, rowY);
                int rz = 6;
                if (e.X >= barRect.Right - rz && e.X <= barRect.Right + rz)
                    Cursor = Cursors.SizeWE;
                else if (e.X >= barRect.Left - rz && e.X <= barRect.Left + rz)
                    Cursor = Cursors.SizeWE;
                else if (barRect.Contains(e.Location))
                    Cursor = Cursors.SizeAll;
                else
                    Cursor = Cursors.Default;
            }
            else
                Cursor = Cursors.Default;
        }

        private void OnMouseUp(object? sender, MouseEventArgs e)
        {
            if ((_isDragging || _isResizingRight || _isResizingLeft) && _dragTaskId >= 0)
            {
                if (_model != null)
                {
                    _model.CascadeDependencies(_dragTaskId);
                    _model.UpdateHierarchy();
                }
                ModelChanged?.Invoke(this, EventArgs.Empty);
            }

            if (_isDraggingNote && _dragNoteId >= 0 && _model != null)
                _model.SetNotePosition(_dragNoteId, _dragNotePreviewAnchorDate, _dragNotePreviewContentY);

            _isDragging = false;
            _isResizingRight = false;
            _isResizingLeft = false;
            _isDraggingNote = false;
            _isPanning = false;
            _dragTaskId = -1;
            _dragNoteId = -1;
            Cursor = Cursors.Default;
        }

        private void OnMouseDoubleClick(object? sender, MouseEventArgs e)
        {
            if (_model == null || e.Y < AppTheme.TimescaleHeaderHeight)
                return;

            var note = HitTestNote(e.Location);
            if (note != null)
            {
                BeginInlineNoteEdit(note.Id);
                return;
            }

            var task = HitTestTask(e.Location);
            if (task != null)
                TaskDoubleClicked?.Invoke(this, task.Id);
        }

        private void OnMouseWheel(object? sender, MouseEventArgs e)
        {
            if (ModifierKeys == Keys.Control)
            {
                if (e.Delta > 0) ZoomIn(); else ZoomOut();
            }
            else
            {
                int delta = -e.Delta / 3;
                int newVal = Math.Clamp(_vScrollBar.Value + delta, 0, _vScrollBar.Maximum);
                _vScrollBar.Value = newVal;
                _scrollY = newVal;
                Invalidate();
            }
        }

        private void OnMouseEnter(object? sender, EventArgs e)
        {
            var pt = PointToClient(Cursor.Position);
            var task = _linkModeActive ? HitTestTaskBar(pt) : HitTestTask(pt);
            NotifyTaskHovered(task?.Id ?? -1);
        }

        private void NotifyTaskHovered(int taskId)
        {
            TaskHovered?.Invoke(this, taskId);
        }

        private ProjectTask? HitTestTaskBar(Point pt)
        {
            if (_model == null || _taskBarRenderer == null || pt.Y < AppTheme.TimescaleHeaderHeight)
                return null;

            var visibleTasks = _model.GetVisibleTasks().ToList();
            for (int i = 0; i < visibleTasks.Count; i++)
            {
                int rowY = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;
                if (pt.Y < rowY || pt.Y >= rowY + AppTheme.RowHeight)
                    continue;

                var task = visibleTasks[i];
                var barRect = _taskBarRenderer.GetTaskBarRect(task, rowY);
                if (barRect.Contains(pt))
                    return task;
            }

            return null;
        }

        private ProjectTask? HitTestTask(Point pt)
        {
            if (_model == null || pt.Y < AppTheme.TimescaleHeaderHeight) return null;

            var visibleTasks = _model.GetVisibleTasks().ToList();
            for (int i = 0; i < visibleTasks.Count; i++)
            {
                int rowY = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;
                if (pt.Y >= rowY && pt.Y < rowY + AppTheme.RowHeight)
                    return visibleTasks[i];
            }
            return null;
        }

        private int GetTaskRowY(ProjectTask task)
        {
            var visibleTasks = _model!.GetVisibleTasks().ToList();
            int idx = visibleTasks.IndexOf(task);
            return AppTheme.TimescaleHeaderHeight + idx * AppTheme.RowHeight - _scrollY;
        }
    }
}
