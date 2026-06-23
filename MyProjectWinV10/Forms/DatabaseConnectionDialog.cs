using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Forms
{
    public sealed class DatabaseConnectionDialog : Form
    {
        private readonly ComboBox _profileCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly ComboBox _providerCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
        private readonly TextBox _profileName = new();
        private readonly TextBox _server = new();
        private readonly NumericUpDown _port = new() { Minimum = 0, Maximum = 65535, Width = 90 };
        private readonly TextBox _database = new();
        private readonly TextBox _userName = new();
        private readonly TextBox _password = new() { UseSystemPasswordChar = true };
        private readonly Button _btnBrowseSqlite = new() { Text = "Browse...", Visible = false };
        private readonly Button _btnTest = new() { Text = "Test Connection" };

        private List<DatabaseConnectionProfile> _profiles = new();

        public DatabaseConnectionProfile? SelectedProfile { get; private set; }

        public DatabaseConnectionDialog()
        {
            Build();
            LoadProfiles();
        }

        private void Build()
        {
            Text = "Database Connection Settings";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(520, 360);
            BackColor = AppTheme.SurfaceColor;
            Font = AppTheme.FontNormal;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 3,
                RowCount = 9,
                Padding = new Padding(16)
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));

            foreach (var provider in DatabaseProviderInfo.SupportedProviders)
                _providerCombo.Items.Add(provider);
            _providerCombo.SelectedIndex = 0;
            _providerCombo.SelectedIndexChanged += (_, _) => UpdateProviderUi();

            _profileCombo.SelectedIndexChanged += (_, _) => LoadSelectedProfile();
            _btnBrowseSqlite.Click += (_, _) => BrowseSqliteFile();
            _btnTest.Click += (_, _) => TestConnection();
            StyleActionButton(_btnBrowseSqlite);
            StyleActionButton(_btnTest);

            AddRow(layout, 0, "Saved profile:", _profileCombo, null);
            AddRow(layout, 1, "Profile name:", _profileName, null);
            AddRow(layout, 2, "Provider:", _providerCombo, null);
            AddRow(layout, 3, "Server:", _server, null);
            AddRow(layout, 4, "Port:", _port, null);
            AddRow(layout, 5, "Database:", _database, _btnBrowseSqlite);
            AddRow(layout, 6, "User name:", _userName, null);
            AddRow(layout, 7, "Password:", _password, null);

            var actionPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(0, 4, 0, 0)
            };
            actionPanel.Controls.Add(_btnTest);
            layout.Controls.Add(actionPanel, 0, 8);
            layout.SetColumnSpan(actionPanel, 3);

            var btnOk = MakeButton("OK", primary: true);
            btnOk.DialogResult = DialogResult.None;
            btnOk.Click += (_, _) =>
            {
                if (TryApply())
                    DialogResult = DialogResult.OK;
            };

            var btnCancel = MakeButton("Cancel", primary: false);
            btnCancel.DialogResult = DialogResult.Cancel;
            var btnDelete = MakeButton("Delete Profile", primary: false);
            btnDelete.Margin = Padding.Empty;
            btnDelete.Click += (_, _) => DeleteProfile();

            var bottom = new TableLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                ColumnCount = 2,
                Padding = new Padding(8, 6, 8, 6)
            };
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));

            var leftButtons = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false
            };
            leftButtons.Controls.Add(btnDelete);

            var rightButtons = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false
            };
            rightButtons.Controls.Add(btnCancel);
            rightButtons.Controls.Add(btnOk);

            bottom.Controls.Add(leftButtons, 0, 0);
            bottom.Controls.Add(rightButtons, 1, 0);

            Controls.Add(layout);
            Controls.Add(bottom);
            AcceptButton = btnOk;
            CancelButton = btnCancel;
        }

        private static void AddRow(TableLayoutPanel layout, int row, string label, Control editor, Control? extra)
        {
            layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left }, 0, row);
            if (extra == null)
            {
                layout.Controls.Add(editor, 1, row);
                layout.SetColumnSpan(editor, 2);
            }
            else
            {
                layout.Controls.Add(editor, 1, row);
                layout.Controls.Add(extra, 2, row);
            }
        }

        private void LoadProfiles()
        {
            _profiles = AppSettings.DatabaseProfiles.Select(p => p.Clone()).ToList();
            if (_profiles.Count == 0)
            {
                _profiles.Add(new DatabaseConnectionProfile());
            }

            RefreshProfileCombo();
            var last = AppSettings.GetLastDatabaseProfile();
            if (last != null)
            {
                int idx = _profiles.FindIndex(p => string.Equals(p.Id, last.Id, StringComparison.Ordinal));
                if (idx >= 0)
                    _profileCombo.SelectedIndex = idx;
            }

            if (_profileCombo.SelectedIndex < 0 && _profileCombo.Items.Count > 0)
                _profileCombo.SelectedIndex = 0;

            LoadSelectedProfile();
        }

        private void RefreshProfileCombo()
        {
            _profileCombo.Items.Clear();
            foreach (var profile in _profiles)
                _profileCombo.Items.Add(profile.Name);
        }

        private DatabaseConnectionProfile? CurrentProfile =>
            _profileCombo.SelectedIndex >= 0 && _profileCombo.SelectedIndex < _profiles.Count
                ? _profiles[_profileCombo.SelectedIndex]
                : null;

        private void LoadSelectedProfile()
        {
            var profile = CurrentProfile;
            if (profile == null)
                return;

            _profileName.Text = profile.Name;
            _providerCombo.SelectedItem = profile.Provider;
            _server.Text = profile.Server;
            _port.Value = profile.Port > 0 ? profile.Port : DatabaseProviderInfo.GetDefaultPort(profile.Provider);
            _database.Text = profile.Database;
            _userName.Text = profile.UserName;
            _password.Text = profile.GetPassword();
            UpdateProviderUi();
        }

        private void UpdateProviderUi()
        {
            var provider = _providerCombo.SelectedItem is DatabaseProviderKind kind
                ? kind
                : DatabaseProviderKind.MariaDb;
            bool sqlite = provider == DatabaseProviderKind.Sqlite;
            _server.Enabled = !sqlite;
            _port.Enabled = !sqlite;
            _userName.Enabled = !sqlite;
            _password.Enabled = !sqlite;
            _btnBrowseSqlite.Visible = sqlite;
            if (_port.Value == 0 && !sqlite)
                _port.Value = DatabaseProviderInfo.GetDefaultPort(provider);
        }

        private DatabaseConnectionProfile ReadEditorProfile()
        {
            var baseProfile = CurrentProfile ?? new DatabaseConnectionProfile();
            var profile = baseProfile.Clone();
            profile.Name = _profileName.Text.Trim();
            profile.Provider = _providerCombo.SelectedItem is DatabaseProviderKind provider
                ? provider
                : DatabaseProviderKind.MariaDb;
            profile.Server = _server.Text.Trim();
            profile.Port = (int)_port.Value;
            profile.Database = _database.Text.Trim();
            profile.UserName = _userName.Text.Trim();
            profile.SetPassword(_password.Text);
            profile.ApplyDefaultPort();
            return profile;
        }

        private void BrowseSqliteFile()
        {
            using var dlg = new SaveFileDialog
            {
                Filter = "SQLite Database (*.db;*.sqlite)|*.db;*.sqlite|All Files (*.*)|*.*",
                Title = "Select SQLite Database File",
                FileName = string.IsNullOrWhiteSpace(_database.Text) ? "myproject.db" : _database.Text
            };
            AppSettings.ApplyTo(dlg);
            if (dlg.ShowDialog(this) == DialogResult.OK)
                _database.Text = dlg.FileName;
        }

        private void TestConnection()
        {
            var profile = ReadEditorProfile();
            try
            {
                bool databaseCreated = DatabaseConnectionFactory.TestConnection(profile);
                CompletionDialog.Show(
                    this,
                    "Connection Successful",
                    databaseCreated
                        ? "The database was created and the connection test succeeded."
                        : "The database connection test succeeded.",
                    DatabaseOperationDetails.FormatConnectionTestSuccess(profile, databaseCreated),
                    "Details:");
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(
                    this,
                    "Connection Failed",
                    DatabaseOperationDetails.FormatFailureSummary(profile, "connect to the database"),
                    DatabaseOperationDetails.FormatFailureDetails(profile, ErrorDialog.FormatException(ex)));
            }
        }

        private bool TryApply()
        {
            var profile = ReadEditorProfile();
            if (string.IsNullOrWhiteSpace(profile.Name))
            {
                ErrorDialog.Show(
                    this,
                    "Invalid Profile",
                    "Enter a profile name to save the connection settings.",
                    "Profile name is required.\n\nExample: \"Team MariaDB\" or \"Local SQLite\".");
                return false;
            }

            if (profile.Provider == DatabaseProviderKind.Sqlite)
            {
                if (string.IsNullOrWhiteSpace(profile.Database))
                {
                    ErrorDialog.Show(
                        this,
                        "Invalid Profile",
                        "Select a SQLite database file for this profile.",
                        "Database file path is required for SQLite.\n\nUse Browse... to choose or create a .db file.");
                    return false;
                }
            }
            else if (string.IsNullOrWhiteSpace(profile.Server) || string.IsNullOrWhiteSpace(profile.Database))
            {
                ErrorDialog.Show(
                    this,
                    "Invalid Profile",
                    "Enter the server and database name for this profile.",
                    $"Provider: {DatabaseProviderInfo.GetDisplayName(profile.Provider)}\n\nServer and database name are required for network database connections.");
                return false;
            }

            bool databaseCreated;
            try
            {
                databaseCreated = DatabaseConnectionFactory.EnsureSchema(profile);
            }
            catch (Exception ex)
            {
                ErrorDialog.Show(
                    this,
                    "Schema Error",
                    DatabaseOperationDetails.FormatFailureSummary(profile, "prepare the database schema"),
                    DatabaseOperationDetails.FormatFailureDetails(profile, ErrorDialog.FormatException(ex)));
                return false;
            }

            AppSettings.RememberDatabaseProfile(profile);
            SelectedProfile = profile;
            CompletionDialog.Show(
                this,
                "Settings Saved",
                databaseCreated
                    ? $"The connection profile \"{profile.Name}\" was saved and the database was created."
                    : $"The connection profile \"{profile.Name}\" was saved.",
                DatabaseOperationDetails.FormatConnectionSavedDetails(profile, databaseCreated),
                "Details:");
            return true;
        }

        private void DeleteProfile()
        {
            var profile = CurrentProfile;
            if (profile == null)
                return;

            if (MessageBox.Show(this, $"Delete profile \"{profile.Name}\"?", "Delete Profile",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            string deletedName = profile.Name;
            var deletedDetails = DatabaseOperationDetails.FormatConnectionDetails(profile);
            AppSettings.RemoveDatabaseProfile(profile.Id);
            LoadProfiles();
            CompletionDialog.Show(
                this,
                "Profile Deleted",
                $"The connection profile \"{deletedName}\" was removed.",
                deletedDetails,
                "Details:");
        }

        private static Button MakeButton(string text, bool primary)
        {
            var button = new Button
            {
                Text = text,
                Size = new Size(110, 30),
                Margin = new Padding(6, 0, 0, 0),
                FlatStyle = FlatStyle.Flat
            };
            button.FlatAppearance.BorderSize = 1;

            if (primary)
            {
                button.BackColor = AppTheme.Accent;
                button.ForeColor = AppTheme.TextOnAccent;
                button.FlatAppearance.BorderColor = AppTheme.AccentDark;
            }
            else
            {
                button.BackColor = AppTheme.SurfaceColor;
                button.ForeColor = AppTheme.TextPrimary;
                button.FlatAppearance.BorderColor = AppTheme.BorderColor;
            }

            return button;
        }

        private static void StyleActionButton(Button button)
        {
            button.Size = new Size(110, 30);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 1;
            button.BackColor = AppTheme.SurfaceColor;
            button.ForeColor = AppTheme.TextPrimary;
            button.FlatAppearance.BorderColor = AppTheme.BorderColor;
        }
    }
}
