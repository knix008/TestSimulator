using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
using MyProject.Forms;
using System.Drawing.Drawing2D;

namespace MyProject.Controls
{
    public class TaskGridControl : Control
    {
        private ProjectModel? _model;
        private int _scrollY = 0;
        private int _selectedTaskId = -1;
        private int _hoveredTaskId = -1;
        private int _editingTaskId = -1;
        private TextBox? _inlineEditor;
        private VScrollBar _scrollBar;

        // Column widths
        private int _colId = 32;
        private int _colName = 130;
        private int _colStart = 58;
        private int _colDuration = 34;
        private int _colProgress = 30;
        private int _colAssigned = 88;
        private int _colDeliverable = 110;
        private const int TreeIndent = 16;

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? TaskDoubleClicked;
        public event EventHandler? ScrollChanged;
        public event EventHandler<ContextMenuRequestEventArgs>? ContextMenuRequested;

        public int ScrollOffsetY => _scrollY;

        public TaskGridControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.DoubleBuffer | ControlStyles.ResizeRedraw, true);

            _scrollBar = new VScrollBar
            {
                Dock = DockStyle.Right,
                SmallChange = AppTheme.RowHeight,
                LargeChange = AppTheme.RowHeight * 5
            };
            _scrollBar.Scroll += (s, e) => { _scrollY = _scrollBar.Value; ScrollChanged?.Invoke(this, EventArgs.Empty); Invalidate(); };
            Controls.Add(_scrollBar);

