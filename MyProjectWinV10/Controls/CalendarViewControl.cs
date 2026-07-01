using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using System.Drawing.Drawing2D;

namespace MyProject.Controls
{
    public sealed class CalendarViewControl : Control
    {
        private const int NavBarHeight = 36;
        private const int UnitButtonWidth = 62;
        private const int UnitButtonHeight = 28;
        private const int UnitButtonGap = 4;
        private const int UnitSelectorRightMargin = 8;
        private const int DayHeaderHeight = 26;
        private const int WeekRowHeight = 28;
        private const int MonthDayLabelHeight = 18;
        private const int MonthTaskBarHeight = 14;
        private const int MonthTaskBarGap = 2;
        private const int YearMonthGap = 10;
        private const int YearTileTitleHeight = 22;
        private const int YearTileInnerPadding = 5;
        private static readonly Color YearGridBackground = Color.FromArgb(245, 247, 250);
        private static readonly Color YearTileBorderColor = Color.FromArgb(206, 211, 218);
        private static readonly Color YearMiniGridColor = Color.FromArgb(228, 232, 238);
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
        private bool _isPendingNoteDrag;
        private int _dragNoteId = -1;
        private Point _dragNoteMouseOffset;
        private Point _noteDragStartMouse;
        private DateTime _dragNotePreviewAnchor;
        private int _dragNotePreviewContentX;
        private int _dragNotePreviewContentY;
        private const int NoteDragThreshold = 4;
        private bool _noteModeActive;
        private bool _showCriticalPath;
        private readonly VScrollBar _vScrollBar;

        public Action? RequestUndoSnapshot { get; set; }

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? TaskDoubleClicked;
        public event EventHandler<int>? NoteSelected;
        public event EventHandler<int>? NoteDoubleClicked;
        public event EventHandler<CalendarDisplayUnit>? DisplayUnitChanged;

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
                DisplayUnitChanged?.Invoke(this, _unit);
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
            var anchor = ClampDateToMetrics(task.StartDate, metrics);
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

            if (TryHitTestNoteIndicator(e.Location, content, out int indicatorNoteId))
            {
                SelectNote(indicatorNoteId);
                NoteDoubleClicked?.Invoke(this, indicatorNoteId);
                return;
            }

            if (TryHitTestNote(e.Location, content, out int noteId))
            {
                SelectNote(noteId);
                NoteDoubleClicked?.Invoke(this, noteId);
                return;
            }

            if (TryHitTestTask(e.Location, content, out int taskId))
            {
                SelectTask(taskId);
                TaskDoubleClicked?.Invoke(this, taskId);
                return;
            }

            if (_unit == CalendarDisplayUnit.Year)
            {
                var monthDate = HitTestYearMonthRect(e.Location, content);
                if (monthDate.HasValue)
                {
                    DisplayUnit = CalendarDisplayUnit.Month;
                    _focusDate = monthDate.Value;
                    _scrollY = 0;
                    SyncScrollbars();
                    Invalidate();
                }
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

        private bool _shuttingDown;

        public void PrepareForShutdown()
        {
            _shuttingDown = true;
            _isDraggingNote = false;
            _isPendingNoteDrag = false;
            _dragNoteId = -1;
            Capture = false;
        }

        public void SetDisplayUnit(CalendarDisplayUnit unit) => DisplayUnit = unit;

        public void SetSelectedTask(int taskId)
        {
            if (_selectedTaskId == taskId) return;
            _selectedTaskId = taskId;
            if (taskId >= 0)
                _selectedNoteId = -1;
            TaskSelected?.Invoke(this, taskId);
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
                else                 if (todayRect.Contains(e.Location))
                    GoToToday();
                else if (TryHitTestUnitButton(e.Location, content, out var unit))
                    DisplayUnit = unit;
                return;
            }

            if (TryBeginNoteDrag(e.Location, content))
                return;

            if (TryHitTestNoteIndicator(e.Location, content, out int noteIndicatorId))
            {
                SelectNote(noteIndicatorId);
                return;
            }

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
            else if (_unit == CalendarDisplayUnit.Year)
                HitTestYearInteractive(e.Location, content);
        }

