using System.Drawing.Drawing2D;
using MyProject.Controls;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public class TaskPropertiesDialog : Form
    {
        private const int LabelColumnWidth = 188;
        private const int ValueColumnWidth = 380;
        private const int ColorSwatchWidth = 40;
        private const int ColorRowGap = 12;
        private const int ColorPreviewBarHeight = 18;
        private const int StandardRowHeight = 40;
        private const int MultilineRowHeight = 72;
        private const int InputControlHeight = 28;
        private const int ProgressInputWidth = 88;
        private const int ProgressRowGap = 8;

        private readonly ProjectTask _task;
        private readonly ProjectModel _model;

        // General tab
        private TextBox _txtName = null!;
        private DateTimePicker _dtpStart = null!;
        private NumericUpDown _nudDuration = null!;
        private NumericUpDown _nudProgress = null!;
        private ComboBox _cboType = null!;
        private TextBox _txtDeliverable = null!;
        private CheckBox _chkCritical = null!;
        private CheckBox _chkAutoSchedule = null!;

        // Colors
        private Panel _scheduleColorPreview = null!;
        private Panel _progressColorPreview = null!;
        private Panel _bandColorPreview = null!;
        private Panel _colorBarPreview = null!;
        private ComboBox _cboSummaryBarStyle = null!;
        private Color _scheduleColor = Color.Empty;
        private Color _progressColor = Color.Empty;
        private Color _bandColor = Color.Empty;
        private Color _originalBarColor;
        private Color _originalProgressColor;
        private Color _originalBandColor;
        private SummaryBarStyle _originalSummaryBarStyle;

        // Resources
        private DataGridView _gridResources = null!;
        private Label _lblResourceTotal = null!;
        private Panel _progressDisplay = null!;

        public TaskPropertiesDialog(ProjectTask task, ProjectModel model)
        {
            _task = task;
            _model = model;
            Build();
            LoadValues();
        }

        private void Build()
        {
            Text = $"Task Properties — {_task.Name}";
            Size = new Size(LabelColumnWidth + ValueColumnWidth + 80, 600);
            MinimumSize = Size;
            MaximumSize = Size;
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(12, 4) };
            tabs.TabPages.Add(BuildGeneralTab());
            tabs.TabPages.Add(BuildColorsTab());
            tabs.TabPages.Add(BuildResourcesTab());

            var btnOk = MakeButton("OK", true);
            var btnCancel = MakeButton("Cancel", false);
            btnOk.DialogResult = DialogResult.None;
            btnCancel.DialogResult = DialogResult.Cancel;
            btnOk.Click += (s, e) =>
            {
                if (SaveValues())
                    DialogResult = DialogResult.OK;
            };

            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8)
            };
            btnPanel.Controls.AddRange(new Control[] { btnCancel, btnOk });

            Controls.Add(tabs);
            Controls.Add(btnPanel);
            AcceptButton = btnOk;
            CancelButton = btnCancel;

            FormClosing += (_, _) =>
            {
                if (DialogResult != DialogResult.OK)
                {
                    _task.BarColor = _originalBarColor;
                    _task.ProgressColor = _originalProgressColor;
                    if (_task.ParentId == -1)
                        _task.BandColor = _originalBandColor;
                    if (_task.TaskType == TaskType.Summary)
                        _task.SummaryBarStyle = _originalSummaryBarStyle;
                    _model.NotifyViewsChanged();
                }
            };
        }

        private TabPage BuildGeneralTab()
        {
            var page = new TabPage("General");
            var layout = CreateTwoColumnLayout(9);
            layout.RowStyles[8] = new RowStyle(SizeType.Absolute, MultilineRowHeight);

            int r = 0;

            _txtName = new TextBox();
            AddLabeledRow(layout, ref r, "Task Name:", _txtName);

            _cboType = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _cboType.Items.AddRange(new object[] { "Normal", "Summary", "Milestone" });
            TaskTypeComboTooltips.Attach(_cboType);
            AddLabeledRow(layout, ref r, "Type:", _cboType);

            _dtpStart = new DateTimePicker { Format = DateTimePickerFormat.Short };
            AddLabeledRow(layout, ref r, "Start Date:", _dtpStart);

            _nudDuration = new NumericUpDown
            {
                Minimum = 1,
                Maximum = 3650,
                TextAlign = HorizontalAlignment.Center
            };
            AddLabeledRow(layout, ref r, "Duration (days):", _nudDuration, ProgressInputWidth);

            layout.Controls.Add(MakeLabel("Progress (%):"), 0, r);
            layout.Controls.Add(BuildProgressRow(), 1, r++);

            _chkAutoSchedule = new CheckBox
            {
                Text = "Cascade dependents when dates change",
                Checked = true,
                AutoEllipsis = true
            };
            AddLabeledRow(layout, ref r, "Auto-schedule:", _chkAutoSchedule, isCheckBox: true);

            _chkCritical = new CheckBox
            {
                Text = "On critical path (computed)",
                Enabled = false,
                AutoEllipsis = true
            };
            AddLabeledRow(layout, ref r, "Critical Path:", _chkCritical, isCheckBox: true);

            var txtAssigned = new TextBox { Name = "txtAssigned" };
            AddLabeledRow(layout, ref r, "Assigned To:", txtAssigned);

            _txtDeliverable = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical };
            AddLabeledRow(layout, ref r, "Deliverable:", _txtDeliverable, fillHeight: true);

            page.Controls.Add(layout);
            return page;
        }

        private Control BuildProgressRow()
        {
            var row = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Margin = Padding.Empty,
                Padding = Padding.Empty
            };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ProgressInputWidth));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            _nudProgress = new NumericUpDown
            {
                Minimum = 0,
                Maximum = 100,
                Margin = Padding.Empty,
                TextAlign = HorizontalAlignment.Center,
                Height = InputControlHeight,
                Anchor = AnchorStyles.Left | AnchorStyles.Top
            };

            _progressDisplay = new Panel
            {
                Height = InputControlHeight,
                Margin = Padding.Empty,
                BackColor = AppTheme.SurfaceColor
            };
            _progressDisplay.Paint += PaintProgressDisplay;

            _nudProgress.ValueChanged += (_, _) =>
            {
                _progressDisplay.Invalidate();
                RefreshColorBarPreview();
            };

            row.Controls.Add(MakeVerticallyCenteredCell(_nudProgress, ProgressInputWidth), 0, 0);

            var progressHost = MakeVerticallyCenteredStretchCell(_progressDisplay);
            progressHost.Padding = new Padding(ProgressRowGap, 0, 0, 0);
            row.Controls.Add(progressHost, 1, 0);
            return row;
        }

        private void PaintProgressDisplay(object? sender, PaintEventArgs e)
        {
            if (sender is not Panel panel)
                return;

            int progress = (int)(_nudProgress?.Value ?? 0);
            string label = $"{progress}%";

            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var bounds = new Rectangle(0, 0, panel.Width - 1, panel.Height - 1);

            using (var bgBrush = new SolidBrush(Color.FromArgb(220, 224, 230)))
                g.FillRectangle(bgBrush, bounds);

            if (progress > 0)
            {
                int fillWidth = Math.Max(1, (int)(bounds.Width * progress / 100.0));
                using var fillBrush = new SolidBrush(AppTheme.Accent);
                g.FillRectangle(fillBrush, new Rectangle(bounds.X, bounds.Y, fillWidth, bounds.Height));
            }

            using (var borderPen = new Pen(AppTheme.BorderColor))
                g.DrawRectangle(borderPen, bounds);

            bool lightText = progress >= 45;
            Color textColor = lightText ? Color.White : AppTheme.TextPrimary;
            const TextFormatFlags flags = TextFormatFlags.HorizontalCenter
                | TextFormatFlags.VerticalCenter
                | TextFormatFlags.SingleLine
                | TextFormatFlags.NoPadding
                | TextFormatFlags.EndEllipsis;

            TextRenderer.DrawText(g, label, AppTheme.FontSmall, bounds, textColor, flags);
        }

        private TabPage BuildColorsTab()
        {
            var page = new TabPage("Colors & Shape");
            bool isRootTask = _task.ParentId == -1;

            // 4-column layout: [label | swatch | gap | buttons/control]
            // Rows: Schedule color, Progress color, Group color, Bar shape, Bar preview, spacer
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                ColumnCount = 4,
                RowCount = 6
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColumnWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ColorSwatchWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ColorRowGap));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            for (int i = 0; i < 5; i++)
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, StandardRowHeight));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f)); // bottom spacer

            int r = 0;

            void LiveRefresh() { RefreshColorBarPreview(); _model.NotifyViewsChanged(); }

            // Schedule bar color
            _scheduleColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeLabel("Schedule bar color:"), 0, r);
            layout.Controls.Add(MakeVerticallyCenteredCell(_scheduleColorPreview, ColorSwatchWidth), 1, r);
            layout.Controls.Add(
                MakeLeftAlignedCell(CreateColorButtons(
                    () => _scheduleColor,
                    c => { _scheduleColor = c; _task.BarColor = c; },
                    _scheduleColorPreview, LiveRefresh)),
                3, r++);

            // Progress bar color
            _progressColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeLabel("Progress bar color:"), 0, r);
            layout.Controls.Add(MakeVerticallyCenteredCell(_progressColorPreview, ColorSwatchWidth), 1, r);
            layout.Controls.Add(
                MakeLeftAlignedCell(CreateColorButtons(
                    () => _progressColor,
                    c => { _progressColor = c; _task.ProgressColor = c; },
                    _progressColorPreview, LiveRefresh)),
                3, r++);

            // Group row color
            _bandColorPreview = CreateColorPreviewPanel();
            var bandSwatchCell = MakeVerticallyCenteredCell(_bandColorPreview, ColorSwatchWidth);
            var bandButtonsCell = MakeLeftAlignedCell(CreateColorButtons(
                () => _bandColor,
                c => { _bandColor = c; if (_task.ParentId == -1) _task.BandColor = c; },
                _bandColorPreview, LiveRefresh));
            if (!isRootTask)
            {
                bandSwatchCell.Enabled = false;
                bandButtonsCell.Enabled = false;
            }
            layout.Controls.Add(MakeLabel("Group row color:"), 0, r);
            layout.Controls.Add(bandSwatchCell, 1, r);
            layout.Controls.Add(bandButtonsCell, 3, r++);

            // Bar shape (Summary tasks only) — spans swatch+gap+buttons columns
            bool isSummary = _task.TaskType == TaskType.Summary;
            _cboSummaryBarStyle = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                DrawMode = DrawMode.OwnerDrawFixed,
                FlatStyle = FlatStyle.Flat,
                Enabled = isSummary
            };
            _cboSummaryBarStyle.ItemHeight = InputControlHeight - 4;
            _cboSummaryBarStyle.DrawItem += DrawSummaryBarStyleItem;
            _cboSummaryBarStyle.Items.AddRange(new object[] { "Standard (brackets)", "Rounded", "Bracket caps", "Arrow / Chevron" });
            _cboSummaryBarStyle.SelectedIndexChanged += (_, _) =>
            {
                if (_cboSummaryBarStyle.SelectedIndex >= 0 && _task.TaskType == TaskType.Summary)
                {
                    _task.SummaryBarStyle = (SummaryBarStyle)_cboSummaryBarStyle.SelectedIndex;
                    _model.NotifyViewsChanged();
                }
            };
            var shapeCell = MakeVerticallyCenteredStretchCell(_cboSummaryBarStyle);
            layout.Controls.Add(MakeLabel("Bar shape:"), 0, r);
            layout.Controls.Add(shapeCell, 1, r);
            layout.SetColumnSpan(shapeCell, 3);
            r++;

            // Bar preview — spans swatch+gap+buttons columns, shorter height
            _colorBarPreview = new Panel
            {
                Height = ColorPreviewBarHeight,
                Margin = Padding.Empty,
                BackColor = AppTheme.SurfaceColor
            };
            _colorBarPreview.Paint += PaintColorBarPreview;
            var previewCell = MakeVerticallyCenteredStretchCell(_colorBarPreview);
            layout.Controls.Add(MakeLabel("Bar preview:"), 0, r);
            layout.Controls.Add(previewCell, 1, r);
            layout.SetColumnSpan(previewCell, 3);

            page.Controls.Add(layout);
            return page;
        }

        private FlowLayoutPanel CreateColorButtons(
            Func<Color> getColor,
            Action<Color> setColor,
            Panel preview,
            Action? onChanged = null)
        {
            var panel = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                AutoSize = false,
                Height = InputControlHeight,
                Margin = Padding.Empty,
                Padding = Padding.Empty
            };

            var btnChoose = new Button
            {
                Text = "Choose...",
                Width = 88,
                Height = InputControlHeight,
                FlatStyle = FlatStyle.Flat,
                Margin = new Padding(0, 0, 8, 0)
            };
            var btnDefault = new Button
            {
                Text = "Default",
                Width = 72,
                Height = InputControlHeight,
                FlatStyle = FlatStyle.Flat,
                Margin = Padding.Empty
            };
            panel.Controls.AddRange(new Control[] { btnChoose, btnDefault });

            btnChoose.Click += (_, _) =>
            {
                var current = getColor();
                using var dlg = new ColorDialog { Color = current == Color.Empty ? AppTheme.TaskBarNormal : current };
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    setColor(dlg.Color);
                    preview.BackColor = dlg.Color;
                    onChanged?.Invoke();
                }
            };
            btnDefault.Click += (_, _) =>
            {
                setColor(Color.Empty);
                preview.BackColor = Color.LightGray;
                onChanged?.Invoke();
            };

            return panel;
        }

        private void PaintColorBarPreview(object? sender, PaintEventArgs e)
        {
            if (sender is not Panel previewPanel)
                return;

            int progress = (int)(_nudProgress?.Value ?? 0);
            string label = $"{progress}%";

            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var bounds = new Rectangle(0, 0, previewPanel.Width - 1, previewPanel.Height - 1);

            var bc = _scheduleColor == Color.Empty ? AppTheme.TaskBarNormal : _scheduleColor;
            var pc = _progressColor == Color.Empty ? AppTheme.TaskBarProgress : _progressColor;

            using (var bgBrush = new SolidBrush(bc))
                g.FillRectangle(bgBrush, bounds);

            if (progress > 0)
            {
                int fillWidth = Math.Max(1, (int)(bounds.Width * progress / 100.0));
                using var pb = new SolidBrush(pc);
                g.FillRectangle(pb, new Rectangle(bounds.X, bounds.Y, fillWidth, bounds.Height));
            }

            using (var borderPen = new Pen(AppTheme.BorderColor))
                g.DrawRectangle(borderPen, bounds);

            bool lightText = progress >= 45;
            Color textColor = lightText ? Color.White : AppTheme.TextPrimary;
            const TextFormatFlags flags = TextFormatFlags.HorizontalCenter
                | TextFormatFlags.VerticalCenter
                | TextFormatFlags.SingleLine
                | TextFormatFlags.NoPadding
                | TextFormatFlags.EndEllipsis;

            TextRenderer.DrawText(g, label, AppTheme.FontSmall, bounds, textColor, flags);
        }

        private void RefreshColorBarPreview() => _colorBarPreview?.Invalidate();

        private static readonly Color SummaryPreviewColor = Color.FromArgb(168, 208, 245);

        private void DrawSummaryBarStyleItem(object? sender, DrawItemEventArgs e)
        {
            if (e.Index < 0 || sender is not ComboBox combo) return;
            e.DrawBackground();

            const int previewWidth = 56;
            const int previewPad = 6;

            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            int barH = 10;
            int barY = e.Bounds.Y + (e.Bounds.Height - barH) / 2;
            var barRect = new Rectangle(e.Bounds.X + previewPad, barY, previewWidth - previewPad * 2, barH);

            DrawMiniSummaryBar(g, barRect, (SummaryBarStyle)e.Index, SummaryPreviewColor);

            using (var divPen = new Pen(Color.FromArgb(180, 180, 200)))
                g.DrawLine(divPen, e.Bounds.X + previewWidth, e.Bounds.Y + 2, e.Bounds.X + previewWidth, e.Bounds.Bottom - 2);

            var textRect = new Rectangle(
                e.Bounds.X + previewWidth + 6,
                e.Bounds.Y,
                e.Bounds.Width - previewWidth - 6,
                e.Bounds.Height);

            bool selected = (e.State & DrawItemState.Selected) != 0;
            Color textColor = selected ? SystemColors.HighlightText : AppTheme.TextPrimary;
            TextRenderer.DrawText(g, combo.Items[e.Index]?.ToString(), AppTheme.FontNormal, textRect, textColor,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.SingleLine);

            e.DrawFocusRectangle();
        }

        private static void DrawMiniSummaryBar(Graphics g, Rectangle barRect, SummaryBarStyle style, Color color)
        {
            using var brush = new SolidBrush(color);

            switch (style)
            {
                case SummaryBarStyle.Standard:
                {
                    g.FillRectangle(brush, barRect);
                    int capW = Math.Max(3, barRect.Height / 2);
                    g.FillPolygon(brush, new Point[] {
                        new(barRect.Left, barRect.Bottom),
                        new(barRect.Left + capW, barRect.Bottom),
                        new(barRect.Left, barRect.Bottom + capW)
                    });
                    g.FillPolygon(brush, new Point[] {
                        new(barRect.Right, barRect.Bottom),
                        new(barRect.Right - capW, barRect.Bottom),
                        new(barRect.Right, barRect.Bottom + capW)
                    });
                    break;
                }
                case SummaryBarStyle.Rounded:
                {
                    int r = barRect.Height / 2;
                    int d = r * 2;
                    using var path = new GraphicsPath();
                    path.AddArc(barRect.Left, barRect.Top, d, d, 180, 90);
                    path.AddArc(barRect.Right - d, barRect.Top, d, d, 270, 90);
                    path.AddArc(barRect.Right - d, barRect.Bottom - d, d, d, 0, 90);
                    path.AddArc(barRect.Left, barRect.Bottom - d, d, d, 90, 90);
                    path.CloseFigure();
                    g.FillPath(brush, path);
                    break;
                }
                case SummaryBarStyle.Bracket:
                {
                    g.FillRectangle(brush, barRect);
                    int capH = Math.Max(3, barRect.Height / 2);
                    int capW = Math.Max(2, barRect.Height / 3 + 1);
                    g.FillRectangle(brush, new Rectangle(barRect.Left, barRect.Bottom - 1, capW, capH));
                    g.FillRectangle(brush, new Rectangle(barRect.Right - capW, barRect.Bottom - 1, capW, capH));
                    break;
                }
                case SummaryBarStyle.Arrow:
                {
                    int arrowW = Math.Max(3, barRect.Height / 2);
                    int midY = barRect.Top + barRect.Height / 2;
                    g.FillPolygon(brush, new Point[] {
                        new(barRect.Left,           barRect.Top),
                        new(barRect.Right - arrowW, barRect.Top),
                        new(barRect.Right,           midY),
                        new(barRect.Right - arrowW, barRect.Bottom),
                        new(barRect.Left,           barRect.Bottom),
                    });
                    break;
                }
            }
        }

        private static Panel CreateColorPreviewPanel() =>
            new Panel { Width = ColorSwatchWidth, Height = InputControlHeight, BorderStyle = BorderStyle.FixedSingle };

        private TabPage BuildResourcesTab()
        {
            var page = new TabPage("Resources");
            page.Padding = new Padding(8);

            var lblInfo = new Label
            {
                Text = "Assign resources. Allocation can exceed 100% when needed.",
                Dock = DockStyle.Top,
                Height = 26,
                ForeColor = AppTheme.TextSecondary,
                Font = AppTheme.FontSmall
            };

            _gridResources = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = true,
                AllowUserToDeleteRows = true,
                RowHeadersVisible = false,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.None,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                Font = AppTheme.FontSmall,
                ColumnHeadersHeight = 26,
                EnableHeadersVisualStyles = false,
                ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
                {
                    Alignment = DataGridViewContentAlignment.MiddleCenter,
                    Font = AppTheme.FontBold,
                    BackColor = AppTheme.TimescaleBackground,
                    ForeColor = AppTheme.TextPrimary
                }
            };
            _gridResources.RowTemplate.Height = 24;
            _gridResources.Columns.Add(new DataGridViewTextBoxColumn
            { Name = "ResourceName", HeaderText = "Resource", FillWeight = 50, MinimumWidth = 120 });
            var allocCol = new DataGridViewTextBoxColumn
            {
                Name = "AllocationPercent",
                HeaderText = "Alloc %",
                FillWeight = 50,
                MinimumWidth = 80
            };
            allocCol.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
            allocCol.DefaultCellStyle.NullValue = "";
            _gridResources.Columns.Add(allocCol);

            _lblResourceTotal = new Label
            {
                Dock = DockStyle.Bottom,
                Height = 26,
                TextAlign = ContentAlignment.MiddleRight,
                Font = AppTheme.FontSmall,
                ForeColor = AppTheme.TextSecondary,
                Text = "Total: 0%"
            };

            _gridResources.CellEndEdit += (_, _) => UpdateResourceTotal();
            _gridResources.UserDeletedRow += (_, _) => UpdateResourceTotal();
            _gridResources.RowsAdded += (_, _) => UpdateResourceTotal();

            _gridResources.CellValidating += (_, e) =>
            {
                if (_gridResources.Columns[e.ColumnIndex].Name != "AllocationPercent") return;
                string? val = e.FormattedValue?.ToString();
                if (!string.IsNullOrEmpty(val) && (!double.TryParse(val, out double d) || d < 0))
                {
                    MessageBox.Show(
                        $"Allocation percent must be a number of 0 or greater.\nEntered value: {val}",
                        "Invalid Input", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    e.Cancel = true;
                }
            };

            page.Controls.Add(_gridResources);
            page.Controls.Add(lblInfo);
            page.Controls.Add(_lblResourceTotal);
            return page;
        }

        private void LoadValues()
        {
            _txtName.Text = _task.Name;
            _cboType.SelectedIndex = (int)_task.TaskType;
            _dtpStart.Value = _task.StartDate;
            _nudDuration.Value = _task.DurationDays;
            _nudProgress.Value = (decimal)_task.Progress;
            _progressDisplay?.Invalidate();
            _chkCritical.Checked = _task.IsCritical;
            _chkAutoSchedule.Checked = _task.AutoSchedule;
            _txtDeliverable.Text = _task.Deliverable;

            _scheduleColor = _task.BarColor;
            _progressColor = _task.ProgressColor;
            _bandColor = _task.BandColor;
            _originalBarColor = _task.BarColor;
            _originalProgressColor = _task.ProgressColor;
            _originalBandColor = _task.BandColor;
            _originalSummaryBarStyle = _task.SummaryBarStyle;
            _scheduleColorPreview.BackColor = _scheduleColor == Color.Empty ? Color.LightGray : _scheduleColor;
            _progressColorPreview.BackColor = _progressColor == Color.Empty ? Color.LightGray : _progressColor;
            var effective = _bandColor.IsEmpty ? _model.GetTaskBandColor(_task.Id) : _bandColor;
            _bandColorPreview.BackColor = effective.IsEmpty ? Color.LightGray : effective;

            _cboSummaryBarStyle.SelectedIndex = (int)_task.SummaryBarStyle;
            _colorBarPreview?.Invalidate();

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) txtAssigned.Text = _model.GetTaskAssigneeDisplay(_task.Id);

            _gridResources.Rows.Clear();
            foreach (var a in _model.GetAssignments(_task.Id))
                _gridResources.Rows.Add(a.ResourceName, ProjectModel.FormatResourceAllocationEditDisplay(a.AllocationPercent));
            UpdateResourceTotal();

            bool readOnlySchedule = _model.IsSummaryTask(_task.Id);
            _dtpStart.Enabled = !readOnlySchedule;
            _nudDuration.Enabled = !readOnlySchedule;
            _nudProgress.Enabled = !readOnlySchedule;
            _chkAutoSchedule.Enabled = !readOnlySchedule;
            _cboType.Enabled = !readOnlySchedule;
        }

        private bool SaveValues()
        {
            if (!string.IsNullOrWhiteSpace(_txtName.Text))
                _task.Name = _txtName.Text.Trim();

            bool readOnlySchedule = _model.IsSummaryTask(_task.Id);
            if (!readOnlySchedule)
            {
                _task.TaskType = (TaskType)_cboType.SelectedIndex;

                var oldStart = _task.StartDate;
                _task.StartDate = _dtpStart.Value.Date;
                _task.DurationDays = (int)_nudDuration.Value;
                _task.Progress = (double)_nudProgress.Value;
                _task.AutoSchedule = _chkAutoSchedule.Checked;

                if (_task.AutoSchedule && _task.StartDate != oldStart)
                    _model.CascadeDependencies(_task.Id);
            }

            _task.Deliverable = _txtDeliverable.Text;
            _task.BarColor = _scheduleColor;
            _task.ProgressColor = _progressColor;
            if (_task.ParentId == -1)
                _task.BandColor = _bandColor;
            if (_task.TaskType == TaskType.Summary && _cboSummaryBarStyle.SelectedIndex >= 0)
                _task.SummaryBarStyle = (SummaryBarStyle)_cboSummaryBarStyle.SelectedIndex;

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) _task.AssignedTo = txtAssigned.Text;

            var resourceLines = new List<string>();
            foreach (DataGridViewRow row in _gridResources.Rows)
            {
                if (row.IsNewRow) continue;
                string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
                if (string.IsNullOrEmpty(name)) continue;
                if (!ProjectModel.TryParseAllocationNumber(row.Cells["AllocationPercent"].Value?.ToString() ?? "", out double pct))
                    pct = 100;
                if (pct <= 0) continue;
                resourceLines.Add(ProjectModel.FormatResourceEditLine(name, pct));
            }

            string resourceText = string.Join(Environment.NewLine, resourceLines);
            if (!_model.TrySetTaskResourcesFromText(_task.Id, resourceText, out string? resourceError))
            {
                MessageBox.Show(resourceError, "Invalid Allocation", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            _task.AssignedTo = _model.GetTaskAssigneeDisplay(_task.Id);
            _model.NotifyViewsChanged();
            return true;
        }

        private void UpdateResourceTotal()
        {
            double total = 0;
            foreach (DataGridViewRow row in _gridResources.Rows)
            {
                if (row.IsNewRow)
                    continue;

                string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
                if (string.IsNullOrEmpty(name))
                    continue;

                string? allocText = row.Cells["AllocationPercent"].Value?.ToString();
                if (string.IsNullOrWhiteSpace(allocText))
                    total += 100;
                else if (ProjectModel.TryParseAllocationNumber(allocText, out double pct))
                    total += pct;
            }

            _lblResourceTotal.Text = $"Total: {total:0}%";
            _lblResourceTotal.ForeColor = total > 100 ? Color.Red : AppTheme.TextSecondary;
        }

        private static readonly Padding LabelCellPadding = new(0, 0, 10, 0);

        private static TableLayoutPanel CreateTwoColumnLayout(int rowCount)
        {
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                ColumnCount = 2,
                RowCount = rowCount
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColumnWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            for (int i = 0; i < rowCount; i++)
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, StandardRowHeight));
            return layout;
        }

        private static void AddLabeledRow(
            TableLayoutPanel layout,
            ref int row,
            string labelText,
            Control valueControl,
            int? fixedWidth = null,
            bool isCheckBox = false,
            bool fillHeight = false)
        {
            layout.Controls.Add(MakeLabel(labelText), 0, row);
            layout.Controls.Add(
                fillHeight
                    ? MakeFillHeightCell(valueControl)
                    : isCheckBox
                        ? MakeCheckBoxCell(valueControl)
                        : MakeVerticallyCenteredStretchCell(valueControl, fixedWidth),
                1,
                row);
            row++;
        }

        private static Label MakeLabel(string text) => new()
        {
            Text = text,
            TextAlign = ContentAlignment.MiddleRight,
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextSecondary,
            AutoSize = false,
            Margin = Padding.Empty,
            Padding = LabelCellPadding
        };

        private static Panel MakeVerticallyCenteredCell(Control content, int width)
        {
            PrepareInputControl(content);
            content.Width = width;
            content.Anchor = AnchorStyles.Left | AnchorStyles.Top;

            var host = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = Padding.Empty };
            host.Controls.Add(content);

            void LayoutContent()
            {
                content.Top = Math.Max(0, (host.ClientSize.Height - content.Height) / 2);
                content.Left = 0;
                content.Width = width;
            }

            host.Resize += (_, _) => LayoutContent();
            host.HandleCreated += (_, _) => LayoutContent();
            return host;
        }

        private static Panel MakeVerticallyCenteredStretchCell(Control content, int? fixedWidth = null)
        {
            if (content is CheckBox)
                return MakeCheckBoxCell(content);

            PrepareInputControl(content);
            content.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top;

            var host = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = Padding.Empty };
            host.Controls.Add(content);

            void LayoutContent()
            {
                content.Top = Math.Max(0, (host.ClientSize.Height - content.Height) / 2);
                content.Left = host.Padding.Left;
                int availableWidth = host.ClientSize.Width - host.Padding.Horizontal;
                content.Width = fixedWidth ?? Math.Max(40, availableWidth);
            }

            host.Resize += (_, _) => LayoutContent();
            host.HandleCreated += (_, _) => LayoutContent();
            return host;
        }

        private static Panel MakeLeftAlignedCell(Control content) => MakeCheckBoxCell(content);

        private static Panel MakeCheckBoxCell(Control content)
        {
            content.AutoSize = true;
            content.Margin = Padding.Empty;
            content.Anchor = AnchorStyles.Left | AnchorStyles.Top;

            var host = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = Padding.Empty };
            host.Controls.Add(content);

            void LayoutContent()
            {
                content.Top = Math.Max(0, (host.ClientSize.Height - content.Height) / 2);
                content.Left = 0;
            }

            host.Resize += (_, _) => LayoutContent();
            host.HandleCreated += (_, _) => LayoutContent();
            // Re-center when the content auto-sizes (e.g. FlowLayoutPanel after buttons are laid out)
            content.SizeChanged += (_, _) => LayoutContent();
            return host;
        }

        private static Panel MakeFillHeightCell(Control content)
        {
            content.Dock = DockStyle.Fill;
            content.Margin = Padding.Empty;

            var host = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = Padding.Empty };
            host.Controls.Add(content);
            return host;
        }

        private static void PrepareInputControl(Control control)
        {
            control.Margin = Padding.Empty;
            if (control is TextBox or ComboBox or DateTimePicker or NumericUpDown)
                control.Height = InputControlHeight;
        }

        private static Button MakeButton(string text, bool primary)
        {
            var btn = new Button { Text = text, Width = 80, Height = 28, FlatStyle = FlatStyle.Flat };
            btn.FlatAppearance.BorderSize = 1;
            if (primary)
            {
                btn.BackColor = AppTheme.Accent;
                btn.ForeColor = Color.White;
                btn.FlatAppearance.BorderColor = AppTheme.AccentDark;
            }
            else
            {
                btn.BackColor = AppTheme.SurfaceColor;
                btn.ForeColor = AppTheme.TextPrimary;
                btn.FlatAppearance.BorderColor = AppTheme.BorderColor;
            }

            return btn;
        }
    }
}
