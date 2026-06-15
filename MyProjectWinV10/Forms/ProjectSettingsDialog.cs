using MyProject.Controls;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class ProjectSettingsDialog : Form
    {
        private const int LabelColumnWidth = 172;
        private const int ValueColumnWidth = 360;
        private const int StandardRowHeight = 36;

        private readonly ProjectModel _model;

        private TextBox _projectName = null!;
        private DateTimePicker _projectStart = null!;
        private readonly CheckBox[] _workingDayChecks = new CheckBox[7];
        private DependencyTypeSelector _defaultDependencyType = null!;
        private DependencyLineEndSelector _defaultStartLineEnd = null!;
        private DependencyLineEndSelector _defaultEndLineEnd = null!;

        private static readonly string[] WorkingDayLabels =
        {
            "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
        };

        public ProjectSettingsDialog(ProjectModel model)
        {
            _model = model;
            Build();
            LoadValues();
        }

        private void Build()
        {
            Text = "Project Settings";
            Size = new Size(LabelColumnWidth + ValueColumnWidth + 72, 460);
            MinimumSize = Size;
            MaximumSize = new Size(Size.Width, 560);
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(12, 4) };
            tabs.TabPages.Add(BuildGeneralTab());
            tabs.TabPages.Add(BuildScheduleTab());
            tabs.TabPages.Add(BuildDefaultsTab());

            var btnOk = MakeButton("OK", true);
            var btnCancel = MakeButton("Cancel", false);
            btnOk.DialogResult = DialogResult.None;
            btnCancel.DialogResult = DialogResult.Cancel;
            btnOk.Click += (_, _) =>
            {
                if (TryApply())
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
        }

        private TabPage BuildGeneralTab()
        {
            var page = new TabPage("General");
            var layout = CreateTwoColumnLayout(2);

            _projectName = new TextBox();
            _projectStart = new DateTimePicker { Format = DateTimePickerFormat.Short };

            layout.Controls.Add(MakeLabel("Project name:"), 0, 0);
            layout.Controls.Add(_projectName, 1, 0);
            layout.Controls.Add(MakeLabel("Project start:"), 0, 1);
            layout.Controls.Add(_projectStart, 1, 1);

            page.Controls.Add(layout);
            return page;
        }

        private TabPage BuildScheduleTab()
        {
            var page = new TabPage("Schedule");
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(12),
                ColumnCount = 1,
                RowCount = 3
            };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var title = new Label
            {
                Text = "Select which days count as working days for this project.",
                AutoSize = true,
                Dock = DockStyle.Top,
                ForeColor = AppTheme.TextSecondary,
                Padding = new Padding(0, 0, 0, 8)
            };

            var daysPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                Padding = new Padding(8, 0, 0, 0)
            };

            for (int i = 0; i < 7; i++)
            {
                _workingDayChecks[i] = new CheckBox
                {
                    Text = WorkingDayLabels[i],
                    AutoSize = true,
                    Margin = new Padding(0, 2, 0, 2)
                };
                daysPanel.Controls.Add(_workingDayChecks[i]);
            }

            var note = new Label
            {
                Text = "Working days are used for task duration. Changing this schedule recalculates task start and end dates.",
                AutoSize = true,
                Dock = DockStyle.Bottom,
                ForeColor = AppTheme.TextSecondary,
                Padding = new Padding(0, 8, 0, 0)
            };

            layout.Controls.Add(title, 0, 0);
            layout.Controls.Add(daysPanel, 0, 1);
            layout.Controls.Add(note, 0, 2);
            page.Controls.Add(layout);
            return page;
        }

        private TabPage BuildDefaultsTab()
        {
            var page = new TabPage("Defaults");
            var layout = CreateTwoColumnLayout(3);

            _defaultDependencyType = new DependencyTypeSelector();
            _defaultStartLineEnd = new DependencyLineEndSelector { PreviewAtLineStart = true };
            _defaultEndLineEnd = new DependencyLineEndSelector();

            layout.Controls.Add(MakeLabel("Dependency type:"), 0, 0);
            layout.Controls.Add(_defaultDependencyType, 1, 0);
            layout.Controls.Add(MakeLabel("Line start:"), 0, 1);
            layout.Controls.Add(_defaultStartLineEnd, 1, 1);
            layout.Controls.Add(MakeLabel("Line end:"), 0, 2);
            layout.Controls.Add(_defaultEndLineEnd, 1, 2);

            page.Controls.Add(layout);
            return page;
        }

        private void LoadValues()
        {
            _projectName.Text = _model.ProjectName;
            _projectStart.Value = _model.ProjectStart;

            var flags = _model.WorkingWeek.ToDayFlags();
            for (int i = 0; i < 7; i++)
                _workingDayChecks[i].Checked = flags[i];

            var settings = _model.ViewSettings;
            _defaultDependencyType.SelectedType = settings.DefaultDependencyType;
            _defaultStartLineEnd.SelectedLineEnd = settings.DefaultDependencyStartLineEnd;
            _defaultEndLineEnd.SelectedLineEnd = settings.DefaultDependencyEndLineEnd;
        }

        private bool TryApply()
        {
            string name = _projectName.Text.Trim();
            if (string.IsNullOrEmpty(name))
            {
                MessageBox.Show(this, "Project name cannot be empty.", "Project Settings",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                _projectName.Focus();
                return false;
            }

            if (!_workingDayChecks.Any(c => c.Checked))
            {
                MessageBox.Show(this, "Select at least one working day.", "Project Settings",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            _model.SetProjectName(name);
            _model.SetProjectStart(_projectStart.Value.Date);
            _model.SetWorkingWeek(WorkingWeekSchedule.FromDayFlags(
                _workingDayChecks.Select(c => c.Checked).ToArray()));
            _model.ApplyProjectDependencyDefaults(
                _defaultDependencyType.SelectedType,
                _defaultStartLineEnd.SelectedLineEnd,
                _defaultEndLineEnd.SelectedLineEnd);

            return true;
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