        private void AddNoteForTaskAtClick(int taskId, Point pt, Rectangle content)
        {
            if (_model == null)
                return;

            var metrics = BuildViewMetrics(content);
            var anchor = GetDateFromPoint(pt, metrics) ?? _model.GetTask(taskId)?.StartDate ?? DateTime.Today;
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
            if (_isPendingNoteDrag && !_isDraggingNote)
            {
                int dx = e.X - _noteDragStartMouse.X;
                int dy = e.Y - _noteDragStartMouse.Y;
                if (Math.Abs(dx) > NoteDragThreshold || Math.Abs(dy) > NoteDragThreshold)
                {
                    _isDraggingNote = true;
                    _isPendingNoteDrag = false;
                }
            }

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
                _isPendingNoteDrag = false;
                _dragNoteId = -1;
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
            _isPendingNoteDrag = false;
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
            if (_shuttingDown)
                return;

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
            DrawNavButton(g, new Rectangle(content.X + 8, y, btnSize, btnSize), "◀", selected: false);
            DrawNavButton(g, new Rectangle(content.X + 8 + btnSize + 4, y, btnSize, btnSize), "▶", selected: false);
            DrawNavButton(g, new Rectangle(content.X + 8 + (btnSize + 4) * 2 + 8, y, 52, btnSize), "Today", selected: false);

            DrawUnitSelector(g, content);

            int unitSelectorWidth = UnitButtonWidth * 3 + UnitButtonGap * 2 + UnitSelectorRightMargin;
            string title = GetPeriodTitle();
            using var titleBrush = new SolidBrush(AppTheme.TextPrimary);
            using var titleFont = new Font(Font.FontFamily, Font.Size + 1f, FontStyle.Bold);
            int titleLeft = content.X + 160;
            int titleRight = content.Right - unitSelectorWidth;
            var titleRect = new Rectangle(titleLeft, content.Y, Math.Max(80, titleRight - titleLeft), NavBarHeight);
            var sf = new StringFormat
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap
            };
            g.DrawString(title, titleFont, titleBrush, titleRect, sf);

            using var linePen = new Pen(AppTheme.BorderColor);
            g.DrawLine(linePen, content.X, content.Y + NavBarHeight - 1, content.Right, content.Y + NavBarHeight - 1);
        }

        private void DrawUnitSelector(Graphics g, Rectangle content)
        {
            foreach (var unit in new[] { CalendarDisplayUnit.Year, CalendarDisplayUnit.Month, CalendarDisplayUnit.Week })
            {
                var rect = GetUnitButtonRect(unit, content);
                DrawNavButton(g, rect, CalendarDisplayUnitInfo.GetDisplayName(unit), _unit == unit);
            }
        }

        private Rectangle GetUnitButtonRect(CalendarDisplayUnit unit, Rectangle content)
        {
            int totalWidth = UnitButtonWidth * 3 + UnitButtonGap * 2;
            int left = content.Right - UnitSelectorRightMargin - totalWidth;
            int y = content.Y + (NavBarHeight - UnitButtonHeight) / 2;
            int index = unit switch
            {
                CalendarDisplayUnit.Week => 2,
                CalendarDisplayUnit.Month => 1,
                _ => 0
            };
            return new Rectangle(left + index * (UnitButtonWidth + UnitButtonGap), y, UnitButtonWidth, UnitButtonHeight);
        }

        private bool TryHitTestUnitButton(Point pt, Rectangle content, out CalendarDisplayUnit unit)
        {
            foreach (var candidate in new[] { CalendarDisplayUnit.Week, CalendarDisplayUnit.Month, CalendarDisplayUnit.Year })
            {
                if (GetUnitButtonRect(candidate, content).Contains(pt))
                {
                    unit = candidate;
                    return true;
                }
            }

            unit = CalendarDisplayUnit.Month;
            return false;
        }

        private static void DrawNavButton(Graphics g, Rectangle rect, string text, bool selected)
        {
            Color fill = selected ? Color.FromArgb(220, AppTheme.Accent) : Color.FromArgb(248, 249, 251);
            using var fillBrush = new SolidBrush(fill);
            using var border = new Pen(selected ? AppTheme.AccentDark : AppTheme.BorderColor, selected ? 1.5f : 1f);
            g.FillRectangle(fillBrush, rect);
            g.DrawRectangle(border, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);

            using var brush = new SolidBrush(selected ? Color.White : AppTheme.TextPrimary);
            using var font = new Font(SystemFonts.DefaultFont, selected ? FontStyle.Bold : FontStyle.Regular);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(text, font, brush, rect, sf);
        }

