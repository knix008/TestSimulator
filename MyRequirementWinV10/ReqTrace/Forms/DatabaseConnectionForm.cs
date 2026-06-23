using ReqTrace.Localization;
using ReqTrace.Persistence.Database;
using ReqTrace.Theme;

namespace ReqTrace.Forms;

public partial class DatabaseConnectionForm : Form
{
    private ComboBox cboProvider = null!;
    private TextBox txtServer = null!;
    private NumericUpDown numPort = null!;
    private TextBox txtDatabase = null!;
    private TextBox txtUsername = null!;
    private TextBox txtPassword = null!;
    private CheckBox chkIntegratedSecurity = null!;
    private TextBox txtSqliteFile = null!;
    private Button btnBrowseSqlite = null!;
    private Label lblServer = null!;
    private Label lblPort = null!;
    private Label lblDatabase = null!;
    private Label lblUsername = null!;
    private Label lblPassword = null!;
    private Label lblProvider = null!;
    private Label lblConnectionStatus = null!;
    private Button btnTest = null!;
    private Button btnOk = null!;
    private Button btnCancel = null!;

    public DbConnectionSettings Settings { get; }

    public DatabaseConnectionForm(DbConnectionSettings? existing = null)
    {
        Settings = existing ?? new DbConnectionSettings();
        InitializeComponent();
        BindFromSettings();
        UpdateFieldVisibility();
        ModernTheme.Apply(this);
        ModernTheme.MakePrimary(btnOk);
        ApplyLocalization();
    }

    private void InitializeComponent()
    {
        Text = "Database Connection";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(420, 320);

        lblProvider = new Label { Text = "Provider", Location = new Point(16, 20), AutoSize = true };
        cboProvider = new ComboBox
        {
            Location = new Point(140, 16),
            Width = 260,
            DropDownStyle = ComboBoxStyle.DropDownList
        };
        cboProvider.Items.AddRange(new object[]
        {
            DbProvider.MySql, DbProvider.MariaDb, DbProvider.PostgreSql, DbProvider.Sqlite, DbProvider.SqlServer
        });
        cboProvider.SelectedIndexChanged += (_, _) => OnProviderChanged();

        lblServer = new Label { Text = "Server", Location = new Point(16, 56), AutoSize = true };
        txtServer = new TextBox { Location = new Point(140, 52), Width = 140 };

        lblPort = new Label { Text = "Port", Location = new Point(288, 56), AutoSize = true };
        numPort = new NumericUpDown { Location = new Point(330, 52), Width = 70, Maximum = 65535, Minimum = 0 };

        lblDatabase = new Label { Text = "Database", Location = new Point(16, 92), AutoSize = true };
        txtDatabase = new TextBox { Location = new Point(140, 88), Width = 260 };

        lblUsername = new Label { Text = "Username", Location = new Point(16, 128), AutoSize = true };
        txtUsername = new TextBox { Location = new Point(140, 124), Width = 260 };

        lblPassword = new Label { Text = "Password", Location = new Point(16, 164), AutoSize = true };
        txtPassword = new TextBox { Location = new Point(140, 160), Width = 260, UseSystemPasswordChar = true };

        chkIntegratedSecurity = new CheckBox { Text = "Windows Integrated Security", Location = new Point(140, 196), AutoSize = true };
        chkIntegratedSecurity.CheckedChanged += (_, _) => UpdateFieldVisibility();

        txtSqliteFile = new TextBox { Location = new Point(140, 88), Width = 200, Visible = false };
        btnBrowseSqlite = new Button { Text = "...", Location = new Point(346, 87), Width = 30, Visible = false };
        btnBrowseSqlite.Click += (_, _) => BrowseSqliteFile();

        lblConnectionStatus = new Label
        {
            Location = new Point(16, 228),
            Size = new Size(388, 20),
            AutoEllipsis = true,
            Visible = false
        };

        btnTest = new Button { Text = "Test Connection", Location = new Point(16, 256), Width = 130 };
        btnTest.Click += async (_, _) => await TestConnectionAsync();

        btnOk = new Button { Text = "OK", Location = new Point(228, 256), Width = 80, DialogResult = DialogResult.None };
        btnCancel = new Button { Text = "Cancel", Location = new Point(316, 256), Width = 80, DialogResult = DialogResult.Cancel };
        btnOk.Click += async (_, _) => await ConfirmAsync();

        Controls.AddRange(new Control[]
        {
            lblProvider, cboProvider,
            lblServer, txtServer, lblPort, numPort,
            lblDatabase, txtDatabase, txtSqliteFile, btnBrowseSqlite,
            lblUsername, txtUsername,
            lblPassword, txtPassword,
            chkIntegratedSecurity,
            lblConnectionStatus,
            btnTest, btnOk, btnCancel
        });

        AcceptButton = btnOk;
        CancelButton = btnCancel;
    }

