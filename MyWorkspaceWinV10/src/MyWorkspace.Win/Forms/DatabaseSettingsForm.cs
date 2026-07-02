using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Data;

namespace MyWorkspace.Win.Forms;

public partial class DatabaseSettingsForm : Form
{
    public DatabaseSettingsForm(bool setupWizardMode = false)
    {
        SetupWizardMode = setupWizardMode;
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    public bool SetupWizardMode { get; }

    public bool DatabaseDisconnected { get; private set; }

    private void DatabaseSettingsForm_Load(object sender, EventArgs e)
    {
        cboProvider.Items.Clear();
        foreach (DatabaseProviderType provider in Enum.GetValues<DatabaseProviderType>())
            cboProvider.Items.Add(new ProviderListItem(provider));

        cboProvider.DisplayMember = nameof(ProviderListItem.DisplayName);
        cboProvider.ValueMember = nameof(ProviderListItem.Provider);

        var current = AppConfig.DatabaseSettings.Clone();
        SelectProvider(current.Provider);
        ApplySettingsToForm(current);
        UpdateProviderUi();
        ApplyLocalization();
        UpdateConnectionStateUi();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(SetupWizardMode ? K.DbSetupWizardTitle : K.DbSettingsTitle);
        lblProvider.Text = Localization.Get(K.LabelProvider);
        lblServer.Text = Localization.Get(K.LabelServer);
        lblPort.Text = Localization.Get(K.LabelPort);
        lblDatabase.Text = Localization.Get(K.LabelDatabase);
        lblUser.Text = Localization.Get(K.LabelUser);
        lblPassword.Text = Localization.Get(K.LabelPassword);
        lblSqliteFile.Text = Localization.Get(K.LabelSqliteFile);
        btnBrowseSqlite.Text = Localization.Get(K.ButtonBrowse);
        btnTest.Text = Localization.Get(K.ButtonTestConnection);
        btnDisconnect.Text = Localization.Get(K.ButtonDisconnectDatabase);
        btnSave.Text = Localization.Get(K.ButtonSave);
        btnCancel.Text = Localization.Get(SetupWizardMode ? K.ButtonExit : K.ButtonCancel);
    }

    private void UpdateConnectionStateUi()
    {
        btnDisconnect.Visible = !SetupWizardMode;

        if (AppConfig.IsDatabaseConnectionDisabled || AppConfig.Services == null)
        {
            btnDisconnect.Enabled = false;
            lblResult.Text = Localization.Get(K.DbConnectionDisconnectedStatus);
            lblResult.ForeColor = Color.Gray;
            return;
        }

        btnDisconnect.Enabled = true;
        if (string.IsNullOrWhiteSpace(lblResult.Text))
        {
            lblResult.Text = Localization.Get(K.DbConnectionActiveStatus);
            lblResult.ForeColor = Color.ForestGreen;
        }
    }

    private void cboProvider_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (cboProvider.SelectedItem is ProviderListItem item)
        {
            txtPort.Text = DatabaseSettings.GetDefaultPort(item.Provider);
            if (item.Provider == DatabaseProviderType.PostgreSQL && string.IsNullOrWhiteSpace(txtUser.Text))
                txtUser.Text = "postgres";
            if ((item.Provider == DatabaseProviderType.MariaDB || item.Provider == DatabaseProviderType.MySQL)
                && string.IsNullOrWhiteSpace(txtUser.Text))
                txtUser.Text = "root";
        }

        UpdateProviderUi();
    }

    private void UpdateProviderUi()
    {
        var isSqlite = GetSelectedProvider() == DatabaseProviderType.SQLite;
        pnlServerFields.Visible = !isSqlite;
        pnlSqliteFields.Visible = isSqlite;

        if (isSqlite && string.IsNullOrWhiteSpace(txtSqliteFilePath.Text))
            txtSqliteFilePath.Text = DatabaseSettings.GetDefaultSqlitePath();
    }

    private DatabaseProviderType GetSelectedProvider() =>
        cboProvider.SelectedItem is ProviderListItem item
            ? item.Provider
            : DatabaseProviderType.MariaDB;

    private DatabaseSettings ReadSettings()
    {
        var provider = GetSelectedProvider();
        return new DatabaseSettings
        {
            Provider = provider,
            Server = txtServer.Text.Trim(),
            Port = string.IsNullOrWhiteSpace(txtPort.Text)
                ? DatabaseSettings.GetDefaultPort(provider)
                : txtPort.Text.Trim(),
            Database = txtDatabase.Text.Trim(),
            User = txtUser.Text.Trim(),
            Password = txtPassword.Text,
            SqliteFilePath = string.IsNullOrWhiteSpace(txtSqliteFilePath.Text)
                ? DatabaseSettings.GetDefaultSqlitePath()
                : txtSqliteFilePath.Text.Trim()
        };
    }