        private string GetPeriodTitle()
        {
            return _unit switch
            {
                CalendarDisplayUnit.Week =>
                    $"{GetWeekStart(_focusDate):yyyy-MM-dd} – {GetWeekStart(_focusDate).AddDays(6):yyyy-MM-dd}",
                CalendarDisplayUnit.Month =>
                    _focusDate.ToString("Y", DisplayCulture.Current),
                CalendarDisplayUnit.Year =>
                    _focusDate.ToString("yyyy", DisplayCulture.Current),
                _ => _focusDate.ToString("Y", DisplayCulture.Current)
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

            DrawWeekNoteIndicators(g, body, weekStart, colWidth);
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

            DrawMonthNoteIndicators(g, body, gridStart, gridTop, rowHeight, colWidth);
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
            Color dayColor = GetCalendarDayTextColor(day, inMonth);
            using var dayBrush = new SolidBrush(dayColor);
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

            if (task.TaskType == TaskType.Milestone)
            {
                DrawCalendarMilestone(g, task, barRect);
                return;
            }

            bool selected = task.Id == _selectedTaskId;
            TaskBarColorResolver.ResolveCalendarBarColors(
                task, _showCriticalPath, selected, out Color barColor, out Color progressColor);
            bool isSummary = task.TaskType == TaskType.Summary;

            var fillRect = barRect;
            if (fillRect.Width < 2)
                fillRect.Width = 2;
            if (fillRect.Height < 2)
                fillRect.Height = 2;

            using var brush = new SolidBrush(barColor);
            bool canRound = !isSummary && fillRect.Width >= 12 && fillRect.Height >= 8;
            int radius = Math.Min(4, fillRect.Height / 2);

            if (isSummary || !canRound)
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

            double progress = Math.Clamp(task.Progress, 0, 100);
            if (progress > 0)
            {
                var progressBounds = isSummary
                    ? new Rectangle(
                        fillRect.X + 2,
                        fillRect.Y + 2,
                        Math.Max(1, fillRect.Width - 4),
                        Math.Max(1, fillRect.Height - 4))
                    : fillRect;
                int progressWidth = Math.Max(2, (int)(progressBounds.Width * progress / 100.0));
                var progressRect = new Rectangle(progressBounds.X, progressBounds.Y, progressWidth, progressBounds.Height);
                using var progressBrush = new SolidBrush(progressColor);
                g.FillRectangle(progressBrush, progressRect);
            }

            Color borderColor = isSummary
                ? TaskBarColorResolver.GetStrongBarOutlineColor()
                : TaskBarColorResolver.GetBarBorderColor(barColor, selected);
            using (var borderPen = new Pen(borderColor, TaskBarColorResolver.BarBorderWidth(selected)))
                g.DrawRectangle(borderPen, fillRect.X, fillRect.Y, fillRect.Width - 1, fillRect.Height - 1);

            if (!continuesFromLeft && fillRect.Width > 24)
            {
                Color textColor = TaskBarColorResolver.GetCalendarTaskTextColor(
                    fillRect, barColor, progressColor, progress);
                using var textBrush = new SolidBrush(textColor);
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

        private void DrawCalendarMilestone(Graphics g, ProjectTask task, Rectangle barRect)
        {
            bool selected = task.Id == _selectedTaskId;
            Color fillColor = TaskBarColorResolver.GetMilestoneColor(task, selected);
            int half = Math.Max(3, Math.Min(barRect.Width, barRect.Height) / 2);
            int cx = barRect.X + barRect.Width / 2;
            int cy = barRect.Y + barRect.Height / 2;
            var diamond = new[]
            {
                new Point(cx, cy - half),
                new Point(cx + half, cy),
                new Point(cx, cy + half),
                new Point(cx - half, cy)
            };

            using var brush = new SolidBrush(fillColor);
            g.FillPolygon(brush, diamond);

            using var pen = new Pen(
                TaskBarColorResolver.GetBarBorderColor(
                    !task.BarColor.IsEmpty ? TaskBarColorResolver.ToPastel(task.BarColor) : AppTheme.TaskBarMilestone,
                    selected),
                TaskBarColorResolver.BarBorderWidth(selected));
            g.DrawPolygon(pen, diamond);
        }

        private void DrawYearView(Graphics g, Rectangle content)
        {
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            using (var bg = new SolidBrush(YearGridBackground))
                g.FillRectangle(bg, body);

            for (int m = 0; m < 12; m++)
            {
                var layout = GetYearTileLayout(body, m);
                DrawYearMonthTile(g, layout.Tile, layout.Mini, new DateTime(_focusDate.Year, m + 1, 1));
            }
        }

        private static YearTileLayout GetYearTileLayout(Rectangle body, int monthIndex)
        {
            const int cols = 4;
            const int rows = 3;
            int gap = YearMonthGap;
            int tileW = Math.Max(1, (body.Width - gap * (cols + 1)) / cols);
            int tileH = Math.Max(1, (body.Height - gap * (rows + 1)) / rows);
            int col = monthIndex % cols;
            int row = monthIndex / cols;
            var tile = new Rectangle(
                body.X + gap + col * (tileW + gap),
                body.Y + gap + row * (tileH + gap),
                tileW,
                tileH);
            var mini = new Rectangle(
                tile.X + YearTileInnerPadding,
                tile.Y + YearTileTitleHeight + 2,
                Math.Max(1, tile.Width - YearTileInnerPadding * 2),
                Math.Max(1, tile.Height - YearTileTitleHeight - 2 - YearTileInnerPadding));
            return new YearTileLayout(tile, mini);
        }

        private void DrawYearMonthTile(Graphics g, Rectangle tile, Rectangle mini, DateTime monthStart)
        {
            using var bg = new SolidBrush(Color.White);
            g.FillRectangle(bg, tile);

            using (var border = new Pen(YearTileBorderColor, 1f))
                g.DrawRectangle(border, tile.X, tile.Y, tile.Width - 1, tile.Height - 1);

            int titleBottom = tile.Y + YearTileTitleHeight;
            using (var titleLine = new Pen(YearMiniGridColor, 1f))
                g.DrawLine(titleLine, tile.X + YearTileInnerPadding, titleBottom, tile.Right - YearTileInnerPadding, titleBottom);

            var titleRect = new Rectangle(tile.X + YearTileInnerPadding + 2, tile.Y + 4, tile.Width - (YearTileInnerPadding + 2) * 2, 16);
            using var titleBrush = new SolidBrush(AppTheme.TextPrimary);
            using var titleFont = new Font(Font, FontStyle.Bold);
            g.DrawString(monthStart.ToString("MMM", DisplayCulture.Current), titleFont, titleBrush, titleRect);

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
                bool isWeekend = i == 0 || i == 6;
                using var brush = new SolidBrush(isWeekend ? AppTheme.CalendarWeekendText : AppTheme.TextSecondary);
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString(weekdays[i], AppTheme.FontSmall, brush, r, sf);
            }

            DrawMiniMonthGrid(g, area, headerH, cols, rows, cellW, cellH);

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
                    DrawYearMiniTaskSegment(g, barRect, segment.Task);
                }
            }

            DrawYearNoteIndicators(g, area, monthStart);
        }

