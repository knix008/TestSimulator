using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using MyProject.Forms;
using System.Drawing.Drawing2D;

namespace MyProject.Controls
{
    public class GanttChartControl : Control
    {
        private ProjectModel? _model;
        private readonly GanttViewport _viewport = new();
        private TimeScaleRenderer? _timeScaleRenderer;
        private TaskBarRenderer? _taskBarRenderer;
        private DependencyRenderer? _depRenderer;

        private int _selectedTaskId = -1;
        private int _hoveredTaskId = -1;
        private int _scrollY = 0;

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

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? TaskDoubleClicked;
        public event EventHandler? ModelChanged;
        public event EventHandler<int>? ScrollYChanged;
        public event EventHandler<ContextMenuRequestEventArgs>? ContextMenuRequested;

        public GanttViewport Viewport => _viewport;
        public int SelectedTaskId => _selectedTaskId;

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
                _viewport.ViewStartDate = _model != null
                    ? _model.ProjectStart.AddDays((double)_hScrollBar.Value / _viewport.DayWidth)
                    : DateTime.Today.AddDays(-3);
                Invalidate();
            };

            Controls.Add(_vScrollBar);
            Controls.Add(_hScrollBar);

            MouseDown += OnMouseDown;
            MouseMove += OnMouseMove;
            MouseUp += OnMouseUp;
            MouseWheel += OnMouseWheel;
            MouseDoubleClick += OnMouseDoubleClick;
            Resize += (s, e) => UpdateScrollbars();
        }

        public void DetachModel()
        {
            if (_model != null)
                _model.ModelChanged -= OnModelChanged;
            _model = null;
        }

        public void SetModel(ProjectModel model)
        {
            if (_model != null) _model.ModelChanged -= OnModelChanged;
            _model = model;
            _model.ModelChanged += OnModelChanged;

            _viewport.ViewStartDate = model.ProjectStart.AddDays(-3);
            _timeScaleRenderer = new TimeScaleRenderer(_viewport);
            _taskBarRenderer = new TaskBarRenderer(_viewport);
            _depRenderer = new DependencyRenderer(_viewport, _taskBarRenderer);

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

        public void ZoomIn() { _viewport.ZoomIn(); UpdateScrollbars(); Invalidate(); }
        public void ZoomOut() { _viewport.ZoomOut(); UpdateScrollbars(); Invalidate(); }
        public void GoToToday() { _viewport.ScrollToDate(DateTime.Today); Invalidate(); }

        protected override void OnPaint(PaintEventArgs e)
        {
            try
            {
                var g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                var chartArea = GetChartArea();
                _viewport.ChartLeft = chartArea.Left;
                _viewport.ChartWidth = chartArea.Width;

                DrawBackground(g, chartArea);
                _timeScaleRenderer?.DrawWeekendShading(g, chartArea);
                _timeScaleRenderer?.DrawVerticalGridLines(g, chartArea);
                DrawHorizontalGridLines(g, chartArea);
                DrawRows(g, chartArea);
                _timeScaleRenderer?.DrawTodayLine(g, chartArea);

                var headerRect = new Rectangle(chartArea.Left, 0, chartArea.Width, AppTheme.TimescaleHeaderHeight);
                _timeScaleRenderer?.Draw(g, headerRect);

                DrawBorders(g);
            }
            catch (Exception ex)
            {
                if (!ExceptionHandler.IsShuttingDown)
                    ExceptionHandler.Show(FindForm(), "Draw Error", "Could not draw the Gantt chart.", ex);
            }
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
                if (rowY > Height) break;

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
            var visibleTasks = _model.GetVisibleTasks().ToList();

            var rowYByTaskId = new Dictionary<int, int>();
            for (int i = 0; i < visibleTasks.Count; i++)
                rowYByTaskId[visibleTasks[i].Id] = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;

            // Hover/select row highlight
            foreach (var task in visibleTasks)
            {
                int rowY = rowYByTaskId[task.Id];
                if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                if (rowY > Height) break;

                if (task.Id == _selectedTaskId)
                {
                    using var selBrush = new SolidBrush(Color.FromArgb(60, AppTheme.Accent));
                    g.FillRectangle(selBrush, chartArea.Left, rowY, chartArea.Width, AppTheme.RowHeight);
                }
                else if (task.Id == _hoveredTaskId)
                {
                    using var hoverBrush = new SolidBrush(Color.FromArgb(30, AppTheme.Accent));
                    g.FillRectangle(hoverBrush, chartArea.Left, rowY, chartArea.Width, AppTheme.RowHeight);
                }
            }

            // Dependency arrows (drawn behind bars)
            var clip = g.Clip;
            g.SetClip(chartArea);
            _depRenderer.DrawDependencies(g, _model.Dependencies, visibleTasks, id => rowYByTaskId.GetValueOrDefault(id, -999));

            // Task bars
            foreach (var task in visibleTasks)
            {
                int rowY = rowYByTaskId[task.Id];
                if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                if (rowY > Height) break;

                string assignee = _model.GetTaskAssigneeDisplay(task.Id);
                _taskBarRenderer.DrawTaskBar(g, task, rowY, task.Id == _selectedTaskId, task.Id == _hoveredTaskId, assignee);
            }
            g.Clip = clip;
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

            int totalDays = (int)(_model.GetProjectEnd() - _model.ProjectStart).TotalDays + 60;
            int totalPx = totalDays * _viewport.DayWidth;
            _hScrollBar.Maximum = Math.Max(0, totalPx);
            _hScrollBar.LargeChange = Math.Max(1, Width - _vScrollBar.Width);
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
                _viewport.ViewStartDate = _panStartDate.AddDays(deltaDays);
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

            // Hover detection
            var hoveredTask = HitTestTask(e.Location);
            int newHovered = hoveredTask?.Id ?? -1;
            if (newHovered != _hoveredTaskId)
            {
                _hoveredTaskId = newHovered;
                Invalidate();
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
                var task = _model?.GetTask(_dragTaskId);
                if (task != null && task.AutoSchedule)
                    _model?.CascadeDependencies(_dragTaskId);
                ModelChanged?.Invoke(this, EventArgs.Empty);
            }

            _isDragging = false;
            _isResizingRight = false;
            _isResizingLeft = false;
            _isPanning = false;
            _dragTaskId = -1;
            Cursor = Cursors.Default;
        }

        private void OnMouseDoubleClick(object? sender, MouseEventArgs e)
        {
            var task = HitTestTask(e.Location);
            if (task != null) TaskDoubleClicked?.Invoke(this, task.Id);
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
