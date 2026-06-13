using MyProject.Forms;
using MyProject.Models;
using MyProject.Rendering;
using MyProject.Theme;
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
        private TextBox? _projectNameEditor;
        private bool _editingProjectName;
        private bool _isCommittingEdit;
        private VScrollBar _scrollBar;
        private HScrollBar _hScrollBar;

        private const int ColumnCount = 7;
        private const int ColId = 0;
        private const int ColName = 1;
        private const int ColStart = 2;
        private const int ColDuration = 3;
        private const int ColProgress = 4;
        private const int ColAssigned = 5;
        private const int ColDeliverable = 6;
        private const int TreeIndent = 16;
        private const int ResizeGripWidth = 6;

        private readonly int[] _colWidths;
        private readonly int[] _minColWidths;
        private int _scrollX;
        private int _resizeColumnIndex = -1;
        private int _resizeStartMouseX;
        private int _resizeStartWidth;
        private int _hoverResizeColumnIndex = -1;
        private bool _isResizingColumn;

        public event EventHandler<int>? TaskSelected;
        public event EventHandler<int>? TaskHovered;
        public event EventHandler<int>? TaskDoubleClicked;
        public event EventHandler? ScrollChanged;
        public event EventHandler? ColumnWidthsChanged;
        public event EventHandler<ContextMenuRequestEventArgs>? ContextMenuRequested;

        public int ScrollOffsetY => _scrollY;

        public int[] GetColumnWidths() => (int[])_colWidths.Clone();

        public void ApplyColumnWidths(int[] widths)
        {
            var sanitized = ProjectViewSettings.SanitizeColumnWidths(widths);
            for (int i = 0; i < _colWidths.Length; i++)
                _colWidths[i] = sanitized[i];
            UpdateHScrollbar();
            Invalidate();
        }

        public TaskGridControl()
        {
            _colWidths = (int[])AppSettings.TaskGridColumnWidths.Clone();
            _minColWidths = AppSettings.GetMinColumnWidths();

            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.DoubleBuffer | ControlStyles.ResizeRedraw, true);

            _scrollBar = new VScrollBar
            {
                Dock = DockStyle.Right,
                SmallChange = AppTheme.RowHeight,
                LargeChange = AppTheme.RowHeight * 5
            };
            _scrollBar.Scroll += (s, e) => { _scrollY = _scrollBar.Value; ScrollChanged?.Invoke(this, EventArgs.Empty); Invalidate(); };

            _hScrollBar = new HScrollBar
            {
                Dock = DockStyle.Bottom,
                SmallChange = 16,
                LargeChange = 80
            };
            _hScrollBar.Scroll += (s, e) => { _scrollX = _hScrollBar.Value; Invalidate(); };

            Controls.Add(_scrollBar);
            Controls.Add(_hScrollBar);

            MouseDown += OnMouseDown;
            MouseMove += OnMouseMove;
            MouseUp += OnMouseUp;
            MouseWheel += OnMouseWheel;
            MouseDoubleClick += OnMouseDoubleClick;
            MouseEnter += OnMouseEnter;
            MouseLeave += (_, _) => NotifyTaskHovered(-1);
            Resize += (_, _) => { UpdateScrollbar(); UpdateHScrollbar(); };
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            UpdateHScrollbar();
        }

        private int ClientGridWidth => Math.Max(0, Width - _scrollBar.Width);
        private int ClientGridHeight => Math.Max(0, Height - _hScrollBar.Height);
        private int TotalContentWidth => _colWidths.Sum();
        private int ColumnLeft(int columnIndex)
        {
            int x = -_scrollX;
            for (int i = 0; i < columnIndex; i++)
                x += _colWidths[i];
            return x;
        }

        private int ColumnRight(int columnIndex) => ColumnLeft(columnIndex) + _colWidths[columnIndex];
        private int ContentXFromMouse(int mouseX) => mouseX + _scrollX;

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
            UpdateHScrollbar();
            Invalidate();
        }

        private void OnModelChanged(object? sender, EventArgs e)
        {
            UpdateScrollbar();
            Invalidate();
        }

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
            var g = e.Graphics;
            g.SetClip(new Rectangle(0, 0, ClientGridWidth, ClientGridHeight));
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            DrawHeader(g);
            DrawRows(g);
            DrawBorder(g);
        }

        private void DrawHeader(Graphics g)
        {
            int projectRowH = AppTheme.TaskGridProjectRowHeight;
            int columnTop = projectRowH;
            int columnRowH = AppTheme.TaskGridColumnHeaderHeight;

            var projectRect = new Rectangle(0, 0, ClientGridWidth, projectRowH);
            using (var bg = new LinearGradientBrush(projectRect, AppTheme.TimescaleBackground,
                       Color.FromArgb(230, 233, 240), LinearGradientMode.Vertical))
                g.FillRectangle(bg, projectRect);

            if (_model != null && !_editingProjectName)
            {
                var nameRect = new Rectangle(8, 0, ClientGridWidth - 16, projectRowH);
                using var nameBrush = new SolidBrush(AppTheme.TextPrimary);
                var nameFormat = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center,
                    Trimming = StringTrimming.EllipsisCharacter,
                    FormatFlags = StringFormatFlags.NoWrap
                };
                g.DrawString(_model.ProjectName, AppTheme.FontTimescaleLarge, nameBrush, nameRect, nameFormat);
            }

            using var dividerPen = new Pen(AppTheme.TimescaleBorder);
            g.DrawLine(dividerPen, 0, projectRowH, ClientGridWidth, projectRowH);

            var columnRect = new Rectangle(0, columnTop, ClientGridWidth, columnRowH);
            using (var columnBg = new SolidBrush(AppTheme.TimescaleBackground))
                g.FillRectangle(columnBg, columnRect);

            string[] headers = { "ID", "Task Name", "Start", "Days", "%", "Resource", "Deliverable" };
            for (int i = 0; i < ColumnCount; i++)
                DrawColumnHeader(g, ColumnLeft(i), headers[i], _colWidths[i], columnTop, columnRowH, i);

            g.DrawLine(dividerPen, 0, AppTheme.TimescaleHeaderHeight - 1, ClientGridWidth, AppTheme.TimescaleHeaderHeight - 1);
        }

        private void DrawColumnHeader(Graphics g, int x, string text, int width, int top, int height, int columnIndex)
        {
            if (x + width < 0 || x > ClientGridWidth)
                return;

            var rect = new Rectangle(x, top, width, height);
            using var textBrush = new SolidBrush(AppTheme.TimescaleText);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            g.DrawString(text, AppTheme.FontBold, textBrush, rect, sf);

            int dividerX = x + width - 1;
            bool highlightGrip = _isResizingColumn
                ? columnIndex == _resizeColumnIndex
                : columnIndex == _hoverResizeColumnIndex;
            using var pen = new Pen(highlightGrip ? AppTheme.Accent : AppTheme.TimescaleBorder, highlightGrip ? 2f : 1f);
            g.DrawLine(pen, dividerX, top + 4, dividerX, top + height - 4);
        }

        private void DrawRows(Graphics g)
        {
            if (_model == null) return;
            var visibleTasks = _model.GetVisibleTasks().ToList();
            int gridWidth = ClientGridWidth;

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
            var sfCenter = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };

            using var secondaryBrush = new SolidBrush(AppTheme.TextSecondary);

            if (ColumnRight(ColId) > 0 && ColumnLeft(ColId) < gridWidth)
            {
                g.DrawString(task.Id.ToString(), AppTheme.FontSmall, secondaryBrush,
                    new Rectangle(ColumnLeft(ColId), rowY, _colWidths[ColId], AppTheme.RowHeight), sfCenter);
                DrawColDivider(g, ColumnRight(ColId), rowY);
            }

            int nameColumnLeft = ColumnLeft(ColName);
            int nameX = DrawTreeGlyphs(g, task, rowY, nameColumnLeft);
            bool isSummary = _model!.IsSummaryTask(task.Id);
            var font = isSummary ? AppTheme.FontBold : AppTheme.FontTaskName;
            var textColor = isSummary ? AppTheme.TextPrimary
                          : task.IsCritical ? Color.FromArgb(180, 30, 20)
                          : AppTheme.TextPrimary;

            if (ColumnRight(ColName) > 0 && nameColumnLeft < gridWidth)
            {
                using var nameBrush = new SolidBrush(textColor);
                var nameRect = new Rectangle(nameX, rowY, ColumnRight(ColName) - nameX - 4, AppTheme.RowHeight);
                if (task.Id != _editingTaskId)
                    g.DrawString(task.Name, font, nameBrush, nameRect,
                        new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter });
                DrawColDivider(g, ColumnRight(ColName), rowY);
            }

            if (ColumnRight(ColStart) > 0 && ColumnLeft(ColStart) < gridWidth)
            {
                g.DrawString(task.StartDate.ToString("MM/dd/yy"), AppTheme.FontSmall, secondaryBrush,
                    new Rectangle(ColumnLeft(ColStart) + 2, rowY, _colWidths[ColStart] - 4, AppTheme.RowHeight),
                    new StringFormat { LineAlignment = StringAlignment.Center });
                DrawColDivider(g, ColumnRight(ColStart), rowY);
            }

            if (ColumnRight(ColDuration) > 0 && ColumnLeft(ColDuration) < gridWidth)
            {
                string durationText = task.TaskType == TaskType.Milestone ? "0" : task.DurationDays.ToString();
                g.DrawString(durationText, AppTheme.FontSmall, secondaryBrush,
                    new Rectangle(ColumnLeft(ColDuration), rowY, _colWidths[ColDuration], AppTheme.RowHeight), sfCenter);
                DrawColDivider(g, ColumnRight(ColDuration), rowY);
            }

            if (ColumnRight(ColProgress) > 0 && ColumnLeft(ColProgress) < gridWidth)
            {
                DrawProgressCell(g, task, ColumnLeft(ColProgress), rowY);
                DrawColDivider(g, ColumnRight(ColProgress), rowY);
            }

            string assignee = _model!.GetTaskAssigneeDisplay(task.Id);
            if (!string.IsNullOrWhiteSpace(assignee) && ColumnRight(ColAssigned) > 0 && ColumnLeft(ColAssigned) < gridWidth)
            {
                var assigneeRect = new Rectangle(ColumnLeft(ColAssigned) + 4, rowY, _colWidths[ColAssigned] - 8, AppTheme.RowHeight);
                g.DrawString(assignee, AppTheme.FontSmall, secondaryBrush, assigneeRect,
                    new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter });
                DrawColDivider(g, ColumnRight(ColAssigned), rowY);
            }

            string deliverable = FormatDeliverable(task.Deliverable);
            if (!string.IsNullOrWhiteSpace(deliverable) && ColumnRight(ColDeliverable) > 0 && ColumnLeft(ColDeliverable) < gridWidth)
            {
                var deliverableRect = new Rectangle(ColumnLeft(ColDeliverable) + 4, rowY, _colWidths[ColDeliverable] - 8, AppTheme.RowHeight);
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

            int treeLeft = nameColumnX + 4;

            if (task.IndentLevel > 0)
            {
                int taskIndex = _model.GetTaskIndex(task.Id);
                var tasks = _model.Tasks.ToList();
                int midY = rowY + AppTheme.RowHeight / 2;
                int level = task.IndentLevel;

                using var linePen = new Pen(AppTheme.GridLineColor);

                // For each ancestor level, draw a full vertical continuation line
                // if that ancestor still has siblings below the current task.
                for (int ancestorLevel = 1; ancestorLevel < level; ancestorLevel++)
                {
                    if (HasSiblingBelowAtLevel(tasks, taskIndex, ancestorLevel))
                    {
                        int ax = treeLeft + (ancestorLevel - 1) * TreeIndent + 7;
                        g.DrawLine(linePen, ax, rowY, ax, rowY + AppTheme.RowHeight);
                    }
                }

                // Draw the connector for this task's own level.
                int x = treeLeft + (level - 1) * TreeIndent + 7;
                bool siblingBelow = HasSiblingBelow(tasks, taskIndex);
                if (siblingBelow)
                    g.DrawLine(linePen, x, rowY, x, rowY + AppTheme.RowHeight);
                else
                    g.DrawLine(linePen, x, rowY, x, midY);
                g.DrawLine(linePen, x, midY, x + 8, midY);
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

        private static bool HasSiblingBelow(IReadOnlyList<ProjectTask> tasks, int taskIndex)
        {
            int level = tasks[taskIndex].IndentLevel;
            for (int i = taskIndex + 1; i < tasks.Count; i++)
            {
                if (tasks[i].IndentLevel < level) return false;
                if (tasks[i].IndentLevel == level) return true;
            }
            return false;
        }

        private static bool HasSiblingBelowAtLevel(List<ProjectTask> tasks, int taskIndex, int level)
        {
            for (int i = taskIndex + 1; i < tasks.Count; i++)
            {
                if (tasks[i].IndentLevel < level) return false;
                if (tasks[i].IndentLevel == level) return true;
            }
            return false;
        }

        private bool IsExpandClick(ProjectTask task, Point pt, int rowY)
        {
            if (_model == null || !_model.HasChildren(task.Id)) return false;

            int treeLeft = ColumnLeft(ColName) + 4;
            int contentX = treeLeft + task.IndentLevel * TreeIndent;
            var clickRect = new Rectangle(contentX, rowY, 14, AppTheme.RowHeight);
            return clickRect.Contains(pt);
        }

        private void DrawProgressCell(Graphics g, ProjectTask task, int x, int rowY)
        {
            var cellRect = new Rectangle(x + 4, rowY + (AppTheme.RowHeight - 8) / 2, _colWidths[ColProgress] - 8, 8);
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
            g.DrawLine(pen, ClientGridWidth - 1, 0, ClientGridWidth - 1, ClientGridHeight);
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

            if (e.Y < AppTheme.TimescaleHeaderHeight)
            {
                int resizeColumn = HitTestColumnResize(e.X, e.Y);
                if (resizeColumn >= 0)
                {
                    _isResizingColumn = true;
                    _resizeColumnIndex = resizeColumn;
                    _resizeStartMouseX = e.X;
                    _resizeStartWidth = _colWidths[resizeColumn];
                    Capture = true;
                    Invalidate();
                }
                return;
            }

            CommitEdit();
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

            ContextMenuTarget target;
            if (e.Y < AppTheme.TaskGridProjectRowHeight)
                target = ContextMenuTarget.TaskGridProjectHeader;
            else if (e.Y < AppTheme.TimescaleHeaderHeight)
                target = ContextMenuTarget.TaskGridHeader;
            else if (task != null)
                target = ContextMenuTarget.TaskGridTask;
            else
                target = ContextMenuTarget.TaskGridEmpty;

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
            if (_model == null) return;

            if (e.Y < AppTheme.TaskGridProjectRowHeight)
            {
                StartProjectNameEdit();
                return;
            }

            if (e.Y < AppTheme.TimescaleHeaderHeight) return;

            var task = HitTestTask(e.Location);
            if (task == null) return;

            if (ContentXFromMouse(e.X) >= ColumnLeft(ColName) && ContentXFromMouse(e.X) < ColumnRight(ColName))
            {
                StartInlineEdit(task);
                return;
            }
            TaskDoubleClicked?.Invoke(this, task.Id);
        }

        public void StartProjectNameEdit()
        {
            if (_model == null) return;

            CommitEdit();
            _editingProjectName = true;

            _projectNameEditor = new TextBox
            {
                Text = _model.ProjectName,
                Font = AppTheme.FontTimescaleLarge,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                ForeColor = AppTheme.TextPrimary,
                TextAlign = HorizontalAlignment.Center,
                Location = new Point(6, 2),
                Width = Math.Max(120, ClientGridWidth - 12),
                Height = AppTheme.TaskGridProjectRowHeight - 4
            };
            _projectNameEditor.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Escape)
                {
                    if (e.KeyCode == Keys.Enter) CommitEdit();
                    else CancelProjectNameEdit();
                }
            };
            _projectNameEditor.LostFocus += (s, e) => CommitEdit();
            Controls.Add(_projectNameEditor);
            _projectNameEditor.BringToFront();
            _projectNameEditor.Focus();
            _projectNameEditor.SelectAll();
            Invalidate();
        }

        private void StartInlineEdit(ProjectTask task)
        {
            CommitEdit();
            _editingTaskId = task.Id;

            var visibleTasks = _model!.GetVisibleTasks().ToList();
            int idx = visibleTasks.IndexOf(task);
            int rowY = AppTheme.TimescaleHeaderHeight + idx * AppTheme.RowHeight - _scrollY;
            int nameX = ColumnLeft(ColName) + 4 + task.IndentLevel * TreeIndent + (_model!.HasChildren(task.Id) ? 14 : 0);

            _inlineEditor = new TextBox
            {
                Text = task.Name,
                Font = AppTheme.FontTaskName,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                ForeColor = AppTheme.TextPrimary,
                Location = new Point(nameX, rowY + 3),
                Width = Math.Max(40, ColumnRight(ColName) - nameX - 4),
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
            if (_isCommittingEdit)
                return;

            _isCommittingEdit = true;
            try
            {
                CommitProjectNameEdit();

                var editor = _inlineEditor;
                int taskId = _editingTaskId;
                CancelTaskNameEdit();

                if (editor != null && taskId >= 0)
                {
                    var task = _model?.GetTask(taskId);
                    if (task != null && !string.IsNullOrWhiteSpace(editor.Text))
                        task.Name = editor.Text.Trim();
                }
            }
            finally
            {
                _isCommittingEdit = false;
            }
        }

        private void CommitProjectNameEdit()
        {
            var editor = _projectNameEditor;
            if (editor == null || !_editingProjectName || _model == null)
                return;

            var name = editor.Text;
            CancelProjectNameEdit();
            _model.SetProjectName(name);
        }

        private void CancelProjectNameEdit()
        {
            var editor = _projectNameEditor;
            _projectNameEditor = null;
            _editingProjectName = false;

            if (editor == null)
                return;

            Controls.Remove(editor);
            editor.Dispose();
            Invalidate();
        }

        private void CancelEdit()
        {
            CancelProjectNameEdit();
            CancelTaskNameEdit();
        }

        private void CancelTaskNameEdit()
        {
            var editor = _inlineEditor;
            _inlineEditor = null;
            _editingTaskId = -1;

            if (editor == null)
                return;

            Controls.Remove(editor);
            editor.Dispose();
            Invalidate();
        }

        private void OnMouseMove(object? sender, MouseEventArgs e)
        {
            if (_isResizingColumn && _resizeColumnIndex >= 0)
            {
                int delta = e.X - _resizeStartMouseX;
                _colWidths[_resizeColumnIndex] = Math.Clamp(
                    _resizeStartWidth + delta,
                    _minColWidths[_resizeColumnIndex],
                    800);
                UpdateHScrollbar();
                Invalidate();
                return;
            }

            if (e.Y < AppTheme.TimescaleHeaderHeight)
            {
                int resizeColumn = HitTestColumnResize(e.X, e.Y);
                if (resizeColumn != _hoverResizeColumnIndex)
                {
                    _hoverResizeColumnIndex = resizeColumn;
                    Invalidate();
                }

                if (resizeColumn >= 0)
                    Cursor = Cursors.VSplit;
                else if (e.Y < AppTheme.TaskGridProjectRowHeight)
                    Cursor = Cursors.IBeam;
                else
                    Cursor = Cursors.Default;
                return;
            }

            Cursor = Cursors.Default;
            if (_model == null) return;
            var task = HitTestTask(e.Location);
            int newHovered = task?.Id ?? -1;
            if (newHovered != _hoveredTaskId) { _hoveredTaskId = newHovered; Invalidate(); }
            NotifyTaskHovered(newHovered);
        }

        private void OnMouseEnter(object? sender, EventArgs e)
        {
            var pt = PointToClient(Cursor.Position);
            NotifyTaskHovered(HitTestTask(pt)?.Id ?? -1);
        }

        private void NotifyTaskHovered(int taskId) => TaskHovered?.Invoke(this, taskId);

        public void CancelInteraction()
        {
            CancelEdit();

            if (!_isResizingColumn)
                return;

            _isResizingColumn = false;
            _resizeColumnIndex = -1;
            Capture = false;
        }

        protected override void OnHandleDestroyed(EventArgs e)
        {
            CancelInteraction();
            base.OnHandleDestroyed(e);
        }

        private void OnMouseUp(object? sender, MouseEventArgs e)
        {
            if (!_isResizingColumn)
                return;

            _isResizingColumn = false;
            _resizeColumnIndex = -1;
            Capture = false;
            AppSettings.RememberTaskGridColumnWidths(_colWidths);
            ColumnWidthsChanged?.Invoke(this, EventArgs.Empty);
            Invalidate();
        }

        private void OnMouseWheel(object? sender, MouseEventArgs e)
        {
            if ((ModifierKeys & Keys.Shift) == Keys.Shift && _hScrollBar.Enabled)
            {
                int delta = -e.Delta / 3;
                int newVal = Math.Clamp(_hScrollBar.Value + delta, 0, _hScrollBar.Maximum);
                _hScrollBar.Value = newVal;
                _scrollX = newVal;
                Invalidate();
                return;
            }

            int vDelta = -e.Delta / 3;
            int newScroll = Math.Clamp(_scrollBar.Value + vDelta, 0, _scrollBar.Maximum);
            _scrollBar.Value = newScroll;
            _scrollY = newScroll;
            ScrollChanged?.Invoke(this, EventArgs.Empty);
            Invalidate();
        }

        private int HitTestColumnResize(int mouseX, int mouseY)
        {
            if (mouseY < AppTheme.TaskGridProjectRowHeight || mouseY >= AppTheme.TimescaleHeaderHeight)
                return -1;

            if (mouseX < 0 || mouseX > ClientGridWidth)
                return -1;

            int contentX = ContentXFromMouse(mouseX);
            int x = 0;
            for (int i = 0; i < ColumnCount; i++)
            {
                x += _colWidths[i];
                int dividerX = x;
                int screenDividerX = dividerX - _scrollX;
                if (Math.Abs(contentX - dividerX) <= ResizeGripWidth &&
                    screenDividerX >= 0 && screenDividerX <= ClientGridWidth)
                    return i;
            }

            return -1;
        }

        private void UpdateHScrollbar()
        {
            int clientW = ClientGridWidth;
            int totalW = TotalContentWidth;
            int scrollable = Math.Max(0, totalW - clientW);
            _hScrollBar.LargeChange = Math.Max(1, Math.Min(clientW, scrollable + 1));
            _hScrollBar.Maximum = Math.Max(0, scrollable + _hScrollBar.LargeChange - 1);
            _hScrollBar.Enabled = scrollable > 0;
            if (!_hScrollBar.Enabled)
            {
                _scrollX = 0;
                _hScrollBar.Value = 0;
            }
            else
            {
                _scrollX = Math.Clamp(_scrollX, 0, _hScrollBar.Maximum);
                _hScrollBar.Value = _scrollX;
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

        private void UpdateScrollbar()
        {
            if (_model == null) return;
            int totalRows = _model.GetVisibleTasks().Count();
            int totalH = totalRows * AppTheme.RowHeight;
            int visibleH = ClientGridHeight - AppTheme.TimescaleHeaderHeight;
            _scrollBar.Maximum = Math.Max(0, totalH - visibleH + _scrollBar.LargeChange);
            _scrollBar.Enabled = totalH > visibleH;
            if (!_scrollBar.Enabled) { _scrollY = 0; _scrollBar.Value = 0; }
        }
    }
}