    private void ApplySettingsToForm(DatabaseSettings settings)
    {
        SelectProvider(settings.Provider);
        txtServer.Text = settings.Server;
        txtPort.Text = settings.Port;
        txtDatabase.Text = settings.Database;
        txtUser.Text = settings.User;
        txtPassword.Text = settings.Password;
        txtSqliteFilePath.Text = string.IsNullOrWhiteSpace(settings.SqliteFilePath)
            ? DatabaseSettings.GetDefaultSqlitePath()
            : settings.SqliteFilePath;
    }

    private void SelectProvider(DatabaseProviderType provider)
    {
        for (var i = 0; i < cboProvider.Items.Count; i++)
        {
            if (cboProvider.Items[i] is ProviderListItem item && item.Provider == provider)
            {
                cboProvider.SelectedIndex = i;
                return;
            }
        }

        cboProvider.SelectedIndex = 0;
    }

    private bool ValidateSettings(DatabaseSettings settings, out string message)
    {
        if (settings.Provider == DatabaseProviderType.SQLite)
        {
            if (string.IsNullOrWhiteSpace(settings.SqliteFilePath))
            {
                message = Localization.Get(K.DbEnterSqlitePath);
                return false;
            }

            message = string.Empty;
            return true;
        }

        if (string.IsNullOrWhiteSpace(settings.Server) || string.IsNullOrWhiteSpace(settings.Database))
        {
            message = Localization.Get(K.DbEnterServerDatabase);
            return false;
        }

        message = string.Empty;
        return true;
    }

    private void btnBrowseSqlite_Click(object sender, EventArgs e)
    {
        using var dialog = new SaveFileDialog
        {
            Filter = "SQLite DB (*.db)|*.db|All files (*.*)|*.*",
            FileName = "myworkspace.db",
            Title = Localization.Get(K.SqliteFileDialogTitle)
        };
        DialogPathHelper.ApplyExportDirectory(dialog);

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            DialogPathHelper.RememberExportPath(dialog.FileName);
            txtSqliteFilePath.Text = dialog.FileName;
        }
    }

    private void btnTest_Click(object sender, EventArgs e)
    {
        var settings = ReadSettings();
        if (!ValidateSettings(settings, out var validationMessage))
        {
            MessageBox.Show(validationMessage, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        lblResult.Text = Localization.Get(K.DbTestingConnection);
        lblResult.ForeColor = Color.Gray;
        Refresh();

        if (AppConfig.TestConnection(settings, createIfNotExists: true, out var error, out var created))
        {
            lblResult.Text = Localization.Get(created ? K.DbConnectionSuccessCreated : K.DbConnectionSuccess);
            lblResult.ForeColor = Color.ForestGreen;
        }
        else
        {
            lblResult.Text = Localization.Get(K.DbConnectionFailed);
            lblResult.ForeColor = Color.Firebrick;
            ErrorDetailForm.Show(this, Text, Localization.Get(K.DbConnectionFailedMsg), error);
        }
    }

    private void btnDisconnect_Click(object sender, EventArgs e)
    {
        if (AppConfig.IsDatabaseConnectionDisabled || AppConfig.Services == null)
            return;

        if (MessageBox.Show(
                Localization.Get(K.ConfirmDisconnectDatabase),
                Text,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            return;

        AppConfig.DisconnectDatabase();
        DatabaseDisconnected = true;
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnSave_Click(object sender, EventArgs e)
    {
        var settings = ReadSettings();
        if (!ValidateSettings(settings, out var validationMessage))
        {
            MessageBox.Show(validationMessage, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!AppConfig.SaveAndApplyDatabaseSettings(settings, createIfNotExists: true, out var error))
        {
            ErrorDetailForm.Show(this, Text, Localization.Get(K.DbConnectionFailedMsg), error);
            return;
        }

        MessageBox.Show(
            SetupWizardMode
                ? string.Format(
                    Localization.Get(K.DbSavedWizard),
                    DbInitializer.DefaultAdminUsername,
                    DbInitializer.DefaultAdminPassword)
                : Localization.Get(K.DbSaved),
            Text,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
        DialogResult = DialogResult.OK;
        Close();
    }

    private void btnCancel_Click(object sender, EventArgs e)
    {
        if (SetupWizardMode)
        {
            DialogResult = DialogResult.Cancel;
            Close();
            return;
        }

        DialogResult = DialogResult.Cancel;
        Close();
    }

    private sealed class ProviderListItem(DatabaseProviderType providerType)
    {
        public DatabaseProviderType Provider { get; } = providerType;
        public string DisplayName => LocalizationDisplay.DatabaseProvider(Provider);
    }
}