        private static void DrawMiniMonthGrid(Graphics g, Rectangle area, int headerH, int cols, int rows, int cellW, int cellH)
        {
            int gridTop = area.Y + headerH;
            int gridBottom = gridTop + rows * cellH;

            using var pen = new Pen(YearMiniGridColor, 1f);
            for (int c = 0; c <= cols; c++)
            {
                int x = area.X + c * cellW;
                g.DrawLine(pen, x, area.Y, x, gridBottom);
            }

            g.DrawLine(pen, area.X, gridTop, area.Right, gridTop);
            for (int r = 1; r <= rows; r++)
            {
                int y = gridTop + r * cellH;
                g.DrawLine(pen, area.X, y, area.Right, y);
            }
        }

        private void DrawYearMiniTaskSegment(Graphics g, Rectangle barRect, ProjectTask task)
        {
            if (barRect.Width <= 0 || barRect.Height <= 0)
                return;

            bool selected = task.Id == _selectedTaskId;
            TaskBarColorResolver.ResolveCalendarBarColors(
                task, _showCriticalPath, selected, out Color barColor, out _);

            using var brush = new SolidBrush(barColor);
            g.FillRectangle(brush, barRect);

            if (selected)
            {
                using var pen = new Pen(AppTheme.AccentDark, 1.5f);
                g.DrawRectangle(pen, barRect.X - 1, barRect.Y - 1, barRect.Width + 1, barRect.Height + 1);
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
                    ? day.ToString("ddd", DisplayCulture.Current)
                    : $"{day.ToString("ddd", DisplayCulture.Current)}\n{day.ToString("M/d", DisplayCulture.Current)}";
                using var brush = new SolidBrush(GetCalendarDayTextColor(day));
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

        private static Rectangle GetYearViewBody(Rectangle content) =>
            new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);

        private bool TryHitTestYearTask(Point pt, Rectangle content, out int taskId)
        {
            taskId = -1;
            var body = GetYearViewBody(content);

            for (int m = 0; m < 12; m++)
            {
                var layout = GetYearTileLayout(body, m);
                if (!layout.Tile.Contains(pt))
                    continue;

                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (TryHitTestMiniMonthTaskBar(pt, layout.Mini, monthStart, out taskId))
                    return true;
            }

            return false;
        }

        private bool HitTestYearInteractive(Point pt, Rectangle content)
        {
            var body = GetYearViewBody(content);

            for (int m = 0; m < 12; m++)
            {
                var layout = GetYearTileLayout(body, m);
                if (!layout.Tile.Contains(pt))
                    continue;

                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (TryHitTestMiniMonthTaskBar(pt, layout.Mini, monthStart, out int taskId))
                {
                    SelectTask(taskId);
                    return true;
                }

                if (HitTestMiniMonthNotes(pt, layout.Mini, monthStart, out int noteId))
                {
                    SelectNote(noteId);
                    return true;
                }
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
                    var hitRect = Rectangle.Inflate(barRect, 0, 2);
                    if (hitRect.Contains(pt))
                    {
                        taskId = segment.Task.Id;
                        return true;
                    }
                }
            }

            return false;
        }