            MouseDown += OnMouseDown;
            MouseMove += OnMouseMove;
            MouseUp += OnMouseUp;
            MouseWheel += OnMouseWheel;
            MouseDoubleClick += OnMouseDoubleClick;
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
            UpdateScrollbar();
            Invalidate();
        }

        private void OnModelChanged(object? sender, EventArgs e) { UpdateScrollbar(); Invalidate(); }

        public void SetSelectedTask(int taskId)
        {
            _selectedTaskId = taskId;
            Invalidate();
        }

        public void SyncScroll(int scrollY)
        {
            _scrollY = scrollY;
            _scrollBar.Value = Math.Min(scrollY, Math.Max(0, _scrollBar.Maximum));
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            try
            {
                var g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                DrawHeader(g);
                DrawRows(g);
                DrawBorder(g);
            }
            catch (Exception ex)
            {
                if (!ExceptionHandler.IsShuttingDown)
                    ExceptionHandler.Show(FindForm(), "Draw Error", "Could not draw the task grid.", ex);
            }
        }

        private void DrawHeader(Graphics g)
        {
            var headerRect = new Rectangle(0, 0, Width - _scrollBar.Width, AppTheme.TimescaleHeaderHeight);
            using var bg = new LinearGradientBrush(headerRect, AppTheme.TimescaleBackground,
                Color.FromArgb(230, 233, 240), LinearGradientMode.Vertical);
            g.FillRectangle(bg, headerRect);

            // Column divider line
            using var dividerPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(dividerPen, 0, AppTheme.TimescaleHeaderHeight - 1, Width - _scrollBar.Width, AppTheme.TimescaleHeaderHeight - 1);

            // Draw column headers
            int x = 0;
            DrawColumnHeader(g, x, "ID", _colId, headerRect.Height);
            x += _colId;
            DrawColumnHeader(g, x, "Task Name", _colName, headerRect.Height);
            x += _colName;
            DrawColumnHeader(g, x, "Start", _colStart, headerRect.Height);
            x += _colStart;
            DrawColumnHeader(g, x, "Days", _colDuration, headerRect.Height);
            x += _colDuration;
            DrawColumnHeader(g, x, "%", _colProgress, headerRect.Height);
            x += _colProgress;
            DrawColumnHeader(g, x, "Resource", _colAssigned, headerRect.Height);
            x += _colAssigned;
            DrawColumnHeader(g, x, "Deliverable", _colDeliverable, headerRect.Height);
        }

        private void DrawColumnHeader(Graphics g, int x, string text, int width, int height)
        {
            var rect = new Rectangle(x, 0, width, height);
            using var textBrush = new SolidBrush(AppTheme.TimescaleText);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            g.DrawString(text, AppTheme.FontBold, textBrush, rect, sf);

            using var pen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(pen, x + width - 1, 4, x + width - 1, height - 4);
        }

        private void DrawRows(Graphics g)
        {
            if (_model == null) return;
            var visibleTasks = _model.GetVisibleTasks().ToList();
            int gridWidth = Width - _scrollBar.Width;

            for (int i = 0; i < visibleTasks.Count; i++)
            {
                var task = visibleTasks[i];
                int rowY = AppTheme.TimescaleHeaderHeight + i * AppTheme.RowHeight - _scrollY;

                if (rowY + AppTheme.RowHeight < AppTheme.TimescaleHeaderHeight) continue;
                if (rowY > Height) break;

                var rowRect = new Rectangle(0, rowY, gridWidth, AppTheme.RowHeight);

                // Row background
                Color rowBg = task.Id == _selectedTaskId ? AppTheme.RowSelectedColor
                            : task.Id == _hoveredTaskId ? AppTheme.RowHoverColor
                            : i % 2 == 1 ? AppTheme.RowAltColor
                            : AppTheme.SurfaceColor;
                using var rowBrush = new SolidBrush(rowBg);
                g.FillRectangle(rowBrush, rowRect);

                // Row grid line
                using var gridPen = new Pen(AppTheme.GridLineColor);
                g.DrawLine(gridPen, 0, rowY + AppTheme.RowHeight - 1, gridWidth, rowY + AppTheme.RowHeight - 1);

                DrawTaskRow(g, task, rowY, gridWidth);
            }
        }

        private void DrawTaskRow(Graphics g, ProjectTask task, int rowY, int gridWidth)
        {
            int x = 0;
            var sfCenter = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

            using var secondaryBrush = new SolidBrush(AppTheme.TextSecondary);
            g.DrawString(task.Id.ToString(), AppTheme.FontSmall, secondaryBrush,
                new Rectangle(x, rowY, _colId, AppTheme.RowHeight), sfCenter);
            DrawColDivider(g, x + _colId, rowY);
            x += _colId;

            int nameX = DrawTreeGlyphs(g, task, rowY, x);
            bool isSummary = _model!.IsSummaryTask(task.Id);
            var font = isSummary ? AppTheme.FontBold : AppTheme.FontTaskName;
            var textColor = isSummary ? AppTheme.TextPrimary
                          : task.IsCritical ? Color.FromArgb(180, 30, 20)
                          : AppTheme.TextPrimary;

            using var nameBrush = new SolidBrush(textColor);
            var nameRect = new Rectangle(nameX, rowY, x + _colName - nameX - 4, AppTheme.RowHeight);
            if (task.Id != _editingTaskId)
                g.DrawString(task.Name, font, nameBrush, nameRect, new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter });

            DrawColDivider(g, x + _colName, rowY);
            x += _colName;

            g.DrawString(task.StartDate.ToString("MM/dd/yy"), AppTheme.FontSmall, secondaryBrush,
                new Rectangle(x + 2, rowY, _colStart - 4, AppTheme.RowHeight), new StringFormat { LineAlignment = StringAlignment.Center });
            DrawColDivider(g, x + _colStart, rowY);
            x += _colStart;

            string durationText = task.TaskType == TaskType.Milestone
                ? "0"
                : task.DurationDays.ToString();
            g.DrawString(durationText, AppTheme.FontSmall, secondaryBrush,
                new Rectangle(x, rowY, _colDuration, AppTheme.RowHeight), sfCenter);
            DrawColDivider(g, x + _colDuration, rowY);
            x += _colDuration;

            DrawProgressCell(g, task, x, rowY);
            DrawColDivider(g, x + _colProgress, rowY);
            x += _colProgress;

            string assignee = _model!.GetTaskAssigneeDisplay(task.Id);
            if (!string.IsNullOrWhiteSpace(assignee))
            {
                var assigneeRect = new Rectangle(x + 4, rowY, _colAssigned - 8, AppTheme.RowHeight);
                g.DrawString(assignee, AppTheme.FontSmall, secondaryBrush, assigneeRect,
                    new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter });
            }
            DrawColDivider(g, x + _colAssigned, rowY);
            x += _colAssigned;

            string deliverable = FormatDeliverable(task.Deliverable);
            if (!string.IsNullOrWhiteSpace(deliverable))
            {
                var deliverableRect = new Rectangle(x + 4, rowY, _colDeliverable - 8, AppTheme.RowHeight);
                g.DrawString(deliverable, AppTheme.FontSmall, secondaryBrush, deliverableRect,
                    new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter });
            }
        }

        private static string FormatDeliverable(string? deliverable)
        {
            if (string.IsNullOrWhiteSpace(deliverable)) return "";

            return deliverable
                .Replace('\r', ' ')
                .Replace('\n', ' ')
                .Trim();
        }

        private int DrawTreeGlyphs(Graphics g, ProjectTask task, int rowY, int nameColumnX)
        {
            if (_model == null) return nameColumnX + 4;

            int taskIndex = _model.GetTaskIndex(task.Id);
            var tasks = _model.Tasks.ToList();
            int treeLeft = nameColumnX + 4;
            int midY = rowY + AppTheme.RowHeight / 2;

            using var linePen = new Pen(AppTheme.GridLineColor);
            for (int level = 1; level <= task.IndentLevel; level++)
            {
                int x = treeLeft + (level - 1) * TreeIndent + 7;
                bool branchContinuesBelow = HasBranchBelow(tasks, taskIndex, level);

                if (level < task.IndentLevel)
                {
                    if (branchContinuesBelow)
                        g.DrawLine(linePen, x, rowY, x, rowY + AppTheme.RowHeight);
                }
                else
                {
                    if (branchContinuesBelow)
                    {
                        g.DrawLine(linePen, x, rowY, x, rowY + AppTheme.RowHeight);
                        g.DrawLine(linePen, x, midY, x + 8, midY);
                    }
                    else
                    {
                        g.DrawLine(linePen, x, rowY, x, midY);
                        g.DrawLine(linePen, x, midY, x + 8, midY);
                    }
                }
            }

            int contentX = treeLeft + task.IndentLevel * TreeIndent;
            if (_model.HasChildren(task.Id))
            {
                var arrowRect = new Rectangle(contentX, rowY + (AppTheme.RowHeight - 10) / 2, 10, 10);
                DrawExpandArrow(g, arrowRect, task.IsExpanded);
                contentX += 14;
            }

            return contentX;
        }

        private static bool HasBranchBelow(IReadOnlyList<ProjectTask> tasks, int taskIndex, int level)
        {
            for (int i = taskIndex + 1; i < tasks.Count; i++)
            {
                if (tasks[i].IndentLevel < level)
                    return false;

                return true;
            }

            return false;
        }

        private bool IsExpandClick(ProjectTask task, Point pt, int rowY)
        {
            if (_model == null || !_model.HasChildren(task.Id)) return false;

            int treeLeft = _colId + 8;
            int contentX = treeLeft + task.IndentLevel * TreeIndent;
            var clickRect = new Rectangle(contentX, rowY, 14, AppTheme.RowHeight);
            return clickRect.Contains(pt);
        }

        private void DrawProgressCell(Graphics g, ProjectTask task, int x, int rowY)
        {
            var cellRect = new Rectangle(x + 4, rowY + (AppTheme.RowHeight - 8) / 2, _colProgress - 8, 8);
            using var bgBrush = new SolidBrush(Color.FromArgb(220, 224, 230));
            g.FillRoundedRectangle(bgBrush, cellRect, 3);

            if (task.Progress > 0)
            {
                int progW = (int)(cellRect.Width * task.Progress / 100.0);
                if (progW > 0)
                {
                    using var progBrush = new SolidBrush(AppTheme.Accent);
                    g.FillRoundedRectangle(progBrush, new Rectangle(cellRect.X, cellRect.Y, progW, cellRect.Height), 3);
                }
            }
        }

        private void DrawExpandArrow(Graphics g, Rectangle rect, bool expanded)
        {
            using var brush = new SolidBrush(AppTheme.TextSecondary);
            Point[] pts;
            if (expanded)
            {
                pts = new[] {
                    new Point(rect.Left, rect.Top + 2),
                    new Point(rect.Right, rect.Top + 2),
                    new Point(rect.Left + rect.Width / 2, rect.Bottom - 2)
                };
            }
            else
            {
                pts = new[] {
                    new Point(rect.Left + 2, rect.Top),
                    new Point(rect.Right - 2, rect.Top + rect.Height / 2),
                    new Point(rect.Left + 2, rect.Bottom)
                };
            }
            g.FillPolygon(brush, pts);
        }

        private void DrawColDivider(Graphics g, int x, int rowY)
        {
            using var pen = new Pen(AppTheme.GridLineColor);
            g.DrawLine(pen, x - 1, rowY + 3, x - 1, rowY + AppTheme.RowHeight - 3);
        }

        private void DrawBorder(Graphics g)
        {
            using var pen = new Pen(AppTheme.BorderColor, 1f);
            g.DrawLine(pen, Width - _scrollBar.Width - 1, 0, Width - _scrollBar.Width - 1, Height);
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

            if (e.Y < AppTheme.TimescaleHeaderHeight) return;

            var task = HitTestTask(e.Location);
            if (task == null)
            {
                CommitEdit();
                _selectedTaskId = -1;
                TaskSelected?.Invoke(this, -1);
                Invalidate();
                return;
            }

            CommitEdit();
            _selectedTaskId = task.Id;
            TaskSelected?.Invoke(this, task.Id);

            int rowY = GetRowY(task);
            if (IsExpandClick(task, e.Location, rowY))
            {
                _model.ToggleExpanded(task.Id);
                Invalidate();
                return;
            }

            Invalidate();
        }

        private int GetRowY(ProjectTask task)
        {
            var visibleTasks = _model!.GetVisibleTasks().ToList();
            int idx = visibleTasks.IndexOf(task);
            return AppTheme.TimescaleHeaderHeight + idx * AppTheme.RowHeight - _scrollY;
        }

        private void HandleRightClick(MouseEventArgs e)
        {
            CommitEdit();

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
                ? ContextMenuTarget.TaskGridHeader
                : task != null
                    ? ContextMenuTarget.TaskGridTask
                    : ContextMenuTarget.TaskGridEmpty;

            ContextMenuRequested?.Invoke(this, new ContextMenuRequestEventArgs
            {
                Target = target,
                TaskId = task?.Id ?? -1,
                Location = e.Location
            });

            Invalidate();
        }

        private void OnMouseDoubleClick(object? sender, MouseEventArgs e)
        {
            if (_model == null || e.Y < AppTheme.TimescaleHeaderHeight) return;
            var task = HitTestTask(e.Location);
            if (task == null) return;

            // Double click on name column -> inline edit
            if (e.X >= _colId && e.X < _colId + _colName)
            {
                StartInlineEdit(task);
                return;
            }
            TaskDoubleClicked?.Invoke(this, task.Id);
        }

        private void StartInlineEdit(ProjectTask task)
        {
            CommitEdit();
            _editingTaskId = task.Id;

            var visibleTasks = _model!.GetVisibleTasks().ToList();
            int idx = visibleTasks.IndexOf(task);
            int rowY = AppTheme.TimescaleHeaderHeight + idx * AppTheme.RowHeight - _scrollY;
            int nameX = _colId + 8 + task.IndentLevel * TreeIndent + (_model!.HasChildren(task.Id) ? 14 : 0);

            _inlineEditor = new TextBox
            {
                Text = task.Name,
                Font = AppTheme.FontTaskName,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                ForeColor = AppTheme.TextPrimary,
                Location = new Point(nameX, rowY + 3),
                Width = _colId + _colName - nameX - 8,
                Height = AppTheme.RowHeight - 6
            };
            _inlineEditor.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Escape)
                {
                    if (e.KeyCode == Keys.Enter) CommitEdit();
                    else CancelEdit();
                }
            };
            _inlineEditor.LostFocus += (s, e) => CommitEdit();
            Controls.Add(_inlineEditor);
            _inlineEditor.Focus();
            _inlineEditor.SelectAll();
            Invalidate();
        }

        private void CommitEdit()
        {
            if (_inlineEditor != null && _editingTaskId >= 0)
            {
                var task = _model?.GetTask(_editingTaskId);
                if (task != null && !string.IsNullOrWhiteSpace(_inlineEditor.Text))
                    task.Name = _inlineEditor.Text.Trim();
            }
            CancelEdit();
        }

        private void CancelEdit()
        {
            if (_inlineEditor != null)
            {
                Controls.Remove(_inlineEditor);
                _inlineEditor.Dispose();
                _inlineEditor = null;
            }
            _editingTaskId = -1;
            Invalidate();
        }

        private void OnMouseMove(object? sender, MouseEventArgs e)
        {
            if (_model == null) return;
            var task = HitTestTask(e.Location);
            int newHovered = task?.Id ?? -1;
            if (newHovered != _hoveredTaskId) { _hoveredTaskId = newHovered; Invalidate(); }
        }

        private void OnMouseUp(object? sender, MouseEventArgs e) { }

        private void OnMouseWheel(object? sender, MouseEventArgs e)
        {
            int delta = -e.Delta / 3;
            int newVal = Math.Clamp(_scrollBar.Value + delta, 0, _scrollBar.Maximum);
            _scrollBar.Value = newVal;
            _scrollY = newVal;
            ScrollChanged?.Invoke(this, EventArgs.Empty);
            Invalidate();
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

        private void UpdateScrollbar()
        {
            if (_model == null) return;
            int totalRows = _model.GetVisibleTasks().Count();
            int totalH = totalRows * AppTheme.RowHeight;
            int visibleH = Height - AppTheme.TimescaleHeaderHeight;
            _scrollBar.Maximum = Math.Max(0, totalH - visibleH + _scrollBar.LargeChange);
            _scrollBar.Enabled = totalH > visibleH;
            if (!_scrollBar.Enabled) { _scrollY = 0; _scrollBar.Value = 0; }
        }
    }
}
