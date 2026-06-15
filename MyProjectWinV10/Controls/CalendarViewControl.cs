using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using System.Drawing.Drawing2D;

namespace MyProject.Controls
{
    public sealed class CalendarViewControl : Control
    {
        private const int NavBarHeight = 36;
        private const int DayHeaderHeight = 26;
        private const int WeekRowHeight = 28;
        private const int MonthDayLabelHeight = 18;
        private const int MonthTaskBarHeight = 14;
        private const int MonthTaskBarGap = 2;
        private const int YearMonthGap = 8;
        private const int YearMiniBarHeight = 3;
        private const int YearMiniBarGap = 1;
        private const int CalendarNoteWidth = 72;
        private const int CalendarNoteHeight = 40;
        private const int YearNoteMinWidth = 28;
        private const int YearNoteMinHeight = 22;

        private ProjectModel? _model;
        private readonly NoteRenderer _noteRenderer = new(new GanttViewport());
        private CalendarDisplayUnit _unit = CalendarDisplayUnit.Month;
        private DateTime _focusDate = DateTime.Today;
        private int _selectedTaskId = -1;
        private int _selectedNoteId = -1;
        private int _scrollY;
        private bool _isDraggingNote;
        private int _dragNoteId = -1;
        private Point _dragNoteMouseOffset;
        private DateTime _dragNotePreviewAnchor;
        private int _dragNotePreviewContentX;
        private int _dragNotePreviewContentY;
        private bool _noteModeActive;
        private bool _showCriticalPath;
        private readonly VScrollBar _vScrollBar;

        public Action? RequestUndoSnapshot { get; set; }

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? NoteSelected;
        public event EventHandler<int>? NoteDoubleClicked;

        public int SelectedNoteId => _selectedNoteId;

        public CalendarDisplayUnit DisplayUnit
        {
            get => _unit;
            set
            {
                if (_unit == value) return;
                _unit = value;
                _scrollY = 0;
                SyncScrollbars();
                Invalidate();
            }
        }

        public int SelectedTaskId => _selectedTaskId;

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

        public void SetNoteModeActive(bool active)
        {
            if (_noteModeActive == active)
                return;

            _noteModeActive = active;
            Cursor = active ? Cursors.Hand : Cursors.Default;
            Invalidate();
        }

        public void AddNoteForTask(int taskId)
        {
            if (_model == null)
                return;

            var task = _model.GetTask(taskId);
            if (task == null)
                return;

            var content = GetContentRect();
            var metrics = BuildViewMetrics(content);
            var anchor = ClampDateToMetrics(task.EndDate.AddDays(1), metrics);
            var rect = GetDefaultNoteRect(anchor, metrics);

            RequestUndoSnapshot?.Invoke();
            var note = _model.AddNoteAt(taskId, anchor, rect.Y);
            _model.SetNotePosition(note.Id, anchor, rect.Y, rect.X);
            SelectNote(note.Id);
            TaskSelected?.Invoke(this, taskId);
        }

        public CalendarViewControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = AppTheme.Background;
            TabStop = true;

            _vScrollBar = new VScrollBar
            {
                Dock = DockStyle.Right,
                Visible = false
            };
            _vScrollBar.Scroll += (_, _) =>
            {
                _scrollY = _vScrollBar.Value;
                Invalidate();
            };
            Controls.Add(_vScrollBar);

            MouseWheel += OnMouseWheel;
            MouseMove += OnMouseMove;
            MouseUp += OnMouseUp;
            MouseDoubleClick += OnMouseDoubleClick;
        }

        private void OnMouseDoubleClick(object? sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left || _model == null)
                return;