        private bool HitTestMiniMonthNotes(Point pt, Rectangle area, DateTime monthStart, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            int headerH = 12;
            int cellW = Math.Max(1, area.Width / 7);
            int cellH = Math.Max(1, (area.Height - headerH) / 6);
            var gridStart = GetWeekStart(monthStart);

            foreach (var note in _model.Notes.OrderByDescending(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Year != monthStart.Year || displayDate.Month != monthStart.Month)
                    continue;

                if (!TryGetMiniMonthDayCellRect(displayDate, area, gridStart, headerH, cellW, cellH, out var cell))
                    continue;

                if (GetYearNoteBadgeRect(cell).Contains(pt))
                {
                    noteId = note.Id;
                    return true;
                }
            }

            return false;
        }

        private DateTime? HitTestYearMonthRect(Point pt, Rectangle content)
        {
            var body = GetYearViewBody(content);

            for (int m = 0; m < 12; m++)
            {
                var layout = GetYearTileLayout(body, m);
                if (layout.Tile.Contains(pt))
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

            if (_unit is CalendarDisplayUnit.Month or CalendarDisplayUnit.Year)
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

                    _noteRenderer.DrawNoteSilhouette(g, preview, true);
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

                _isPendingNoteDrag = true;
                _dragNoteId = note.Id;
                _dragNoteMouseOffset = new Point(pt.X - rect.X, pt.Y - rect.Y);
                _noteDragStartMouse = pt;
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
                var displayDate = GetNoteDisplayDate(note);
                for (int m = 0; m < 12; m++)
                {
                    var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                    if (displayDate.Month != monthStart.Month)
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
                int dayIndex = (GetNoteDisplayDate(note).Date - metrics.GridStart.Date).Days;
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
            var displayDate = GetNoteDisplayDate(note);
            if (displayDate.Month != monthStart.Month || displayDate.Year != monthStart.Year)
                return false;

            int headerH = 12;
            int cellW = Math.Max(1, mini.Width / 7);
            int cellH = Math.Max(1, (mini.Height - headerH) / 6);
            var gridStart = GetWeekStart(monthStart);
            if (!TryGetMiniMonthDayCellRect(displayDate, mini, gridStart, headerH, cellW, cellH, out var cell))
                return false;

            rect = GetYearNoteBadgeRect(cell);
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
            var layout = GetYearTileLayout(body, monthIndex);
            mini = layout.Mini;
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
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Date >= start.Date && displayDate.Date <= end.Date)
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

        private static bool IsWeekend(DateTime day) =>
            day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

        private static Color GetCalendarDayTextColor(DateTime day, bool inMonth = true)
        {
            if (IsWeekend(day))
                return inMonth ? AppTheme.CalendarWeekendText : AppTheme.CalendarWeekendTextMuted;
            return inMonth ? AppTheme.TextPrimary : AppTheme.TextSecondary;
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

        private void DrawMonthNoteIndicators(
            Graphics g,
            Rectangle body,
            DateTime gridStart,
            int gridTop,
            int rowHeight,
            int colWidth)
        {
            if (_model == null)
                return;

            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            foreach (var note in _model.Notes.OrderBy(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Month != monthStart.Month || displayDate.Year != monthStart.Year)
                    continue;

                if (!TryGetMonthDayCellRect(displayDate, body, gridStart, gridTop, rowHeight, colWidth, out var cell))
                    continue;

                var badge = GetMonthNoteBadgeRect(cell);
                DrawMonthNoteBadge(g, badge, note, note.Id == _selectedNoteId);
            }
        }

        private DateTime GetNoteDisplayDate(ProjectNote note)
        {
            if (note.TaskId >= 0)
            {
                var task = _model?.GetTask(note.TaskId);
                if (task != null)
                    return task.StartDate.Date;
            }

            return note.AnchorDate.Date;
        }

        private bool TryGetMonthDayCellRect(
            DateTime day,
            Rectangle body,
            DateTime gridStart,
            int gridTop,
            int rowHeight,
            int colWidth,
            out Rectangle cell)
        {
            int dayIndex = (day.Date - gridStart.Date).Days;
            if (dayIndex < 0 || dayIndex >= 42)
            {
                cell = default;
                return false;
            }

            int week = dayIndex / 7;
            int col = dayIndex % 7;
            cell = new Rectangle(body.X + col * colWidth, gridTop + week * rowHeight, colWidth, rowHeight);
            return true;
        }

        private static Rectangle GetMonthNoteBadgeRect(Rectangle cell) =>
            new(cell.Right - 18, cell.Y + 2, 16, 14);

        private void DrawMonthNoteBadge(Graphics g, Rectangle badge, ProjectNote note, bool isSelected, bool compact = false)
        {
            var fill = isSelected ? NoteRenderer.GradientBottom : NoteRenderer.GradientTop;
            using (var brush = new SolidBrush(fill))
                g.FillRectangle(brush, badge);

            using (var pen = new Pen(isSelected ? AppTheme.AccentDark : NoteRenderer.BorderColor, isSelected ? 2f : 1f))
            {
                g.DrawRectangle(pen, badge.X, badge.Y, badge.Width - 1, badge.Height - 1);
                if (!compact)
                {
                    g.DrawLine(pen, badge.Right - 4, badge.Y + 1, badge.Right - 1, badge.Y + 1);
                    g.DrawLine(pen, badge.Right - 4, badge.Y + 1, badge.Right - 4, badge.Y + 4);
                    g.DrawLine(pen, badge.Right - 4, badge.Y + 4, badge.Right - 1, badge.Y + 1);
                }
            }

            if (!compact && badge.Width >= 12)
            {
                using var textBrush = new SolidBrush(AppTheme.TextPrimary);
                string text = string.IsNullOrWhiteSpace(note.Title) ? "N" : note.Title.Trim()[0].ToString();
                var sf = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };
                g.DrawString(text, AppTheme.FontSmall, textBrush, badge, sf);
            }
        }

        private bool TryHitTestMonthNoteIndicator(Point pt, Rectangle content, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            var monthStart = new DateTime(_focusDate.Year, _focusDate.Month, 1);
            var gridStart = GetWeekStart(monthStart);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int gridTop = body.Y + DayHeaderHeight;
            int weeks = 6;
            int rowHeight = Math.Max(56, (body.Bottom - gridTop) / weeks);
            int colWidth = Math.Max(1, body.Width / 7);

            foreach (var note in _model.Notes.OrderByDescending(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Month != monthStart.Month || displayDate.Year != monthStart.Year)
                    continue;

                if (!TryGetMonthDayCellRect(displayDate, body, gridStart, gridTop, rowHeight, colWidth, out var cell))
                    continue;

                if (GetMonthNoteBadgeRect(cell).Contains(pt))
                {
                    noteId = note.Id;
                    return true;
                }
            }

            return false;
        }

        private void DrawWeekNoteIndicators(Graphics g, Rectangle body, DateTime weekStart, int colWidth)
        {
            if (_model == null)
                return;

            var weekEnd = weekStart.AddDays(6);
            foreach (var note in _model.Notes.OrderBy(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Date < weekStart.Date || displayDate.Date > weekEnd.Date)
                    continue;

                int col = (displayDate.Date - weekStart.Date).Days;
                if (col < 0 || col > 6)
                    continue;

                var headerCell = new Rectangle(body.X + col * colWidth, body.Y, colWidth, DayHeaderHeight);
                var badge = GetHeaderNoteBadgeRect(headerCell);
                DrawMonthNoteBadge(g, badge, note, note.Id == _selectedNoteId);
            }
        }

        private void DrawYearNoteIndicators(Graphics g, Rectangle area, DateTime monthStart)
        {
            if (_model == null || area.Width < 20 || area.Height < 20)
                return;

            int headerH = 12;
            int cellW = Math.Max(1, area.Width / 7);
            int cellH = Math.Max(1, (area.Height - headerH) / 6);
            var gridStart = GetWeekStart(monthStart);

            foreach (var note in _model.Notes.OrderBy(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Year != monthStart.Year || displayDate.Month != monthStart.Month)
                    continue;

                if (!TryGetMiniMonthDayCellRect(displayDate, area, gridStart, headerH, cellW, cellH, out var cell))
                    continue;

                var badge = GetYearNoteBadgeRect(cell);
                DrawMonthNoteBadge(g, badge, note, note.Id == _selectedNoteId, compact: true);
            }
        }

        private static Rectangle GetHeaderNoteBadgeRect(Rectangle headerCell) =>
            new(headerCell.Right - 18, headerCell.Y + 4, 16, 14);

        private static Rectangle GetYearNoteBadgeRect(Rectangle cell) =>
            new(cell.Right - 10, cell.Y + 2, 9, 8);

        private bool TryGetMiniMonthDayCellRect(
            DateTime day,
            Rectangle area,
            DateTime gridStart,
            int headerH,
            int cellW,
            int cellH,
            out Rectangle cell)
        {
            int dayIndex = (day.Date - gridStart.Date).Days;
            if (dayIndex < 0 || dayIndex >= 42)
            {
                cell = default;
                return false;
            }

            int week = dayIndex / 7;
            int col = dayIndex % 7;
            cell = new Rectangle(area.X + col * cellW, area.Y + headerH + week * cellH, cellW, cellH);
            return true;
        }

        private bool TryHitTestNoteIndicator(Point pt, Rectangle content, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            return _unit switch
            {
                CalendarDisplayUnit.Week => TryHitTestWeekNoteIndicator(pt, content, out noteId),
                CalendarDisplayUnit.Month => TryHitTestMonthNoteIndicator(pt, content, out noteId),
                CalendarDisplayUnit.Year => TryHitTestYearNoteIndicator(pt, content, out noteId),
                _ => false
            };
        }

        private bool TryHitTestWeekNoteIndicator(Point pt, Rectangle content, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            var weekStart = GetWeekStart(_focusDate);
            var weekEnd = weekStart.AddDays(6);
            var body = new Rectangle(content.X, content.Y + NavBarHeight, content.Width, content.Height - NavBarHeight);
            int colWidth = Math.Max(1, body.Width / 7);

            foreach (var note in _model.Notes.OrderByDescending(n => n.Id))
            {
                var displayDate = GetNoteDisplayDate(note);
                if (displayDate.Date < weekStart.Date || displayDate.Date > weekEnd.Date)
                    continue;

                int col = (displayDate.Date - weekStart.Date).Days;
                if (col < 0 || col > 6)
                    continue;

                var headerCell = new Rectangle(body.X + col * colWidth, body.Y, colWidth, DayHeaderHeight);
                if (GetHeaderNoteBadgeRect(headerCell).Contains(pt))
                {
                    noteId = note.Id;
                    return true;
                }
            }

            return false;
        }

        private bool TryHitTestYearNoteIndicator(Point pt, Rectangle content, out int noteId)
        {
            noteId = -1;
            if (_model == null)
                return false;

            var body = GetYearViewBody(content);

            for (int m = 0; m < 12; m++)
            {
                var layout = GetYearTileLayout(body, m);
                if (!layout.Tile.Contains(pt))
                    continue;

                var monthStart = new DateTime(_focusDate.Year, m + 1, 1);
                if (HitTestMiniMonthNotes(pt, layout.Mini, monthStart, out noteId))
                    return true;
            }

            return false;
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

        private readonly struct YearTileLayout
        {
            public Rectangle Tile { get; }
            public Rectangle Mini { get; }

            public YearTileLayout(Rectangle tile, Rectangle mini)
            {
                Tile = tile;
                Mini = mini;
            }
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
