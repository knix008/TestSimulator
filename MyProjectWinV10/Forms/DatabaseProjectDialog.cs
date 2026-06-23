using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public enum DatabaseProjectDialogMode
    {
        Open,
        Fetch,
        Save
    }

    public sealed class DatabaseProjectDialog : Form
    {
        private readonly DatabaseProjectDialogMode _mode;
        private readonly ComboBox _profileCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly ListView _projects = new()
        {
            View = View.Details,
            FullRowSelect = true,
            HideSelection = false,
            MultiSelect = false
        };
        private readonly Button _btnRefresh = new() { Text = "Refresh", AutoSize = true };
        private readonly Button _btnNew = new() { Text = "New Project...", AutoSize = true };
        private readonly Button _btnConnection = new() { Text = "Connection Settings...", AutoSize = true };
        private readonly Label _emptyLabel = new()
        {
            Text = "",
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextSecondary,
            Visible = false
        };
        private Button? _btnAccept;
        private readonly string? _preselectProfileId;
        private readonly int _preselectScheduleId;

        public DatabaseConnectionProfile? SelectedProfile { get; private set; }
        public int SelectedProjectId { get; private set; }
        public bool CreateRequested { get; private set; }
        public string? NewProjectName { get; private set; }
        public string? SelectedScheduleName { get; private set; }

        public DatabaseProjectDialog(
            DatabaseProjectDialogMode mode = DatabaseProjectDialogMode.Open,
            string? preselectProfileId = null,
            int preselectScheduleId = 0)
        {
            _mode = mode;
            _preselectProfileId = preselectProfileId;
            _preselectScheduleId = preselectScheduleId;
            Build();
            LoadProfiles();
        }

        private void Build()
        {
            Text = _mode switch
            {
                DatabaseProjectDialogMode.Fetch => "Fetch Shared Schedule",
                DatabaseProjectDialogMode.Save => "Save to Shared Schedule",
                _ => "Open Shared Schedule"
            };
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(560, 420);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var top = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 44,
                ColumnCount = 3,
                Padding = new Padding(16, 12, 16, 0)
            };
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170));
            top.Controls.Add(new Label { Text = "Connection:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
            top.Controls.Add(_profileCombo, 1, 0);
            top.Controls.Add(_btnConnection, 2, 0);

            _projects.Columns.Add("Schedule", 260);
            _projects.Columns.Add("Updated (UTC)", 150);
            _projects.Columns.Add("Version", 80);
            _projects.Dock = DockStyle.Fill;

            var actions = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 40,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(16, 4, 16, 0)
            };
            actions.Controls.Add(_btnRefresh);
            if (_mode is DatabaseProjectDialogMode.Open or DatabaseProjectDialogMode.Save)
                actions.Controls.Add(_btnNew);

            _profileCombo.SelectedIndexChanged += (_, _) => RefreshProjects();
            _btnRefresh.Click += (_, _) => RefreshProjects(showSuccessPopup: true);
            _btnNew.Click += (_, _) => CreateProject();
            _btnConnection.Click += (_, _) => EditConnection();
            _projects.DoubleClick += (_, _) =>
            {
                if (TryAcceptSelection())
                    DialogResult = DialogResult.OK;
            };
            _projects.SelectedIndexChanged += (_, _) => UpdateAcceptButtonState();

            var btnOpen = new Button
            {
                Text = _mode switch
                {
                    DatabaseProjectDialogMode.Fetch => "Fetch",
                    DatabaseProjectDialogMode.Save => "Save",
                    _ => "Open"
                },
                Size = new Size(88, 30),
                FlatStyle = FlatStyle.Flat,
                BackColor = AppTheme.Accent,
                ForeColor = Color.White
            };
            btnOpen.FlatAppearance.BorderColor = AppTheme.AccentDark;
            btnOpen.Click += (_, _) =>
            {
                if (TryAcceptSelection())
                    DialogResult = DialogResult.OK;
            };
            _btnAccept = btnOpen;

            var btnCancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Size = new Size(88, 30) };
            var bottom = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(8)
            };
            bottom.Controls.Add(btnCancel);
            bottom.Controls.Add(btnOpen);

            var center = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16, 8, 16, 8) };
            center.Controls.Add(_emptyLabel);
            center.Controls.Add(_projects);
            center.Controls.Add(actions);

            Controls.Add(center);
            Controls.Add(top);
            Controls.Add(bottom);
            AcceptButton = btnOpen;
            CancelButton = btnCancel;
        }

        private void LoadProfiles()
        {
            _profileCombo.Items.Clear();
            foreach (var profile in AppSettings.DatabaseProfiles)
                _profileCombo.Items.Add(profile);

            if (_profileCombo.Items.Count == 0)
            {
                ShowEmptyState(
                    "No database connection profile is configured.\n\n" +
                    "Click Connection Settings... to add one.");
                UpdateAcceptButtonState();
                return;
            }

            int selectedIndex = -1;
            if (!string.IsNullOrWhiteSpace(_preselectProfileId))
            {
                for (int i = 0; i < _profileCombo.Items.Count; i++)
                {
                    if (_profileCombo.Items[i] is DatabaseConnectionProfile profile
                        && string.Equals(profile.Id, _preselectProfileId, StringComparison.Ordinal))
                    {
                        selectedIndex = i;
                        break;
                    }
                }
            }

            if (selectedIndex < 0)
            {
                var last = AppSettings.GetLastDatabaseProfile();
                if (last != null)
                {
                    for (int i = 0; i < _profileCombo.Items.Count; i++)
                    {
                        if (_profileCombo.Items[i] is DatabaseConnectionProfile profile
                            && string.Equals(profile.Id, last.Id, StringComparison.Ordinal))
                        {
                            selectedIndex = i;
                            break;
                        }
                    }
                }
            }

            _profileCombo.SelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
            RefreshProjects();
        }

        private DatabaseConnectionProfile? CurrentProfile =>
            _profileCombo.SelectedItem as DatabaseConnectionProfile;

        private void RefreshProjects(bool showSuccessPopup = false)
        {
            _projects.Items.Clear();
            var profile = CurrentProfile;
            if (profile == null)
            {
                ShowEmptyState(
                    "No database connection profile is selected.\n\n" +
                    "Click Connection Settings... to configure one.");
                UpdateAcceptButtonState();
                if (showSuccessPopup)
                {
                    ErrorDialog.Show(
                        this,
                        "No Connection Profile",
                        "Configure a database connection profile first.",
                        "Open Connection Settings... and save a profile, then refresh the schedule list.");
                }
                return;
            }

            try
            {
                var schedules = DatabaseProjectStore.ListProjects(profile);
                foreach (var project in schedules)
                {
                    var item = new ListViewItem(project.Name) { Tag = project };
                    item.SubItems.Add(project.UpdatedUtc.ToString("yyyy-MM-dd HH:mm"));
                    item.SubItems.Add(project.Version.ToString());
                    _projects.Items.Add(item);
                }

                if (_projects.Items.Count > 0)
                {
                    HideEmptyState();
                    SelectScheduleInList(_preselectScheduleId);
                    if (_projects.SelectedItems.Count == 0)
                        _projects.Items[0].Selected = true;
                }
                else
                {
                    ShowEmptyState(
                        _mode switch
                        {
                            DatabaseProjectDialogMode.Save =>
                                "No shared schedules exist in this database yet.\n\n" +
                                "Click New Project... to create one, then save.",
                            DatabaseProjectDialogMode.Fetch =>
                                "No shared schedules were found in this database.\n\n" +
                                "Create a schedule first, or choose another connection.",
                            _ =>
                                "No shared schedules were found in this database.\n\n" +
                                "Click New Project... to create one."
                        });
                }

                UpdateAcceptButtonState();

                if (showSuccessPopup)
                {
                    CompletionDialog.Show(
                        this,
                        "Refresh Complete",
                        $"Loaded {schedules.Count} shared schedule(s) from the database.",
                        DatabaseOperationDetails.FormatScheduleListDetails(profile, schedules.Count),
                        "Details:");
                }
            }
            catch (Exception ex)
            {
                ShowEmptyState("Could not load shared schedules from the database.\n\nClick Refresh to try again.");
                UpdateAcceptButtonState();
                ErrorDialog.Show(
                    this,
                    "Database Error",
                    DatabaseOperationDetails.FormatFailureSummary(profile, "load shared schedules"),
                    DatabaseOperationDetails.FormatFailureDetails(profile, ErrorDialog.FormatException(ex)));
            }
        }

        private void SelectScheduleInList(int scheduleId)
        {
            if (scheduleId <= 0)
                return;

            foreach (ListViewItem item in _projects.Items)
            {
                if (item.Tag is DatabaseProjectSummary summary && summary.Id == scheduleId)
                {
                    item.Selected = true;
                    item.Focused = true;
                    item.EnsureVisible();
                    return;
                }
            }
        }

        private void ShowEmptyState(string message)
        {
            _emptyLabel.Text = message;
            _emptyLabel.Visible = true;
            _projects.Visible = false;
        }

        private void HideEmptyState()
        {
            _emptyLabel.Visible = false;
            _projects.Visible = true;
        }

        private void UpdateAcceptButtonState()
        {
            if (_btnAccept == null)
                return;

            _btnAccept.Enabled = _projects.Items.Count > 0 && _projects.SelectedItems.Count > 0;
        }

        private void CreateProject()
        {
            var profile = CurrentProfile;
            if (profile == null)
            {
                ErrorDialog.Show(
                    this,
                    "No Connection Profile",
                    "Configure a database connection before creating a shared schedule.",
                    "Open Connection Settings... and save a profile first.");
                return;
            }

            string? name = PromptForText("New Shared Schedule", "Enter a name for the shared schedule:", "New Schedule");
            if (string.IsNullOrWhiteSpace(name))
                return;

            try
            {
                int projectId = DatabaseProjectStore.CreateProject(profile, name);
                SelectedProfile = profile;
                SelectedProjectId = projectId;
                CreateRequested = true;
                NewProjectName = name.Trim();
                SelectedScheduleName = name.Trim();
                CompletionDialog.Show(
                    this,
                    "Schedule Created",
                    $"The shared schedule \"{name.Trim()}\" was created.",
                    DatabaseOperationDetails.FormatCreateDetails(profile, name.Trim(), projectId),
                    "Details:");
                DialogResult = DialogResult.OK;
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(
                    this,
                    "Create Error",
                    DatabaseOperationDetails.FormatFailureSummary(profile, $"create shared schedule \"{name.Trim()}\""),
                    DatabaseOperationDetails.FormatFailureDetails(profile, ErrorDialog.FormatException(ex)));
            }
        }

        private static string? PromptForText(string title, string message, string defaultValue)
        {
            using var form = new Form
            {
                Text = title,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent,
                ClientSize = new Size(420, 130),
                MaximizeBox = false,
                MinimizeBox = false,
                ShowInTaskbar = false
            };
            var label = new Label { Text = message, Location = new Point(12, 12), AutoSize = true, MaximumSize = new Size(396, 0) };
            var textBox = new TextBox { Location = new Point(12, 44), Width = 396, Text = defaultValue };
            var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Location = new Point(244, 84), Size = new Size(80, 28) };
            var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Location = new Point(328, 84), Size = new Size(80, 28) };
            form.Controls.AddRange(new Control[] { label, textBox, ok, cancel });
            form.AcceptButton = ok;
            form.CancelButton = cancel;
            return form.ShowDialog() == DialogResult.OK ? textBox.Text.Trim() : null;
        }

        private void EditConnection()
        {
            using var dlg = new DatabaseConnectionDialog();
            if (dlg.ShowDialog(this) != DialogResult.OK)
                return;

            string? selectedId = dlg.SelectedProfile?.Id;
            _profileCombo.Items.Clear();
            foreach (var profile in AppSettings.DatabaseProfiles)
                _profileCombo.Items.Add(profile);

            if (!string.IsNullOrWhiteSpace(selectedId))
            {
                for (int i = 0; i < _profileCombo.Items.Count; i++)
                {
                    if (_profileCombo.Items[i] is DatabaseConnectionProfile profile
                        && string.Equals(profile.Id, selectedId, StringComparison.Ordinal))
                    {
                        _profileCombo.SelectedIndex = i;
                        break;
                    }
                }
            }

            RefreshProjects();
        }

        private bool TryAcceptSelection()
        {
            if (_projects.SelectedItems.Count == 0)
            {
                ErrorDialog.Show(
                    this,
                    "No Schedule Selected",
                    _mode switch
                    {
                        DatabaseProjectDialogMode.Fetch => "Select a shared schedule to fetch.",
                        DatabaseProjectDialogMode.Save => "Select a shared schedule to save to.",
                        _ => "Select a shared schedule to open."
                    },
                    _mode switch
                    {
                        DatabaseProjectDialogMode.Fetch => "Choose a schedule from the list, then click Fetch.",
                        DatabaseProjectDialogMode.Save => "Choose a schedule from the list, or click New Project... to create one.",
                        _ => "Choose a schedule from the list, or click New Project... to create one."
                    });
                return false;
            }

            if (_projects.SelectedItems[0].Tag is not DatabaseProjectSummary summary)
                return false;

            var profile = CurrentProfile;
            if (profile == null)
                return false;

            SelectedProfile = profile;
            SelectedProjectId = summary.Id;
            SelectedScheduleName = summary.Name;
            return true;
        }
    }
}