            var content = GetContentRect();
            if (TryHitTestNote(e.Location, content, out int noteId))
            {
                SelectNote(noteId);
                NoteDoubleClicked?.Invoke(this, noteId);
            }
        }

        private bool TryHitTestNote(Point pt, Rectangle content, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            var metrics = BuildViewMetrics(content);
            foreach (var note in GetNotesForRange(metrics.GridStart, metrics.GridEnd).OrderByDescending(n => n.Id))
            {
                if (TryGetNoteRect(note, metrics, out var rect) && rect.Contains(pt))
                {
                    noteId = note.Id;
                    return true;
                }
            }

            return false;
        }

        public void ClearNoteSelection()
        {
            if (_selectedNoteId < 0) return;
            _selectedNoteId = -1;
            Invalidate();
        }

        public void SetSelectedNote(int noteId)
        {
            if (_selectedNoteId == noteId) return;
            _selectedNoteId = noteId;
            if (noteId >= 0)
                _selectedTaskId = -1;
            Invalidate();
        }

        public void SetModel(ProjectModel? model)
        {
            if (_model != null)
                _model.ModelChanged -= OnModelChanged;

            _model = model;

            if (_model != null)
                _model.ModelChanged += OnModelChanged;

            SyncScrollbars();
            Invalidate();
        }

        public void DetachModel() => SetModel(null);

        public void SetDisplayUnit(CalendarDisplayUnit unit) => DisplayUnit = unit;

        public void SetSelectedTask(int taskId)
        {
            if (_selectedTaskId == taskId) return;
            _selectedTaskId = taskId;
            if (taskId >= 0)
                _selectedNoteId = -1;
            Invalidate();
        }

        public void GoToToday()
        {
            _focusDate = DateTime.Today;
            _scrollY = 0;
            SyncScrollbars();
            Invalidate();
        }

        public void NavigatePrevious()
        {
            _focusDate = _unit switch
            {
                CalendarDisplayUnit.Week => _focusDate.AddDays(-7),
                CalendarDisplayUnit.Month => _focusDate.AddMonths(-1),
                CalendarDisplayUnit.Year => _focusDate.AddYears(-1),
                _ => _focusDate.AddMonths(-1)
            };
            _scrollY = 0;
            SyncScrollbars();
            Invalidate();
        }

        public void NavigateNext()
        {
            _focusDate = _unit switch
            {
                CalendarDisplayUnit.Week => _focusDate.AddDays(7),
                CalendarDisplayUnit.Month => _focusDate.AddMonths(1),
                CalendarDisplayUnit.Year => _focusDate.AddYears(1),
                _ => _focusDate.AddMonths(1)
            };
            _scrollY = 0;
            SyncScrollbars();
            Invalidate();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            SyncScrollbars();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            if (_model == null)
            {
                DrawEmptyState(e.Graphics);
                return;
            }

            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var content = GetContentRect();
            DrawNavBar(g, content);

            switch (_unit)
            {
                case CalendarDisplayUnit.Week:
                    DrawWeekView(g, content);
                    break;
                case CalendarDisplayUnit.Month:
                    DrawMonthView(g, content);
                    break;
                case CalendarDisplayUnit.Year:
                    DrawYearView(g, content);
                    break;
            }

            DrawNotes(g, content);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            Focus();

            if (e.Button != MouseButtons.Left || _model == null)
                return;

            var content = GetContentRect();
            var nav = new Rectangle(content.X, content.Y, content.Width, NavBarHeight);
            if (nav.Contains(e.Location))
            {
                int btnSize = 28;
                var prevRect = new Rectangle(nav.X + 8, nav.Y + (nav.Height - btnSize) / 2, btnSize, btnSize);
                var nextRect = new Rectangle(prevRect.Right + 4, prevRect.Y, btnSize, btnSize);
                var todayRect = new Rectangle(nextRect.Right + 8, prevRect.Y, 52, btnSize);

                if (prevRect.Contains(e.Location))
                    NavigatePrevious();
                else if (nextRect.Contains(e.Location))
                    NavigateNext();
                else if (todayRect.Contains(e.Location))
                    GoToToday();
                return;
            }

            if (TryBeginNoteDrag(e.Location, content))
                return;

            if (_noteModeActive && TryHitTestTask(e.Location, content, out int noteTaskId))
            {
                AddNoteForTaskAtClick(noteTaskId, e.Location, content);
                return;
            }

            if (_unit == CalendarDisplayUnit.Week)
            {
                if (TryHitTestWeekTask(e.Location, content, out int taskId))
                    SelectTask(taskId);
            }
            else if (_unit == CalendarDisplayUnit.Month)
            {
                if (TryHitTestMonthTask(e.Location, content, out int taskId))
                    SelectTask(taskId);
            }
            else if (!HitTestYearInteractive(e.Location, content))
                HitTestYearMonth(e.Location, content);
        }

        private void AddNoteForTaskAtClick(int taskId, Point pt, Rectangle content)
        {
            if (_model == null)
                return;

            var metrics = BuildViewMetrics(content);
            var anchor = GetDateFromPoint(pt, metrics) ?? _model.GetTask(taskId)?.EndDate.AddDays(1) ?? DateTime.Today;
            anchor = ClampDateToMetrics(anchor, metrics);
            var rect = GetDefaultNoteRect(anchor, metrics);

            RequestUndoSnapshot?.Invoke();
            var note = _model.AddNoteAt(taskId, anchor, rect.Y);
            _model.SetNotePosition(note.Id, anchor, rect.Y, rect.X);
            SelectNote(note.Id);
            TaskSelected?.Invoke(this, taskId);
        }

        private Rectangle GetDefaultNoteRect(DateTime anchor, ViewMetrics metrics)
        {
            int noteW = GetNoteWidthForUnit();
            int noteH = GetNoteHeightForUnit();
            int dayIndex = (anchor.Date - metrics.GridStart.Date).Days;
            dayIndex = Math.Clamp(dayIndex, 0, metrics.DayCount - 1);
            int col = dayIndex % 7;
            int x = metrics.Body.X + col * metrics.ColWidth + Math.Max(2, (metrics.ColWidth - noteW) / 2);
            int y = metrics.Body.Top + DayHeaderHeight + 8;
            return new Rectangle(x, y, noteW, noteH);
        }

        private static DateTime ClampDateToMetrics(DateTime date, ViewMetrics metrics)
        {
            if (date.Date < metrics.GridStart.Date)
                return metrics.GridStart.Date;
            if (date.Date > metrics.GridEnd.Date)
                return metrics.GridEnd.Date;
            return date.Date;
        }

        private bool TryHitTestTask(Point pt, Rectangle content, out int taskId)
        {
            return _unit switch
            {
                CalendarDisplayUnit.Week => TryHitTestWeekTask(pt, content, out taskId),
                CalendarDisplayUnit.Month => TryHitTestMonthTask(pt, content, out taskId),
                CalendarDisplayUnit.Year => TryHitTestYearTask(pt, content, out taskId),
                _ => TryHitTestMonthTask(pt, content, out taskId)
            };
        }

        private void OnMouseMove(object? sender, MouseEventArgs e)
        {
            if (!_isDraggingNote || _model == null)
                return;

            var content = GetContentRect();
            var metrics = BuildViewMetrics(content);
            if (_unit == CalendarDisplayUnit.Year)
            {
                _dragNotePreviewContentY = e.Y;
                var date = GetDateFromYearPoint(e.Location, metrics);
                if (date.HasValue)
                    _dragNotePreviewAnchor = date.Value;
            }
            else
            {
                int noteW = GetNoteWidthForUnit();
                int noteH = GetNoteHeightForUnit();
                int minX = metrics.Body.Left + 2;
                int maxX = metrics.Body.Right - noteW - 2;
                int minY = metrics.Body.Top + DayHeaderHeight + 2;
                int maxY = metrics.Body.Bottom - noteH - 2;

                _dragNotePreviewContentX = Math.Clamp(e.X - _dragNoteMouseOffset.X, minX, maxX);
                _dragNotePreviewContentY = Math.Clamp(e.Y - _dragNoteMouseOffset.Y, minY, maxY);

                var center = new Point(
                    _dragNotePreviewContentX + noteW / 2,
                    _dragNotePreviewContentY + noteH / 2);
                _dragNotePreviewAnchor = GetDateFromPoint(center, metrics) ?? _dragNotePreviewAnchor;
            }
            Cursor = Cursors.SizeAll;
            Invalidate();
        }

        private void OnMouseUp(object? sender, MouseEventArgs e)
        {
            if (!_isDraggingNote || _dragNoteId < 0 || _model == null)
            {
                _isDraggingNote = false;
                Cursor = Cursors.Default;
                return;
            }

            var note = _model.GetNote(_dragNoteId);
            if (note != null
                && (note.AnchorDate.Date != _dragNotePreviewAnchor.Date
                    || note.ContentY != _dragNotePreviewContentY
                    || (_unit != CalendarDisplayUnit.Year && note.ContentX != _dragNotePreviewContentX)))
            {
                RequestUndoSnapshot?.Invoke();
                if (_unit == CalendarDisplayUnit.Year)
                    _model.SetNotePosition(_dragNoteId, _dragNotePreviewAnchor, _dragNotePreviewContentY);
                else
                    _model.SetNotePosition(_dragNoteId, _dragNotePreviewAnchor, _dragNotePreviewContentY, _dragNotePreviewContentX);
            }

            _isDraggingNote = false;
            _dragNoteId = -1;
            Cursor = Cursors.Default;
            Invalidate();
        }

        private void OnMouseWheel(object? sender, MouseEventArgs e)
        {
            if (_vScrollBar.Visible)
            {
                int delta = e.Delta > 0 ? -30 : 30;
                _vScrollBar.Value = Math.Clamp(_vScrollBar.Value + delta, _vScrollBar.Minimum, _vScrollBar.Maximum);
                _scrollY = _vScrollBar.Value;
                Invalidate();
            }
            else if (ModifierKeys == Keys.Control)
            {
                if (e.Delta > 0) NavigatePrevious();
                else NavigateNext();
            }
        }

        private void OnModelChanged(object? sender, EventArgs e)
        {
            SyncScrollbars();
            Invalidate();
        }

        private Rectangle GetContentRect() =>
            new Rectangle(0, 0, Width - (_vScrollBar.Visible ? _vScrollBar.Width : 0), Height);

        private void DrawEmptyState(Graphics g)
        {
            using var brush = new SolidBrush(AppTheme.TextSecondary);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("Open or create a project to view the calendar.", Font, brush, ClientRectangle, sf);
        }

        private void DrawNavBar(Graphics g, Rectangle content)
        {
            using var bg = new SolidBrush(AppTheme.TimescaleBackground);
            g.FillRectangle(bg, content.X, content.Y, content.Width, NavBarHeight);

            int btnSize = 28;
            int y = content.Y + (NavBarHeight - btnSize) / 2;
            DrawNavButton(g, new Rectangle(content.X + 8, y, btnSize, btnSize), "◀");
            DrawNavButton(g, new Rectangle(content.X + 8 + btnSize + 4, y, btnSize, btnSize), "▶");
            DrawNavButton(g, new Rectangle(content.X + 8 + (btnSize + 4) * 2 + 8, y, 52, btnSize), "Today");

            string title = GetPeriodTitle();
            using var titleBrush = new SolidBrush(AppTheme.TextPrimary);
            using var titleFont = new Font(Font.FontFamily, Font.Size + 1f, FontStyle.Bold);
            var titleRect = new Rectangle(content.X + 160, content.Y, content.Width - 170, NavBarHeight);
            var sf = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center };
            g.DrawString(title, titleFont, titleBrush, titleRect, sf);

            using var linePen = new Pen(AppTheme.BorderColor);
            g.DrawLine(linePen, content.X, content.Y + NavBarHeight - 1, content.Right, content.Y + NavBarHeight - 1);
        }

        private static void DrawNavButton(Graphics g, Rectangle rect, string text)
        {
            using var fill = new SolidBrush(Color.FromArgb(248, 249, 251));
            using var border = new Pen(AppTheme.BorderColor);
            g.FillRectangle(fill, rect);
            g.DrawRectangle(border, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);

            using var brush = new SolidBrush(AppTheme.TextPrimary);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(text, SystemFonts.DefaultFont, brush, rect, sf);
        }

        private string GetPeriodTitle()
        {
            var culture = System.Globalization.CultureInfo.CurrentCulture;
            return _unit switch
            {
                CalendarDisplayUnit.Week =>
                    $"{GetWeekStart(_focusDate):yyyy-MM-dd} – {GetWeekStart(_focusDate).AddDays(6):yyyy-MM-dd}",
                CalendarDisplayUnit.Month =>
                    _focusDate.ToString("Y", culture),
                CalendarDisplayUnit.Year =>
                    _focusDate.ToString("yyyy", culture),
                _ => _focusDate.ToString("Y", culture)
            };
        }

        private void DrawWeekView(Graphics g, Rectangle content)
        {
            var weekStart = GetWeekStart(_focusDate);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            DrawDayHeaders(g, body, weekStart, 7);

            var tasks = GetTasksForRange(weekStart, weekStart.AddDays(6)).ToList();
            int rowAreaTop = body.Y + DayHeaderHeight;
            int rowAreaHeight = Math.Max(0, body.Height - DayHeaderHeight);
            int totalRowsHeight = tasks.Count * WeekRowHeight;
            int visibleHeight = Math.Max(0, rowAreaHeight);

            UpdateWeekScroll(totalRowsHeight, visibleHeight);

            int colWidth = Math.Max(1, body.Width / 7);
            DrawVerticalDayLines(g, body, 7, colWidth, rowAreaTop, rowAreaHeight);

            for (int i = 0; i < tasks.Count; i++)
            {
                int rowY = rowAreaTop + i * WeekRowHeight - _scrollY;
                if (rowY + WeekRowHeight < rowAreaTop || rowY > rowAreaTop + rowAreaHeight)
                    continue;

                DrawWeekTaskBar(g, tasks[i], weekStart, body.X, rowY, colWidth, WeekRowHeight - 4);
            }
        }

        private void DrawWeekTaskBar(Graphics g, ProjectTask task, DateTime weekStart, int left, int rowY, int colWidth, int barHeight)
        {
            int startCol = (task.StartDate.Date - weekStart.Date).Days;
            int endCol = (GetTaskEndDate(task).Date - weekStart.Date).Days;
            startCol = Math.Clamp(startCol, 0, 6);
            endCol = Math.Clamp(endCol, 0, 6);
            if (endCol < startCol) return;

            var barRect = new Rectangle(left + startCol * colWidth + 2, rowY + 2, (endCol - startCol + 1) * colWidth - 4, barHeight);
            DrawSpanningTaskBar(g, task, barRect, continuesFromLeft: false, continuesToRight: false);
        }

        private void DrawMonthView(Graphics g, Rectangle content)
        {
            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            var gridStart = GetWeekStart(monthStart);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            DrawDayHeaders(g, body, gridStart, 7, showWeekdayOnly: true);

            int weeks = 6;
            int gridTop = body.Y + DayHeaderHeight;
            int gridHeight = body.Bottom - gridTop;
            int rowHeight = Math.Max(56, gridHeight / weeks);
            int colWidth = Math.Max(1, body.Width / 7);

            for (int w = 0; w < weeks; w++)
            {
                for (int d = 0; d < 7; d++)
                {
                    var day = gridStart.AddDays(w * 7 + d);
                    var cell = new Rectangle(body.X + d * colWidth, gridTop + w * rowHeight, colWidth, rowHeight);
                    DrawMonthCellBackground(g, cell, day, monthStart.Month);
                }

                DrawVerticalDayLines(g, body, 7, colWidth, gridTop + w * rowHeight, rowHeight);
                DrawMonthWeekTaskBars(g, body, gridStart, w, gridTop, rowHeight, colWidth);
            }
        }

        private void DrawMonthCellBackground(Graphics g, Rectangle cell, DateTime day, int currentMonth)
        {
            bool inMonth = day.Month == currentMonth;
            bool isToday = day.Date == DateTime.Today;
            bool isWeekend = day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

            Color bg = isToday
                ? Color.FromArgb(36, AppTheme.Accent)
                : isWeekend
                    ? Color.FromArgb(18, 0, 0, 0)
                    : Color.White;
            using (var brush = new SolidBrush(bg))
                g.FillRectangle(brush, cell);

            using var borderPen = new Pen(AppTheme.BorderColor);
            g.DrawRectangle(borderPen, cell.X, cell.Y, cell.Width - 1, cell.Height - 1);

            var dayRect = new Rectangle(cell.X + 4, cell.Y + 2, cell.Width - 8, MonthDayLabelHeight);
            using var dayBrush = new SolidBrush(inMonth ? AppTheme.TextPrimary : AppTheme.TextSecondary);
            using var dayFont = new Font(Font, isToday ? FontStyle.Bold : FontStyle.Regular);
            g.DrawString(day.Day.ToString(), dayFont, dayBrush, dayRect);
        }

        private void DrawMonthWeekTaskBars(
            Graphics g,
            Rectangle body,
            DateTime gridStart,
            int weekIndex,
            int gridTop,
            int rowHeight,
            int colWidth)
        {
            if (_model == null) return;

            var weekStart = gridStart.AddDays(weekIndex * 7);
            var weekEnd = weekStart.AddDays(6);
            int barAreaTop = gridTop + weekIndex * rowHeight + MonthDayLabelHeight + 2;
            int barAreaBottom = gridTop + (weekIndex + 1) * rowHeight - 2;

            foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
            {
                int top = barAreaTop + segment.Lane * (MonthTaskBarHeight + MonthTaskBarGap);
                if (top + MonthTaskBarHeight > barAreaBottom)
                    break;

                int left = body.X + segment.StartCol * colWidth + 2;
                int width = (segment.EndCol - segment.StartCol + 1) * colWidth - 4;
                if (width <= 0) continue;

                var barRect = new Rectangle(left, top, width, MonthTaskBarHeight);
                DrawSpanningTaskBar(
                    g,
                    segment.Task,
                    barRect,
                    segment.ContinuesFromPreviousWeek,
                    segment.ContinuesToNextWeek);
            }
        }

        private IEnumerable<MonthWeekBarSegment> BuildMonthWeekBarSegments(DateTime weekStart, DateTime weekEnd)
        {
            var tasks = GetTasksForRange(weekStart, weekEnd)
                .OrderBy(t => t.StartDate)
                .ThenByDescending(t => (GetTaskEndDate(t) - t.StartDate).Days)
                .ToList();

            var laneEnds = new List<int>();

            foreach (var task in tasks)
            {
                var segStart = task.StartDate.Date < weekStart.Date ? weekStart.Date : task.StartDate.Date;
                var segEnd = GetTaskEndDate(task).Date > weekEnd.Date ? weekEnd.Date : GetTaskEndDate(task).Date;
                if (segEnd < segStart)
                    continue;

                int startCol = (segStart - weekStart.Date).Days;
                int endCol = (segEnd - weekStart.Date).Days;
                startCol = Math.Clamp(startCol, 0, 6);
                endCol = Math.Clamp(endCol, 0, 6);
                if (endCol < startCol)
                    continue;

                int lane = 0;
                while (lane < laneEnds.Count && startCol <= laneEnds[lane])
                    lane++;

                if (lane >= laneEnds.Count)
                    laneEnds.Add(endCol);
                else
                    laneEnds[lane] = endCol;

                yield return new MonthWeekBarSegment
                {
                    Task = task,
                    StartCol = startCol,
                    EndCol = endCol,
                    Lane = lane,
                    ContinuesFromPreviousWeek = task.StartDate.Date < weekStart.Date,
                    ContinuesToNextWeek = GetTaskEndDate(task).Date > weekEnd.Date
                };
            }
        }

        private DateTime GetTaskEndDate(ProjectTask task) =>
            _model?.GetTaskEndDate(task) ?? task.EndDate;

        private void DrawSpanningTaskBar(
            Graphics g,
            ProjectTask task,
            Rectangle barRect,
            bool continuesFromLeft,
            bool continuesToRight)
        {
            if (barRect.Width <= 0 || barRect.Height <= 0)
                return;

            bool selected = task.Id == _selectedTaskId;
            Color color = GetTaskColor(task);
            var fillRect = barRect;
            if (fillRect.Width < 2)
                fillRect.Width = 2;
            if (fillRect.Height < 2)
                fillRect.Height = 2;

            using var brush = new SolidBrush(color);
            bool canRound = fillRect.Width >= 12 && fillRect.Height >= 8;
            int radius = Math.Min(4, fillRect.Height / 2);

            if (!canRound)
            {
                g.FillRectangle(brush, fillRect);
            }
            else if (continuesFromLeft && continuesToRight)
            {
                g.FillRectangle(brush, fillRect);
            }
            else if (continuesFromLeft)
            {
                int bodyWidth = Math.Max(1, fillRect.Width - radius);
                g.FillRectangle(brush, fillRect.X, fillRect.Y, bodyWidth, fillRect.Height);
                if (radius > 0)
                {
                    using var path = CreateRoundedRect(
                        new Rectangle(fillRect.Right - radius * 2, fillRect.Y, radius * 2, fillRect.Height),
                        radius);
                    g.FillPath(brush, path);
                }
            }
            else if (continuesToRight)
            {
                if (radius > 0)
                {
                    using var path = CreateRoundedRect(
                        new Rectangle(fillRect.X, fillRect.Y, radius * 2, fillRect.Height),
                        radius);
                    g.FillPath(brush, path);
                }

                int bodyX = fillRect.X + radius;
                int bodyWidth = Math.Max(1, fillRect.Width - radius);
                g.FillRectangle(brush, bodyX, fillRect.Y, bodyWidth, fillRect.Height);
            }
            else
            {
                using var path = CreateRoundedRect(fillRect, radius);
                g.FillPath(brush, path);
            }

            using (var borderPen = new Pen(DarkenColor(color, 30), selected ? 2f : 1f))
                g.DrawRectangle(borderPen, fillRect.X, fillRect.Y, fillRect.Width - 1, fillRect.Height - 1);

            if (!continuesFromLeft && fillRect.Width > 24)
            {
                using var textBrush = new SolidBrush(Color.White);
                var textRect = Rectangle.Inflate(fillRect, -4, 0);
                var sf = new StringFormat
                {
                    Alignment = StringAlignment.Near,
                    LineAlignment = StringAlignment.Center,
                    Trimming = StringTrimming.EllipsisCharacter,
                    FormatFlags = StringFormatFlags.NoWrap
                };
                g.DrawString(task.Name, AppTheme.FontSmall, textBrush, textRect, sf);
            }
        }

        private static Color DarkenColor(Color color, int amount) =>
            Color.FromArgb(
                color.A,
                Math.Clamp(color.R - amount, 0, 255),
                Math.Clamp(color.G - amount, 0, 255),
                Math.Clamp(color.B - amount, 0, 255));

        private void DrawYearView(Graphics g, Rectangle content)
        {
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int cols = 4;
            int rows = 3;
            int tileW = (body.Width - YearMonthGap * (cols + 1)) / cols;
            int tileH = (body.Height - YearMonthGap * (rows + 1)) / rows;

            for (int m = 0; m < 12; m++)
            {
                int col = m % cols;
                int row = m / cols;
                var tile = new Rectangle(
                    body.X + YearMonthGap + col * (tileW + YearMonthGap),
                    body.Y + YearMonthGap + row * (tileH + YearMonthGap),
                    tileW,
                    tileH);
                DrawYearMonthTile(g, tile, new DateTime(_focusDate.Year, m + 1, 1));
            }
        }

        private void DrawYearMonthTile(Graphics g, Rectangle tile, DateTime monthStart)
        {
            using var bg = new SolidBrush(Color.White);
            using var border = new Pen(AppTheme.BorderColor);
            g.FillRectangle(bg, tile);
            g.DrawRectangle(border, tile.X, tile.Y, tile.Width - 1, tile.Height - 1);

            var titleRect = new Rectangle(tile.X + 6, tile.Y + 4, tile.Width - 12, 16);
            using var titleBrush = new SolidBrush(AppTheme.TextPrimary);
            using var titleFont = new Font(Font, FontStyle.Bold);
            g.DrawString(monthStart.ToString("MMM", System.Globalization.CultureInfo.CurrentCulture), titleFont, titleBrush, titleRect);

            var mini = new Rectangle(tile.X + 4, tile.Y + 22, tile.Width - 8, tile.Height - 26);
            DrawMiniMonth(g, mini, monthStart);
        }

        private void DrawMiniMonth(Graphics g, Rectangle area, DateTime monthStart)
        {
            if (area.Width < 20 || area.Height < 20) return;

            string[] weekdays = { "S", "M", "T", "W", "T", "F", "S" };
            int headerH = 12;
            int cols = 7;
            int rows = 6;
            int cellW = Math.Max(1, area.Width / cols);
            int cellH = Math.Max(1, (area.Height - headerH) / rows);

            for (int i = 0; i < cols; i++)
            {
                var r = new Rectangle(area.X + i * cellW, area.Y, cellW, headerH);
                using var brush = new SolidBrush(AppTheme.TextSecondary);
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString(weekdays[i], AppTheme.FontSmall, brush, r, sf);
            }

            var gridStart = GetWeekStart(monthStart);
            for (int w = 0; w < rows; w++)
            {
                var weekStart = gridStart.AddDays(w * 7);
                var weekEnd = weekStart.AddDays(6);
                int weekTop = area.Y + headerH + w * cellH;
                int barAreaBottom = weekTop + cellH - 1;
                int barAreaTop = barAreaBottom - Math.Max(YearMiniBarHeight + 2, cellH / 2);

                foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
                {
                    int top = barAreaTop + segment.Lane * (YearMiniBarHeight + YearMiniBarGap);
                    if (top + YearMiniBarHeight > barAreaBottom)
                        break;

                    int left = area.X + segment.StartCol * cellW + 1;
                    int width = (segment.EndCol - segment.StartCol + 1) * cellW - 2;
                    if (width <= 0) continue;

                    var barRect = new Rectangle(left, top, width, YearMiniBarHeight);
                    using var brush = new SolidBrush(GetTaskColor(segment.Task));
                    g.FillRectangle(brush, barRect);
                }
            }
        }

        private void DrawDayHeaders(Graphics g, Rectangle body, DateTime startDate, int dayCount, bool showWeekdayOnly = false)
        {
            int colWidth = Math.Max(1, body.Width / dayCount);
            var headerRect = new Rectangle(body.X, body.Y, body.Width, DayHeaderHeight);
            using var bg = new SolidBrush(AppTheme.TimescaleBackground);
            g.FillRectangle(bg, headerRect);

            for (int i = 0; i < dayCount; i++)
            {
                var day = startDate.AddDays(i);
                var cell = new Rectangle(body.X + i * colWidth, body.Y, colWidth, DayHeaderHeight);
                bool isToday = day.Date == DateTime.Today;
                if (isToday)
                {
                    using var todayBg = new SolidBrush(Color.FromArgb(32, AppTheme.Accent));
                    g.FillRectangle(todayBg, cell);
                }

                string label = showWeekdayOnly
                    ? day.ToString("ddd", System.Globalization.CultureInfo.CurrentCulture)
                    : $"{day:ddd}\n{day:M/d}";
                using var brush = new SolidBrush(AppTheme.TextPrimary);
                var sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                g.DrawString(label, AppTheme.FontSmall, brush, cell, sf);
            }

            using var linePen = new Pen(AppTheme.BorderColor);
            g.DrawLine(linePen, body.X, body.Y + DayHeaderHeight - 1, body.Right, body.Y + DayHeaderHeight - 1);
        }

        private static void DrawVerticalDayLines(Graphics g, Rectangle body, int dayCount, int colWidth, int top, int height)
        {
            using var pen = new Pen(AppTheme.BorderColor);
            for (int i = 1; i < dayCount; i++)
            {
                int x = body.X + i * colWidth;
                g.DrawLine(pen, x, top, x, top + height);
            }

            g.DrawLine(pen, body.X, top, body.Right, top);
        }

        private bool TryHitTestWeekTask(Point pt, Rectangle content, out int taskId)
        {
            taskId = -1;
            var weekStart = GetWeekStart(_focusDate);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            var tasks = GetTasksForRange(weekStart, weekStart.AddDays(6)).ToList();
            int rowAreaTop = body.Y + DayHeaderHeight;
            int colWidth = Math.Max(1, body.Width / 7);

            for (int i = 0; i < tasks.Count; i++)
            {
                int rowY = rowAreaTop + i * WeekRowHeight - _scrollY;
                var task = tasks[i];
                int startCol = Math.Clamp((task.StartDate.Date - weekStart.Date).Days, 0, 6);
                int endCol = Math.Clamp((GetTaskEndDate(task).Date - weekStart.Date).Days, 0, 6);
                var barRect = new Rectangle(body.X + startCol * colWidth + 2, rowY + 2, (endCol - startCol + 1) * colWidth - 4, WeekRowHeight - 4);
                if (barRect.Contains(pt))
                {
                    taskId = task.Id;
                    return true;
                }
            }

            return false;
        }

        private bool TryHitTestMonthTask(Point pt, Rectangle content, out int taskId)
        {
            taskId = -1;
            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            var gridStart = GetWeekStart(monthStart);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int weeks = 6;
            int gridTop = body.Y + DayHeaderHeight;
            int rowHeight = Math.Max(56, (body.Bottom - gridTop) / weeks);
            int colWidth = Math.Max(1, body.Width / 7);

            for (int w = 0; w < weeks; w++)
            {
                var weekStart = gridStart.AddDays(w * 7);
                var weekEnd = weekStart.AddDays(6);
                int barAreaTop = gridTop + w * rowHeight + MonthDayLabelHeight + 2;
                int barAreaBottom = gridTop + (w + 1) * rowHeight - 2;

                foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
                {
                    int top = barAreaTop + segment.Lane * (MonthTaskBarHeight + MonthTaskBarGap);
                    if (top + MonthTaskBarHeight > barAreaBottom)
                        break;

                    int left = body.X + segment.StartCol * colWidth + 2;
                    int width = (segment.EndCol - segment.StartCol + 1) * colWidth - 4;
                    var barRect = new Rectangle(left, top, width, MonthTaskBarHeight);
                    if (barRect.Contains(pt))
                    {
                        taskId = segment.Task.Id;
                        return true;
                    }
                }
            }

            return false;
        }

        private bool TryHitTestYearTask(Point pt, Rectangle content, out int taskId)
        {
            taskId = -1;
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int cols = 4;
            int rows = 3;
            int tileW = (body.Width - YearMonthGap * (cols + 1)) / cols;
            int tileH = (body.Height - YearMonthGap * (rows + 1)) / rows;

            for (int m = 0; m < 12; m++)
            {
                int col = m % cols;
                int row = m / cols;
                var tile = new Rectangle(
                    body.X + YearMonthGap + col * (tileW + YearMonthGap),
                    body.Y + YearMonthGap + row * (tileH + YearMonthGap),
                    tileW,
                    tileH);
                if (!tile.Contains(pt))
                    continue;

                var mini = new Rectangle(tile.X + 4, tile.Y + 22, tile.Width - 8, tile.Height - 26);
                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (TryHitTestMiniMonthTaskBar(pt, mini, monthStart, out taskId))
                    return true;
            }

            return false;
        }

        private void HitTestYearMonth(Point pt, Rectangle content)
        {
            var monthDate = HitTestYearMonthRect(pt, content);
            if (monthDate.HasValue)
            {
                _unit = CalendarDisplayUnit.Month;
                _focusDate = monthDate.Value;
                _scrollY = 0;
                SyncScrollbars();
                Invalidate();
            }
        }

        private bool HitTestYearInteractive(Point pt, Rectangle content)
        {
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int cols = 4;
            int rows = 3;
            int tileW = (body.Width - YearMonthGap * (cols + 1)) / cols;
            int tileH = (body.Height - YearMonthGap * (rows + 1)) / rows;

            for (int m = 0; m < 12; m++)
            {
                int col = m % cols;
                int row = m / cols;
                var tile = new Rectangle(
                    body.X + YearMonthGap + col * (tileW + YearMonthGap),
                    body.Y + YearMonthGap + row * (tileH + YearMonthGap),
                    tileW,
                    tileH);
                if (!tile.Contains(pt))
                    continue;

                var mini = new Rectangle(tile.X + 4, tile.Y + 22, tile.Width - 8, tile.Height - 26);
                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (TryHitTestMiniMonthTaskBar(pt, mini, monthStart, out int taskId))
                {
                    SelectTask(taskId);
                    return true;
                }
                if (HitTestMiniMonthNotes(pt, mini, monthStart))
                    return true;
            }

            return false;
        }

        private bool TryHitTestMiniMonthTaskBar(Point pt, Rectangle area, DateTime monthStart, out int taskId)
        {
            taskId = -1;
            if (_model == null || area.Width < 20 || area.Height < 20)
                return false;

            int headerH = 12;
            int cellW = Math.Max(1, area.Width / 7);
            int cellH = Math.Max(1, (area.Height - headerH) / 6);
            var gridStart = GetWeekStart(monthStart);

            for (int w = 0; w < 6; w++)
            {
                var weekStart = gridStart.AddDays(w * 7);
                var weekEnd = weekStart.AddDays(6);
                int weekTop = area.Y + headerH + w * cellH;
                int barAreaBottom = weekTop + cellH - 1;
                int barAreaTop = barAreaBottom - Math.Max(YearMiniBarHeight + 2, cellH / 2);

                foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
                {
                    int top = barAreaTop + segment.Lane * (YearMiniBarHeight + YearMiniBarGap);
                    if (top + YearMiniBarHeight > barAreaBottom)
                        break;

                    int left = area.X + segment.StartCol * cellW + 1;
                    int width = (segment.EndCol - segment.StartCol + 1) * cellW - 2;
                    var barRect = new Rectangle(left, top, width, YearMiniBarHeight);
                    if (barRect.Contains(pt))
                    {
                        taskId = segment.Task.Id;
                        return true;
                    }
                }
            }

            return false;
        }

        private bool HitTestMiniMonthNotes(Point pt, Rectangle area, DateTime monthStart)
        {
            foreach (var note in GetNotesForRange(monthStart, monthStart.AddMonths(1).AddDays(-1)))
            {
                if (TryGetYearNoteRect(note, area, monthStart, out var rect) && rect.Contains(pt))
                {
                    SelectNote(note.Id);
                    return true;
                }
            }

            return false;
        }

        private DateTime? HitTestYearMonthRect(Point pt, Rectangle content)
        {
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int cols = 4;
            int rows = 3;
            int tileW = (body.Width - YearMonthGap * (cols + 1)) / cols;
            int tileH = (body.Height - YearMonthGap * (rows + 1)) / rows;

            for (int m = 0; m < 12; m++)
            {
                int col = m % cols;
                int row = m / cols;
                var tile = new Rectangle(
                    body.X + YearMonthGap + col * (tileW + YearMonthGap),
                    body.Y + YearMonthGap + row * (tileH + YearMonthGap),
                    tileW,
                    tileH);
                if (tile.Contains(pt))
                    return new DateTime(_focusDate.Year, m + 1, 1);
            }

            return null;
        }

        private void SelectTask(int taskId)
        {
            _selectedTaskId = taskId;
            _selectedNoteId = -1;
            TaskSelected?.Invoke(this, taskId);
            Invalidate();
        }

        private void SelectNote(int noteId)
        {
            _selectedNoteId = noteId;
            _selectedTaskId = -1;
            NoteSelected?.Invoke(this, noteId);
            Invalidate();
        }

        private void DrawNotes(Graphics g, Rectangle content)
        {
            if (_model == null)
                return;

            var metrics = BuildViewMetrics(content);
            var notes = GetNotesForRange(metrics.GridStart, metrics.GridEnd).OrderBy(n => n.Id).ToList();

            foreach (var note in notes)
            {
                if (_isDraggingNote && note.Id == _dragNoteId)
                    continue;

                if (!TryGetNoteRect(note, metrics, out var rect))
                    continue;

                DrawCalendarNote(g, note, rect, note.Id == _selectedNoteId);
            }

            foreach (var note in notes)
            {
                if (_isDraggingNote && note.Id == _dragNoteId)
                    continue;

                if (!TryGetNoteRect(note, metrics, out var rect))
                    continue;

                if (note.TaskId >= 0 && TryGetLinkedTaskBarRect(note.TaskId, metrics, out var barRect))
                    _noteRenderer.DrawConnector(g, note, barRect, rect, note.Id == _selectedNoteId);
            }

            if (_isDraggingNote && _dragNoteId >= 0)
            {
                var dragged = _model.GetNote(_dragNoteId);
                if (dragged != null && TryGetNoteDragPreviewRect(dragged, metrics, out var preview))
                {
                    if (dragged.TaskId >= 0 && TryGetLinkedTaskBarRect(dragged.TaskId, metrics, out var barRect))
                        _noteRenderer.DrawConnectorSilhouette(g, dragged, barRect, preview);

                    _noteRenderer.DrawNoteSilhouette(g, preview, dragged);
                }
            }
        }

        private bool TryGetNoteDragPreviewRect(ProjectNote dragged, ViewMetrics metrics, out Rectangle preview)
        {
            if (_unit == CalendarDisplayUnit.Year)
            {
                preview = default;
                for (int m = 0; m < 12; m++)
                {
                    var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                    if (_dragNotePreviewAnchor.Month != monthStart.Month)
                        continue;
                    if (TryGetYearTileMiniArea(metrics.Body, m, out var mini)
                        && TryGetYearNoteRect(
                            new ProjectNote { AnchorDate = _dragNotePreviewAnchor },
                            mini,
                            monthStart,
                            out preview))
                        return preview.Width > 0;
                }

                return false;
            }

            preview = GetNoteRectFromValues(
                _dragNotePreviewAnchor,
                _dragNotePreviewContentX,
                _dragNotePreviewContentY,
                metrics);
            return preview.Width > 0;
        }

        private void DrawCalendarNote(Graphics g, ProjectNote note, Rectangle rect, bool isSelected)
        {
            if (_unit == CalendarDisplayUnit.Year)
            {
                _noteRenderer.DrawNote(g, note, rect, isSelected, hideText: rect.Width < 40);
                return;
            }

            _noteRenderer.DrawNote(g, note, rect, isSelected, hideText: rect.Width < 56);
        }

        private bool TryBeginNoteDrag(Point pt, Rectangle content)
        {
            if (_model == null)
                return false;

            var metrics = BuildViewMetrics(content);
            foreach (var note in GetNotesForRange(metrics.GridStart, metrics.GridEnd).OrderByDescending(n => n.Id))
            {
                if (!TryGetNoteRect(note, metrics, out var rect) || !rect.Contains(pt))
                    continue;

                _isDraggingNote = true;
                _dragNoteId = note.Id;
                _dragNoteMouseOffset = new Point(pt.X - rect.X, pt.Y - rect.Y);
                _dragNotePreviewAnchor = note.AnchorDate;
                _dragNotePreviewContentX = note.ContentX > 0 ? note.ContentX : rect.X;
                _dragNotePreviewContentY = note.ContentY > 0 ? note.ContentY : rect.Y;
                SelectNote(note.Id);
                return true;
            }

            return false;
        }

        private bool TryGetNoteRect(ProjectNote note, ViewMetrics metrics, out Rectangle rect)
        {
            if (_unit == CalendarDisplayUnit.Year)
            {
                for (int m = 0; m < 12; m++)
                {
                    var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                    if (note.AnchorDate.Month != monthStart.Month)
                        continue;

                    if (!TryGetYearTileMiniArea(metrics.Body, m, out var mini))
                    {
                        rect = default;
                        return false;
                    }

                    return TryGetYearNoteRect(note, mini, monthStart, out rect);
                }

                rect = default;
                return false;
            }

            rect = GetNoteRectFromValues(note, metrics);
            if (_unit == CalendarDisplayUnit.Week)
            {
                int dayIndex = (note.AnchorDate.Date - metrics.GridStart.Date).Days;
                return dayIndex >= 0 && dayIndex < metrics.DayCount;
            }

            return metrics.Body.IntersectsWith(rect);
        }

        private bool TryGetLinkedTaskBarRect(int taskId, ViewMetrics metrics, out Rectangle barRect)
        {
            barRect = default;
            if (_model == null)
                return false;

            var task = _model.GetTask(taskId);
            if (task == null)
                return false;

            return _unit switch
            {
                CalendarDisplayUnit.Week => TryGetWeekTaskBarRect(task, metrics, out barRect),
                CalendarDisplayUnit.Month => TryGetMonthTaskBarRect(task, metrics, out barRect),
                CalendarDisplayUnit.Year => TryGetYearTaskBarRect(task, metrics, out barRect),
                _ => TryGetMonthTaskBarRect(task, metrics, out barRect)
            };
        }

        private bool TryGetWeekTaskBarRect(ProjectTask task, ViewMetrics metrics, out Rectangle barRect)
        {
            barRect = default;
            var weekStart = metrics.GridStart;
            var tasks = GetTasksForRange(weekStart, weekStart.AddDays(6)).ToList();
            int index = tasks.FindIndex(t => t.Id == task.Id);
            if (index < 0)
                return false;

            int rowAreaTop = metrics.Body.Top + DayHeaderHeight;
            int rowY = rowAreaTop + index * WeekRowHeight - _scrollY;
            int colWidth = Math.Max(1, metrics.ColWidth);
            int startCol = Math.Clamp((task.StartDate.Date - weekStart.Date).Days, 0, 6);
            int endCol = Math.Clamp((GetTaskEndDate(task).Date - weekStart.Date).Days, 0, 6);
            barRect = new Rectangle(
                metrics.Body.X + startCol * colWidth + 2,
                rowY + 2,
                (endCol - startCol + 1) * colWidth - 4,
                WeekRowHeight - 4);
            return barRect.Width > 0 && barRect.Height > 0;
        }

        private bool TryGetMonthTaskBarRect(ProjectTask task, ViewMetrics metrics, out Rectangle barRect)
        {
            barRect = default;
            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            var gridStart = GetWeekStart(monthStart);
            int weeks = 6;
            int gridTop = metrics.Body.Top + DayHeaderHeight;
            int rowHeight = Math.Max(56, (metrics.Body.Bottom - gridTop) / weeks);
            int colWidth = Math.Max(1, metrics.ColWidth);

            for (int w = 0; w < weeks; w++)
            {
                var weekStart = gridStart.AddDays(w * 7);
                var weekEnd = weekStart.AddDays(6);
                int barAreaTop = gridTop + w * rowHeight + MonthDayLabelHeight + 2;
                int barAreaBottom = gridTop + (w + 1) * rowHeight - 2;

                foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
                {
                    if (segment.Task.Id != task.Id)
                        continue;

                    int top = barAreaTop + segment.Lane * (MonthTaskBarHeight + MonthTaskBarGap);
                    if (top + MonthTaskBarHeight > barAreaBottom)
                        break;

                    int left = metrics.Body.X + segment.StartCol * colWidth + 2;
                    int width = (segment.EndCol - segment.StartCol + 1) * colWidth - 4;
                    if (width <= 0)
                        continue;

                    barRect = new Rectangle(left, top, width, MonthTaskBarHeight);
                    return true;
                }
            }

            return false;
        }

        private bool TryGetYearTaskBarRect(ProjectTask task, ViewMetrics metrics, out Rectangle barRect)
        {
            barRect = default;
            for (int m = 0; m < 12; m++)
            {
                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (!TryGetYearTileMiniArea(metrics.Body, m, out var mini))
                    continue;

                var gridStart = GetWeekStart(monthStart);
                int headerH = 12;
                int cellW = Math.Max(1, mini.Width / 7);
                int cellH = Math.Max(1, (mini.Height - headerH) / 6);

                for (int w = 0; w < 6; w++)
                {
                    var weekStart = gridStart.AddDays(w * 7);
                    var weekEnd = weekStart.AddDays(6);
                    int weekTop = mini.Y + headerH + w * cellH;
                    int barAreaBottom = weekTop + cellH - 1;
                    int barAreaTop = barAreaBottom - Math.Max(YearMiniBarHeight + 2, cellH / 2);

                    foreach (var segment in BuildMonthWeekBarSegments(weekStart, weekEnd))
                    {
                        if (segment.Task.Id != task.Id)
                            continue;

                        int top = barAreaTop + segment.Lane * (YearMiniBarHeight + YearMiniBarGap);
                        if (top + YearMiniBarHeight > barAreaBottom)
                            break;

                        int left = mini.X + segment.StartCol * cellW + 1;
                        int width = (segment.EndCol - segment.StartCol + 1) * cellW - 2;
                        if (width <= 0)
                            continue;

                        barRect = new Rectangle(left, top, width, YearMiniBarHeight);
                        return true;
                    }
                }
            }

            return false;
        }

        private bool TryGetYearNoteRect(ProjectNote note, Rectangle mini, DateTime monthStart, out Rectangle rect)
        {
            rect = default;
            if (note.AnchorDate.Month != monthStart.Month)
                return false;

            int headerH = 12;
            int cellW = Math.Max(1, mini.Width / 7);
            int cellH = Math.Max(1, (mini.Height - headerH) / 6);
            var gridStart = GetWeekStart(monthStart);
            int dayIndex = (note.AnchorDate.Date - gridStart.Date).Days;
            if (dayIndex < 0 || dayIndex >= 42)
                return false;

            int col = dayIndex % 7;
            int week = dayIndex / 7;
            var cell = new Rectangle(mini.X + col * cellW, mini.Y + headerH + week * cellH, cellW, cellH);
            int noteW = Math.Clamp(cell.Width - 2, YearNoteMinWidth, 40);
            int noteH = Math.Clamp(cell.Height - 2, YearNoteMinHeight, 32);
            noteW = Math.Min(noteW, cell.Width - 2);
            noteH = Math.Min(noteH, cell.Height - 2);
            rect = new Rectangle(
                cell.X + Math.Max(0, (cell.Width - noteW) / 2),
                cell.Y + Math.Max(0, (cell.Height - noteH) / 2),
                noteW,
                noteH);
            return true;
        }

        private Rectangle GetNoteRectFromValues(ProjectNote note, ViewMetrics metrics) =>
            GetNoteRectFromValues(note.AnchorDate, note.ContentX, note.ContentY, metrics, note.Id);

        private Rectangle GetNoteRectFromValues(DateTime anchorDate, int contentX, int contentY, ViewMetrics metrics, int noteId = 0)
        {
            int noteW = GetNoteWidthForUnit();
            int noteH = GetNoteHeightForUnit();
            int minY = metrics.Body.Top + DayHeaderHeight + 2;
            int maxY = metrics.Body.Bottom - noteH - 2;

            int x;
            if (contentX > 0)
                x = contentX;
            else
            {
                int dayIndex = (anchorDate.Date - metrics.GridStart.Date).Days;
                dayIndex = Math.Clamp(dayIndex, 0, metrics.DayCount - 1);
                int col = dayIndex % 7;
                x = metrics.Body.X + col * metrics.ColWidth + Math.Max(2, (metrics.ColWidth - noteW) / 2);
            }

            int y = contentY >= minY && contentY <= maxY
                ? contentY
                : minY + (noteId % 4) * (noteH + MonthTaskBarGap);

            x = Math.Clamp(x, metrics.Body.Left + 2, metrics.Body.Right - noteW - 2);
            y = Math.Clamp(y, minY, maxY);
            return new Rectangle(x, y, noteW, noteH);
        }

        private ViewMetrics BuildViewMetrics(Rectangle content)
        {
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            return _unit switch
            {
                CalendarDisplayUnit.Week => BuildWeekMetrics(body),
                CalendarDisplayUnit.Month => BuildMonthMetrics(body),
                CalendarDisplayUnit.Year => BuildYearMetrics(body),
                _ => BuildMonthMetrics(body)
            };
        }

        private ViewMetrics BuildWeekMetrics(Rectangle body)
        {
            var weekStart = GetWeekStart(_focusDate);
            return new ViewMetrics
            {
                Body = body,
                GridStart = weekStart,
                GridEnd = weekStart.AddDays(6),
                ColWidth = Math.Max(1, body.Width / 7),
                RowHeight = WeekRowHeight,
                GridTop = body.Y + DayHeaderHeight,
                DayCount = 7
            };
        }

        private ViewMetrics BuildMonthMetrics(Rectangle body)
        {
            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            var gridStart = GetWeekStart(monthStart);
            int weeks = 6;
            int gridTop = body.Y + DayHeaderHeight;
            int rowHeight = Math.Max(56, (body.Bottom - gridTop) / weeks);
            return new ViewMetrics
            {
                Body = body,
                GridStart = gridStart,
                GridEnd = gridStart.AddDays(weeks * 7 - 1),
                ColWidth = Math.Max(1, body.Width / 7),
                RowHeight = rowHeight,
                GridTop = gridTop,
                DayCount = weeks * 7
            };
        }

        private ViewMetrics BuildYearMetrics(Rectangle body)
        {
            var yearStart = new DateTime(_focusDate.Year, 1, 1);
            var yearEnd = new DateTime(_focusDate.Year, 12, 31);
            return new ViewMetrics
            {
                Body = body,
                GridStart = yearStart,
                GridEnd = yearEnd,
                ColWidth = 1,
                RowHeight = 1,
                GridTop = body.Y,
                DayCount = yearEnd.DayOfYear
            };
        }

        private bool TryGetYearTileMiniArea(Rectangle body, int monthIndex, out Rectangle mini)
        {
            int cols = 4;
            int tileW = (body.Width - YearMonthGap * (cols + 1)) / cols;
            int tileH = (body.Height - YearMonthGap * 4) / 3;
            int col = monthIndex % cols;
            int row = monthIndex / cols;
            var tile = new Rectangle(
                body.X + YearMonthGap + col * (tileW + YearMonthGap),
                body.Y + YearMonthGap + row * (tileH + YearMonthGap),
                tileW,
                tileH);
            mini = new Rectangle(tile.X + 4, tile.Y + 22, tile.Width - 8, tile.Height - 26);
            return mini.Width > 0 && mini.Height > 0;
        }

        private DateTime? GetDateFromPoint(Point pt, ViewMetrics metrics)
        {
            if (_unit == CalendarDisplayUnit.Year)
                return GetDateFromYearPoint(pt, metrics);

            if (!metrics.Body.Contains(pt))
                return null;

            int col = (pt.X - metrics.Body.X) / metrics.ColWidth;
            col = Math.Clamp(col, 0, 6);
            int dayIndex = col;
            if (_unit == CalendarDisplayUnit.Month)
            {
                int row = (pt.Y - metrics.GridTop) / metrics.RowHeight;
                row = Math.Clamp(row, 0, 5);
                dayIndex = row * 7 + col;
            }

            dayIndex = Math.Clamp(dayIndex, 0, metrics.DayCount - 1);
            return metrics.GridStart.AddDays(dayIndex);
        }

        private DateTime? GetDateFromYearPoint(Point pt, ViewMetrics metrics)
        {
            for (int m = 0; m < 12; m++)
            {
                if (!TryGetYearTileMiniArea(metrics.Body, m, out var mini) || !mini.Contains(pt))
                    continue;

                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                int headerH = 12;
                int cellW = Math.Max(1, mini.Width / 7);
                int cellH = Math.Max(1, (mini.Height - headerH) / 6);
                int col = (pt.X - mini.X) / cellW;
                int row = (pt.Y - mini.Y - headerH) / cellH;
                col = Math.Clamp(col, 0, 6);
                row = Math.Clamp(row, 0, 5);
                var day = GetWeekStart(monthStart).AddDays(row * 7 + col);
                if (day.Month == monthStart.Month)
                    return day;
            }

            return null;
        }

        private int GetNoteWidthForUnit() =>
            _unit == CalendarDisplayUnit.Year ? YearNoteMinWidth : CalendarNoteWidth;

        private int GetNoteHeightForUnit() =>
            _unit == CalendarDisplayUnit.Year ? YearNoteMinHeight : CalendarNoteHeight;

        private IEnumerable<ProjectNote> GetNotesForRange(DateTime start, DateTime end)
        {
            if (_model == null)
                yield break;

            foreach (var note in _model.Notes)
            {
                if (note.AnchorDate.Date >= start.Date && note.AnchorDate.Date <= end.Date)
                    yield return note;
            }
        }

        private IEnumerable<ProjectTask> GetTasksForRange(DateTime start, DateTime end)
        {
            if (_model == null)
                yield break;

            foreach (var task in _model.GetVisibleTasks())
            {
                if (GetTaskEndDate(task).Date < start.Date || task.StartDate.Date > end.Date)
                    continue;
                yield return task;
            }
        }

        private void UpdateWeekScroll(int totalHeight, int visibleHeight)
        {
            bool needsScroll = totalHeight > visibleHeight;
            _vScrollBar.Visible = needsScroll && _unit == CalendarDisplayUnit.Week;
            if (!needsScroll || _unit != CalendarDisplayUnit.Week)
            {
                _scrollY = 0;
                _vScrollBar.Value = 0;
                return;
            }

            _vScrollBar.Maximum = Math.Max(0, totalHeight - visibleHeight + _vScrollBar.LargeChange);
            _scrollY = Math.Clamp(_scrollY, 0, _vScrollBar.Maximum);
            _vScrollBar.Value = _scrollY;
        }

        private void SyncScrollbars()
        {
            if (_unit != CalendarDisplayUnit.Week || _model == null)
            {
                _vScrollBar.Visible = false;
                _scrollY = 0;
                return;
            }

            var weekStart = GetWeekStart(_focusDate);
            int totalRowsHeight = GetTasksForRange(weekStart, weekStart.AddDays(6)).Count() * WeekRowHeight;
            var body = new Rectangle(0, NavBarHeight, Width, Height - NavBarHeight);
            int visibleHeight = Math.Max(0, body.Height - DayHeaderHeight);
            UpdateWeekScroll(totalRowsHeight, visibleHeight);
        }

        private static DateTime GetWeekStart(DateTime date) =>
            date.Date.AddDays(-(int)date.DayOfWeek);

        private Color GetTaskColor(ProjectTask task)
        {
            if (task.BarColor != Color.Empty)
                return task.BarColor;
            if (_showCriticalPath && task.IsCritical)
                return AppTheme.TaskBarCritical;
            return AppTheme.TaskBarNormal;
        }

        private static GraphicsPath CreateRoundedRect(Rectangle rect, int radius)
        {
            var path = new GraphicsPath();
            int d = radius * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private sealed class MonthWeekBarSegment
        {
            public ProjectTask Task { get; init; } = null!;
            public int StartCol { get; init; }
            public int EndCol { get; init; }
            public int Lane { get; init; }
            public bool ContinuesFromPreviousWeek { get; init; }
            public bool ContinuesToNextWeek { get; init; }
        }

        private readonly struct ViewMetrics
        {
            public Rectangle Body { get; init; }
            public DateTime GridStart { get; init; }
            public DateTime GridEnd { get; init; }
            public int ColWidth { get; init; }
            public int RowHeight { get; init; }
            public int GridTop { get; init; }
            public int DayCount { get; init; }
        }
    }
}
