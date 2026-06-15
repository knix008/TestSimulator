using MyProject.Controls;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public class TaskPropertiesDialog : Form
    {
        private const int LabelColumnWidth = 172;
        private const int ValueColumnWidth = 360;
        private const int ColorPreviewColumnWidth = 48;
        private const int StandardRowHeight = 36;
        private const int TallRowHeight = 44;

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
        private Color _scheduleColor = Color.Empty;
        private Color _progressColor = Color.Empty;
        private Color _bandColor = Color.Empty;

        // Resources
        private DataGridView _gridResources = null!;
        private Label _lblResourceTotal = null!;

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
            Size = new Size(LabelColumnWidth + ValueColumnWidth + 72, 580);
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
                Dock = DockStyle.Bottom, Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8)
            };
            btnPanel.Controls.AddRange(new Control[] { btnCancel, btnOk });

            Controls.Add(tabs);
            Controls.Add(btnPanel);
            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }

        private TabPage BuildGeneralTab()
        {
            var page = new TabPage("General");
            var layout = CreateTwoColumnLayout(9);
            layout.RowStyles[4] = new RowStyle(SizeType.Absolute, TallRowHeight);
            layout.RowStyles[5] = new RowStyle(SizeType.Absolute, TallRowHeight);
            layout.RowStyles[6] = new RowStyle(SizeType.Absolute, TallRowHeight);
            layout.RowStyles[8] = new RowStyle(SizeType.Absolute, 72);

            int r = 0;

            layout.Controls.Add(MakeLabel("Task Name:"), 0, r);
            _txtName = new TextBox { Dock = DockStyle.Fill, Margin = FieldMargin };
            layout.Controls.Add(_txtName, 1, r++);

            layout.Controls.Add(MakeLabel("Type:"), 0, r);
            _cboType = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, Margin = FieldMargin };
            _cboType.Items.AddRange(new object[] { "Normal", "Summary", "Milestone" });
            TaskTypeComboTooltips.Attach(_cboType);
            layout.Controls.Add(_cboType, 1, r++);

            layout.Controls.Add(MakeLabel("Start Date:"), 0, r);
            _dtpStart = new DateTimePicker { Dock = DockStyle.Fill, Format = DateTimePickerFormat.Short, Margin = FieldMargin };
            layout.Controls.Add(_dtpStart, 1, r++);

            layout.Controls.Add(MakeLabel("Duration (days):"), 0, r);
            _nudDuration = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 1, Maximum = 3650, Margin = FieldMargin };
            layout.Controls.Add(_nudDuration, 1, r++);

            layout.Controls.Add(MakeLabel("Progress (%):"), 0, r);
            var progPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                Margin = FieldMargin
            };
            progPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
            progPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            _nudProgress = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 0, Maximum = 100, Margin = Padding.Empty };
            var progressBar = new ProgressBar { Dock = DockStyle.Fill, Minimum = 0, Maximum = 100, Margin = new Padding(8, 6, 0, 6) };
            _nudProgress.ValueChanged += (s, e) => progressBar.Value = (int)_nudProgress.Value;
            progPanel.Controls.Add(_nudProgress, 0, 0);
            progPanel.Controls.Add(progressBar, 1, 0);
            layout.Controls.Add(progPanel, 1, r++);

            layout.Controls.Add(MakeLabel("Auto-schedule:"), 0, r);
            _chkAutoSchedule = new CheckBox
            {
                Text = "Cascade dependents when dates change",
                Dock = DockStyle.Fill,
                Checked = true,
                Margin = FieldMargin,
                AutoEllipsis = true
            };
            layout.Controls.Add(_chkAutoSchedule, 1, r++);

            layout.Controls.Add(MakeLabel("Critical Path:"), 0, r);
            _chkCritical = new CheckBox
            {
                Text = "On critical path (computed)",
                Dock = DockStyle.Fill,
                Enabled = false,
                Margin = FieldMargin,
                AutoEllipsis = true
            };
            layout.Controls.Add(_chkCritical, 1, r++);

            layout.Controls.Add(MakeLabel("Assigned To:"), 0, r);
            var txtAssigned = new TextBox { Dock = DockStyle.Fill, Name = "txtAssigned", Margin = FieldMargin };
            layout.Controls.Add(txtAssigned, 1, r++);

            layout.Controls.Add(MakeLabel("Deliverable:"), 0, r);
            _txtDeliverable = new TextBox { Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Vertical, Margin = FieldMargin };
            layout.Controls.Add(_txtDeliverable, 1, r++);

            page.Controls.Add(layout);
            return page;
        }

        private TabPage BuildColorsTab()
        {
            var page = new TabPage("Colors");
            bool isRootTask = _task.ParentId == -1;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                ColumnCount = 3,
                RowCount = 4
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LabelColumnWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ColorPreviewColumnWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ValueColumnWidth));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, TallRowHeight));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, TallRowHeight));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, TallRowHeight));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, TallRowHeight));

            layout.Controls.Add(MakeLabel("Schedule bar color:"), 0, 0);
            _scheduleColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeCenteredHost(_scheduleColorPreview), 1, 0);
            layout.Controls.Add(MakeColorBtnPanel(() => _scheduleColor, c => _scheduleColor = c, _scheduleColorPreview, RefreshColorBarPreview), 2, 0);

            layout.Controls.Add(MakeLabel("Progress bar color:"), 0, 1);
            _progressColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeCenteredHost(_progressColorPreview), 1, 1);
            layout.Controls.Add(MakeColorBtnPanel(() => _progressColor, c => _progressColor = c, _progressColorPreview, RefreshColorBarPreview), 2, 1);

            // Group row color — only root tasks can set this; others show it disabled
            layout.Controls.Add(MakeLabel("Group row color:"), 0, 2);
            _bandColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeCenteredHost(_bandColorPreview), 1, 2);
            var bandBtnPanel = MakeColorBtnPanel(() => _bandColor, c => _bandColor = c, _bandColorPreview);
            if (!isRootTask) bandBtnPanel.Enabled = false;
            layout.Controls.Add(bandBtnPanel, 2, 2);

            layout.Controls.Add(MakeLabel("Bar preview:"), 0, 3);
            _colorBarPreview = new Panel { Dock = DockStyle.Fill, Height = 30 };
            _colorBarPreview.Paint += PaintColorBarPreview;
            layout.SetColumnSpan(_colorBarPreview, 2);
            layout.Controls.Add(_colorBarPreview, 1, 3);
            if (_nudProgress != null) _nudProgress.ValueChanged += (s, e) => RefreshColorBarPreview();

            page.Controls.Add(layout);
            return page;
        }

        private void PaintColorBarPreview(object? sender, PaintEventArgs e)
        {
            var previewPanel = _colorBarPreview;
            if (previewPanel == null) return;

            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var rc = new Rectangle(0, (previewPanel.Height - 22) / 2, previewPanel.Width, 22);
            var bc = _scheduleColor == Color.Empty ? AppTheme.TaskBarNormal : _scheduleColor;
            var pc = _progressColor == Color.Empty ? AppTheme.TaskBarProgress : _progressColor;
            using var bb = new SolidBrush(bc);
            g.FillRectangle(bb, rc);
            int pw = (int)(rc.Width * (_nudProgress?.Value ?? 0) / 100m);
            if (pw > 0)
            {
                using var pb = new SolidBrush(pc);
                g.FillRectangle(pb, new Rectangle(rc.X, rc.Y, pw, rc.Height));
            }
            g.DrawRectangle(Pens.Gray, rc);
        }

        private void RefreshColorBarPreview() => _colorBarPreview?.Invalidate();

        private static Panel CreateColorPreviewPanel() =>
            new Panel { Width = 36, Height = 22, BorderStyle = BorderStyle.FixedSingle };

        private static Panel MakeCenteredHost(Control content)
        {
            var host = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty };
            content.Margin = Padding.Empty;
            host.Controls.Add(content);

            void CenterContent()
            {
                content.Left = Math.Max(0, (host.ClientSize.Width - content.Width) / 2);
                content.Top = Math.Max(0, (host.ClientSize.Height - content.Height) / 2);
            }

            host.Resize += (_, _) => CenterContent();
            host.HandleCreated += (_, _) => CenterContent();
            if (host.IsHandleCreated) CenterContent();
            return host;
        }

        private Panel MakeColorBtnPanel(Func<Color> getColor, Action<Color> setColor, Panel preview, Action? onChanged = null)
        {
            var panel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                Margin = FieldMargin,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                AutoSize = false
            };
            var btnChoose = new Button { Text = "Choose...", Width = 88, Height = 28, FlatStyle = FlatStyle.Flat, Margin = new Padding(0, 6, 8, 0) };
            var btnDefault = new Button { Text = "Default", Width = 72, Height = 28, FlatStyle = FlatStyle.Flat, Margin = new Padding(0, 6, 0, 0) };
            panel.Controls.AddRange(new Control[] { btnChoose, btnDefault });

            btnChoose.Click += (s, e) =>
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
            btnDefault.Click += (s, e) =>
            {
                setColor(Color.Empty);
                preview.BackColor = Color.LightGray;
                onChanged?.Invoke();
            };
            return panel;
        }

        private TabPage BuildResourcesTab()
        {
            var page = new TabPage("Resources");
            page.Padding = new Padding(8);

            var lblInfo = new Label
            {
                Text = "Assign resources. Allocation can exceed 100% when needed.",
                Dock = DockStyle.Top, Height = 22,
                ForeColor = AppTheme.TextSecondary, Font = AppTheme.FontSmall
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
                Font = AppTheme.FontNormal,
                ColumnHeadersHeight = 22,
                EnableHeadersVisualStyles = false,
                ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
                {
                    Alignment = DataGridViewContentAlignment.MiddleCenter,
                    Font = AppTheme.FontBold,
                    BackColor = AppTheme.TimescaleBackground,
                    ForeColor = AppTheme.TextPrimary
                }
            };
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
                Dock = DockStyle.Bottom, Height = 22,
                TextAlign = ContentAlignment.MiddleRight,
                Font = AppTheme.FontSmall, ForeColor = AppTheme.TextSecondary,
                Text = "Total: 0%"
            };

            _gridResources.CellEndEdit += (_, _) => UpdateResourceTotal();
            _gridResources.UserDeletedRow += (_, _) => UpdateResourceTotal();
            _gridResources.RowsAdded += (_, _) => UpdateResourceTotal();

            _gridResources.CellValidating += (s, e) =>
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
            _chkCritical.Checked = _task.IsCritical;
            _chkAutoSchedule.Checked = _task.AutoSchedule;
            _txtDeliverable.Text = _task.Deliverable;

            _scheduleColor = _task.BarColor;
            _progressColor = _task.ProgressColor;
            _bandColor = _task.BandColor;
            _scheduleColorPreview.BackColor = _scheduleColor == Color.Empty ? Color.LightGray : _scheduleColor;
            _progressColorPreview.BackColor = _progressColor == Color.Empty ? Color.LightGray : _progressColor;
            var effective = _bandColor.IsEmpty ? _model.GetTaskBandColor(_task.Id) : _bandColor;
            _bandColorPreview.BackColor = effective.IsEmpty ? Color.LightGray : effective;

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) txtAssigned.Text = _model.GetTaskAssigneeDisplay(_task.Id);

            _gridResources.Rows.Clear();
            foreach (var a in _model.GetAssignments(_task.Id))
                _gridResources.Rows.Add(a.ResourceName, ProjectModel.FormatResourceAllocationEditDisplay(a.AllocationPercent));
            UpdateResourceTotal();
        }

        private bool SaveValues()
        {
            if (!string.IsNullOrWhiteSpace(_txtName.Text))
                _task.Name = _txtName.Text.Trim();
            _task.TaskType = (TaskType)_cboType.SelectedIndex;

            var oldStart = _task.StartDate;
            _task.StartDate = _dtpStart.Value.Date;
            _task.DurationDays = (int)_nudDuration.Value;
            _task.Progress = (double)_nudProgress.Value;
            _task.AutoSchedule = _chkAutoSchedule.Checked;
            _task.Deliverable = _txtDeliverable.Text;
            _task.BarColor = _scheduleColor;
            _task.ProgressColor = _progressColor;
            if (_task.ParentId == -1)
                _task.BandColor = _bandColor;

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) _task.AssignedTo = txtAssigned.Text;

            // Cascade if auto-schedule and date changed
            if (_task.AutoSchedule && _task.StartDate != oldStart)
                _model.CascadeDependencies(_task.Id);

            // Re-save resource assignments
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
                MessageBox.Show(
                    resourceError,
                    "Invalid Allocation",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
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

        private static readonly Padding FieldMargin = new(0, 4, 0, 4);

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
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, ValueColumnWidth));
            for (int i = 0; i < rowCount; i++)
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, StandardRowHeight));
            return layout;
        }

        private static Label MakeLabel(string text) => new()
        {
            Text = text,
            TextAlign = ContentAlignment.MiddleRight,
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextSecondary,
            AutoSize = false,
            Margin = FieldMargin
        };

        private static Button MakeButton(string text, bool primary)
        {
            var btn = new Button { Text = text, Width = 80, Height = 28, FlatStyle = FlatStyle.Flat };
            btn.FlatAppearance.BorderSize = 1;
            if (primary)
            { btn.BackColor = AppTheme.Accent; btn.ForeColor = Color.White; btn.FlatAppearance.BorderColor = AppTheme.AccentDark; }
            else
            { btn.BackColor = AppTheme.SurfaceColor; btn.ForeColor = AppTheme.TextPrimary; btn.FlatAppearance.BorderColor = AppTheme.BorderColor; }
            return btn;
        }
    }
}
