using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public class TaskPropertiesDialog : Form
    {
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
        private Color _scheduleColor = Color.Empty;
        private Color _progressColor = Color.Empty;

        // Resources
        private DataGridView _gridResources = null!;

        // Notes
        private TextBox _txtNotes = null!;

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
            Size = new Size(520, 500);
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
            tabs.TabPages.Add(BuildNotesTab());

            var btnOk = MakeButton("OK", true);
            var btnCancel = MakeButton("Cancel", false);
            btnOk.DialogResult = DialogResult.OK;
            btnCancel.DialogResult = DialogResult.Cancel;
            btnOk.Click += (s, e) => SaveValues();

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
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, Padding = new Padding(12),
                ColumnCount = 2, RowCount = 9
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 8; i++) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));

            int r = 0;

            layout.Controls.Add(MakeLabel("Task Name:"), 0, r);
            _txtName = new TextBox { Dock = DockStyle.Fill };
            layout.Controls.Add(_txtName, 1, r++);

            layout.Controls.Add(MakeLabel("Type:"), 0, r);
            _cboType = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList };
            _cboType.Items.AddRange(new object[] { "Normal", "Summary", "Milestone" });
            layout.Controls.Add(_cboType, 1, r++);

            layout.Controls.Add(MakeLabel("Start Date:"), 0, r);
            _dtpStart = new DateTimePicker { Dock = DockStyle.Fill, Format = DateTimePickerFormat.Short };
            layout.Controls.Add(_dtpStart, 1, r++);

            layout.Controls.Add(MakeLabel("Duration (days):"), 0, r);
            _nudDuration = new NumericUpDown { Dock = DockStyle.Fill, Minimum = 1, Maximum = 3650 };
            layout.Controls.Add(_nudDuration, 1, r++);

            layout.Controls.Add(MakeLabel("Progress (%):"), 0, r);
            var progPanel = new Panel { Dock = DockStyle.Fill };
            _nudProgress = new NumericUpDown { Width = 70, Minimum = 0, Maximum = 100, Top = 4 };
            var progressBar = new ProgressBar { Left = 78, Top = 7, Width = 150, Height = 18, Minimum = 0, Maximum = 100 };
            _nudProgress.ValueChanged += (s, e) => progressBar.Value = (int)_nudProgress.Value;
            progPanel.Controls.AddRange(new Control[] { _nudProgress, progressBar });
            layout.Controls.Add(progPanel, 1, r++);

            layout.Controls.Add(MakeLabel("Auto-schedule:"), 0, r);
            _chkAutoSchedule = new CheckBox
            {
                Text = "Cascade dependents when dates change",
                Dock = DockStyle.Fill,
                Checked = true
            };
            layout.Controls.Add(_chkAutoSchedule, 1, r++);

            layout.Controls.Add(MakeLabel("Critical Path:"), 0, r);
            _chkCritical = new CheckBox { Text = "Mark as Critical Path", Dock = DockStyle.Fill };
            layout.Controls.Add(_chkCritical, 1, r++);

            layout.Controls.Add(MakeLabel("Assigned To:"), 0, r);
            var txtAssigned = new TextBox { Dock = DockStyle.Fill, Name = "txtAssigned" };
            layout.Controls.Add(txtAssigned, 1, r++);

            layout.Controls.Add(MakeLabel("Deliverable:"), 0, r);
            _txtDeliverable = new TextBox { Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Vertical };
            layout.Controls.Add(_txtDeliverable, 1, r++);

            page.Controls.Add(layout);
            return page;
        }

        private TabPage BuildColorsTab()
        {
            var page = new TabPage("Colors");
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                ColumnCount = 3,
                RowCount = 3
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 50));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

            layout.Controls.Add(MakeLabel("Schedule bar color:"), 0, 0);
            _scheduleColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeCenteredHost(_scheduleColorPreview), 1, 0);
            layout.Controls.Add(MakeColorBtnPanel(() => _scheduleColor, c => _scheduleColor = c, _scheduleColorPreview), 2, 0);

            layout.Controls.Add(MakeLabel("Progress bar color:"), 0, 1);
            _progressColorPreview = CreateColorPreviewPanel();
            layout.Controls.Add(MakeCenteredHost(_progressColorPreview), 1, 1);
            layout.Controls.Add(MakeColorBtnPanel(() => _progressColor, c => _progressColor = c, _progressColorPreview), 2, 1);

            layout.Controls.Add(MakeLabel("Preview:"), 0, 2);
            var previewPanel = new Panel { Dock = DockStyle.Fill, Height = 30 };
            previewPanel.Paint += (s, e) =>
            {
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
            };
            layout.SetColumnSpan(previewPanel, 2);
            layout.Controls.Add(previewPanel, 1, 2);
            if (_nudProgress != null) _nudProgress.ValueChanged += (s, e) => previewPanel.Invalidate();

            page.Controls.Add(layout);
            return page;
        }

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

        private Panel MakeColorBtnPanel(Func<Color> getColor, Action<Color> setColor, Panel preview)
        {
            var panel = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty };
            var btnChoose = new Button { Text = "Choose...", Width = 75, Height = 28, FlatStyle = FlatStyle.Flat };
            var btnDefault = new Button { Text = "Default", Width = 65, Height = 28, FlatStyle = FlatStyle.Flat };
            panel.Controls.AddRange(new Control[] { btnChoose, btnDefault });

            const int gap = 8;
            void LayoutButtons()
            {
                int top = Math.Max(0, (panel.ClientSize.Height - btnChoose.Height) / 2);
                btnChoose.Top = top;
                btnChoose.Left = 0;
                btnDefault.Top = top;
                btnDefault.Left = btnChoose.Right + gap;
            }

            panel.Resize += (_, _) => LayoutButtons();
            panel.HandleCreated += (_, _) => LayoutButtons();
            if (panel.IsHandleCreated) LayoutButtons();

            btnChoose.Click += (s, e) =>
            {
                var current = getColor();
                using var dlg = new ColorDialog { Color = current == Color.Empty ? AppTheme.TaskBarNormal : current };
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    setColor(dlg.Color);
                    preview.BackColor = dlg.Color;
                }
            };
            btnDefault.Click += (s, e) =>
            {
                setColor(Color.Empty);
                preview.BackColor = Color.LightGray;
            };
            return panel;
        }

        private TabPage BuildResourcesTab()
        {
            var page = new TabPage("Resources");
            page.Padding = new Padding(8);

            var lblInfo = new Label
            {
                Text = "Assign resources. Total allocation per task cannot exceed 100%.",
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
                Font = AppTheme.FontNormal
            };
            _gridResources.Columns.Add(new DataGridViewTextBoxColumn
            { Name = "ResourceName", HeaderText = "Assignee / Resource", FillWeight = 60 });
            _gridResources.Columns.Add(new DataGridViewTextBoxColumn
            { Name = "AllocationPercent", HeaderText = "Allocation (%)", FillWeight = 40 });

            var lblTotal = new Label
            {
                Dock = DockStyle.Bottom, Height = 22,
                TextAlign = ContentAlignment.MiddleRight,
                Font = AppTheme.FontSmall, ForeColor = AppTheme.TextSecondary,
                Text = "Total: 0%"
            };

            _gridResources.CellEndEdit += (s, e) =>
            {
                double total = GetGridTotal();
                lblTotal.Text = $"Total: {total:0}%";
                lblTotal.ForeColor = total > 100 ? Color.Red : AppTheme.TextSecondary;
            };

            _gridResources.CellValidating += (s, e) =>
            {
                if (_gridResources.Columns[e.ColumnIndex].Name != "AllocationPercent") return;
                string? val = e.FormattedValue?.ToString();
                if (!string.IsNullOrEmpty(val) && (!double.TryParse(val, out double d) || d < 0 || d > 100))
                {
                    ErrorDialog.Show(this,
                        "Invalid Input",
                        "Allocation percent must be a number between 0 and 100.",
                        $"Entered value: {val}");
                    e.Cancel = true;
                }
            };

            page.Controls.Add(_gridResources);
            page.Controls.Add(lblInfo);
            page.Controls.Add(lblTotal);
            return page;
        }

        private TabPage BuildNotesTab()
        {
            var page = new TabPage("Notes");
            page.Padding = new Padding(8);
            _txtNotes = new TextBox { Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Both };
            page.Controls.Add(_txtNotes);
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
            _txtNotes.Text = _task.Notes;

            _scheduleColor = _task.BarColor;
            _progressColor = _task.ProgressColor;
            _scheduleColorPreview.BackColor = _scheduleColor == Color.Empty ? Color.LightGray : _scheduleColor;
            _progressColorPreview.BackColor = _progressColor == Color.Empty ? Color.LightGray : _progressColor;

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) txtAssigned.Text = _model.GetTaskAssigneeDisplay(_task.Id);

            foreach (var a in _model.GetAssignments(_task.Id))
                _gridResources.Rows.Add(a.ResourceName, a.AllocationPercent.ToString("0"));
        }

        private void SaveValues()
        {
            if (!string.IsNullOrWhiteSpace(_txtName.Text))
                _task.Name = _txtName.Text.Trim();
            _task.TaskType = (TaskType)_cboType.SelectedIndex;

            var oldStart = _task.StartDate;
            _task.StartDate = _dtpStart.Value.Date;
            _task.DurationDays = (int)_nudDuration.Value;
            _task.Progress = (double)_nudProgress.Value;
            _task.IsCritical = _chkCritical.Checked;
            _task.AutoSchedule = _chkAutoSchedule.Checked;
            _task.Deliverable = _txtDeliverable.Text;
            _task.Notes = _txtNotes.Text;
            _task.BarColor = _scheduleColor;
            _task.ProgressColor = _progressColor;

            var txtAssigned = Controls.Find("txtAssigned", true).FirstOrDefault() as TextBox;
            if (txtAssigned != null) _task.AssignedTo = txtAssigned.Text;

            // Cascade if auto-schedule and date changed
            if (_task.AutoSchedule && _task.StartDate != oldStart)
                _model.CascadeDependencies(_task.Id);

            // Re-save resource assignments
            foreach (var a in _model.GetAssignments(_task.Id).ToList())
                _model.RemoveAssignment(_task.Id, a.ResourceName);

            double total = 0;
            foreach (DataGridViewRow row in _gridResources.Rows)
            {
                if (row.IsNewRow) continue;
                string name = row.Cells["ResourceName"].Value?.ToString()?.Trim() ?? "";
                if (string.IsNullOrEmpty(name)) continue;
                if (!double.TryParse(row.Cells["AllocationPercent"].Value?.ToString(), out double pct)) pct = 100;
                total += pct;
                if (total > 100)
                {
                    ErrorDialog.Show(this,
                        "Allocation Warning",
                        "Total resource allocation exceeds 100%.",
                        $"Current total: {total:0}%\nRemaining assignments were not saved.");
                    break;
                }
                _model.AddAssignment(_task.Id, name, pct);
            }

            _task.AssignedTo = _model.GetTaskAssigneeDisplay(_task.Id);
        }

        private double GetGridTotal()
        {
            double total = 0;
            foreach (DataGridViewRow row in _gridResources.Rows)
            {
                if (row.IsNewRow) continue;
                if (double.TryParse(row.Cells["AllocationPercent"].Value?.ToString(), out double v)) total += v;
            }
            return total;
        }

        private static Label MakeLabel(string text) => new()
        {
            Text = text, TextAlign = ContentAlignment.MiddleRight,
            Dock = DockStyle.Fill, ForeColor = AppTheme.TextSecondary
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