    private void ApplyLocalization()
    {
        Text = Loc.T("Title_DatabaseConnection");
        lblProvider.Text = Loc.T("Db_Provider");
        lblServer.Text = Loc.T("Db_Server");
        lblPort.Text = Loc.T("Db_Port");
        lblDatabase.Text = Loc.T("Db_Database");
        lblUsername.Text = Loc.T("Db_Username");
        lblPassword.Text = Loc.T("Db_Password");
        chkIntegratedSecurity.Text = Loc.T("Db_IntegratedSecurity");
        btnTest.Text = Loc.T("Db_TestConnection");
        btnOk.Text = Loc.T("Common_OK");
        btnCancel.Text = Loc.T("Common_Cancel");
    }

    private void BindFromSettings()
    {
        cboProvider.SelectedItem = Settings.Provider;
        txtServer.Text = Settings.Server;
        numPort.Value = Settings.Port;
        txtDatabase.Text = Settings.Database;
        txtSqliteFile.Text = Settings.SqliteFilePath;
        txtUsername.Text = Settings.Username;
        txtPassword.Text = Settings.Password;
        chkIntegratedSecurity.Checked = Settings.IntegratedSecurity;
    }

    private void SaveToSettings()
    {
        Settings.Provider = (DbProvider)cboProvider.SelectedItem!;
        Settings.Server = txtServer.Text.Trim();
        Settings.Port = (int)numPort.Value;
        Settings.Database = txtDatabase.Text.Trim();
        Settings.SqliteFilePath = txtSqliteFile.Text.Trim();
        Settings.Username = txtUsername.Text.Trim();
        Settings.Password = txtPassword.Text;
        Settings.IntegratedSecurity = chkIntegratedSecurity.Checked;
    }

    private void OnProviderChanged()
    {
        var provider = (DbProvider)cboProvider.SelectedItem!;
        numPort.Value = DbConnectionSettings.DefaultPortFor(provider);
        UpdateFieldVisibility();
    }

    private void UpdateFieldVisibility()
    {
        var provider = cboProvider.SelectedItem is DbProvider p ? p : DbProvider.MariaDb;
        var isSqlite = provider == DbProvider.Sqlite;
        var isSqlServer = provider == DbProvider.SqlServer;
        var useIntegratedSecurity = isSqlServer && chkIntegratedSecurity.Checked;

        lblServer.Visible = !isSqlite;
        txtServer.Visible = !isSqlite;
        lblPort.Visible = !isSqlite;
        numPort.Visible = !isSqlite;

        lblDatabase.Text = isSqlite ? Loc.T("Db_FilePath") : Loc.T("Db_Database");
        txtDatabase.Visible = !isSqlite;
        txtSqliteFile.Visible = isSqlite;
        btnBrowseSqlite.Visible = isSqlite;

        chkIntegratedSecurity.Visible = isSqlServer;

        lblUsername.Visible = !isSqlite && !useIntegratedSecurity;
        txtUsername.Visible = !isSqlite && !useIntegratedSecurity;
        lblPassword.Visible = !isSqlite && !useIntegratedSecurity;
        txtPassword.Visible = !isSqlite && !useIntegratedSecurity;
    }

    private void BrowseSqliteFile()
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "SQLite Database (*.db;*.sqlite)|*.db;*.sqlite|All Files (*.*)|*.*",
            OverwritePrompt = false
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
            txtSqliteFile.Text = dlg.FileName;
    }

    private async Task ConfirmAsync()
    {
        SaveToSettings();
        if (!await TryConnectAsync(showSuccessMessage: true))
            return;

        DialogResult = DialogResult.OK;
        Close();
    }

    private async Task TestConnectionAsync()
    {
        SaveToSettings();
        await TryConnectAsync(showSuccessMessage: true);
    }

    private async Task<bool> TryConnectAsync(bool showSuccessMessage)
    {
        Cursor = Cursors.WaitCursor;
        btnTest.Enabled = false;
        btnOk.Enabled = false;
        try
        {
            await DatabaseSchemaInitializer.EnsureDatabaseExistsAsync(Settings);
            using var connection = await DbConnectionFactory.OpenAsync(Settings);
            await DatabaseSchemaInitializer.EnsureSchemaAsync(connection, Settings.Provider);
            ShowConnectionStatus(success: true);

            if (showSuccessMessage)
            {
                MessageBox.Show(
                    this,
                    Loc.T("Msg_DbConnectionSuccess"),
                    Loc.T("Msg_DbConnectionSuccessTitle"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }

            return true;
        }
        catch (Exception ex)
        {
            ShowConnectionStatus(success: false);
            ErrorDialog.Show(this, Loc.T("Msg_DbConnectionFailed"), ex);
            return false;
        }
        finally
        {
            Cursor = Cursors.Default;
            btnTest.Enabled = true;
            btnOk.Enabled = true;
        }
    }

    private void ShowConnectionStatus(bool success)
    {
        lblConnectionStatus.Visible = true;
        lblConnectionStatus.Text = Loc.T(success ? "Db_StatusConnected" : "Db_StatusFailed");
        lblConnectionStatus.ForeColor = success
            ? Color.FromArgb(22, 101, 52)
            : Color.FromArgb(185, 28, 28);
    }
}
