using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Persistence;

namespace CodeAnalyzer.Controls;

public sealed class DatabaseSettingsDialog : Form
{
    private readonly CheckBox _enabledCheck = new() { Text = "DB 연결 사용", AutoSize = true };
    private readonly CheckBox _autoSaveCheck = new() { Text = "분석 완료 시 결과 자동 저장", AutoSize = true };
    private readonly CheckBox _autoSchemaCheck = new() { Text = "테이블 자동 생성", AutoSize = true };
    private readonly ComboBox _providerCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _hostInput = new() { Dock = DockStyle.Fill };
    private readonly NumericUpDown _portInput = new()
    {
        Minimum = 0,
        Maximum = 65535,
        Dock = DockStyle.Fill
    };
    private readonly TextBox _databaseInput = new() { Dock = DockStyle.Fill };
    private readonly TextBox _usernameInput = new() { Dock = DockStyle.Fill };
    private readonly TextBox _passwordInput = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    private readonly TextBox _prefixInput = new() { Dock = DockStyle.Fill };
    private readonly Label _hintLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Padding = new Padding(12, 0, 12, 0),
        ForeColor = Color.FromArgb(90, 100, 115),
        Text = "MariaDB, MySQL, PostgreSQL에 분석 결과를 저장합니다. 비밀번호는 로컬 settings.json에 저장됩니다."
    };
    private Button _okButton = null!;
    private Button _cancelButton = null!;
    private Button _testButton = null!;

    public DatabaseConnectionSettings Settings { get; private set; }

    public DatabaseSettingsDialog(DatabaseConnectionSettings settings)
    {
        Settings = DatabaseConnectionSettings.Normalize(settings);

        Text = "DB 연결 설정";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(520, 470);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ApplicationDialogIcons.ApplyAppTitleBar(this);

        _providerCombo.Items.AddRange(["MySQL", "MariaDB", "PostgreSQL"]);
        BindToControls(Settings);

        var headerPanel = ApplicationDialogIcons.CreateHeaderPanel("DB 연결 설정");
        var formPanel = BuildFormPanel();
        var footer = CreateFooter();

        Controls.Add(formPanel);
        Controls.Add(footer);
        Controls.Add(_hintLabel);
        Controls.Add(headerPanel);

        AcceptButton = _okButton;
        CancelButton = _cancelButton;

        _enabledCheck.CheckedChanged += (_, _) => UpdateEnabledState();
        _providerCombo.SelectedIndexChanged += (_, _) => ApplyDefaultPortIfUnset();
        _testButton.Click += async (_, _) => await TestConnectionAsync(_testButton);
        _okButton.Click += (_, _) =>
        {
            if (!TryCommit())
            {
                DialogResult = DialogResult.None;
            }
        };

        UpdateEnabledState();
    }

    private Panel BuildFormPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 8, 12, 8),
            ColumnCount = 2,
            RowCount = 11
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var row = 0;
        AddFullWidthRow(panel, ref row, _enabledCheck);
        AddFullWidthRow(panel, ref row, _autoSaveCheck);
        AddFullWidthRow(panel, ref row, _autoSchemaCheck);
        AddRow(panel, ref row, "DB 종류", _providerCombo);
        AddRow(panel, ref row, "호스트", _hostInput);
        AddRow(panel, ref row, "포트", _portInput);
        AddRow(panel, ref row, "데이터베이스", _databaseInput);
        AddRow(panel, ref row, "사용자", _usernameInput);
        AddRow(panel, ref row, "비밀번호", _passwordInput);
        AddRow(panel, ref row, "테이블 접두사", _prefixInput);

        return new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(0, 52, 0, 52),
            Controls = { panel }
        };
    }

    private static void AddRow(TableLayoutPanel panel, ref int row, string label, Control input)
    {
        panel.Controls.Add(new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, row);
        panel.Controls.Add(input, 1, row);
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        row++;
    }

    private static void AddFullWidthRow(TableLayoutPanel panel, ref int row, Control control)
    {
        panel.SetColumnSpan(control, 2);
        panel.Controls.Add(control, 0, row);
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        row++;
    }

    private Panel CreateFooter()
    {
        _testButton = new Button
        {
            Text = "연결 테스트",
            AutoSize = true,
            Anchor = AnchorStyles.Left | AnchorStyles.Top
        };
        _cancelButton = new Button
        {
            Text = "취소",
            DialogResult = DialogResult.Cancel,
            Anchor = AnchorStyles.Right | AnchorStyles.Top
        };
        _okButton = new Button
        {
            Text = "확인",
            DialogResult = DialogResult.OK,
            Anchor = AnchorStyles.Right | AnchorStyles.Top
        };

        var footer = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 52,
            Padding = new Padding(12, 8, 12, 8)
        };

        footer.Resize += (_, _) =>
        {
            _okButton.Location = new Point(footer.ClientSize.Width - _okButton.Width, 8);
            _cancelButton.Location = new Point(_okButton.Left - _cancelButton.Width - 8, 8);
            _testButton.Location = new Point(0, 8);
        };
        footer.Controls.Add(_testButton);
        footer.Controls.Add(_cancelButton);
        footer.Controls.Add(_okButton);
        return footer;
    }

    private void BindToControls(DatabaseConnectionSettings settings)
    {
        _enabledCheck.Checked = settings.Enabled;
        _autoSaveCheck.Checked = settings.SaveOnAnalysisComplete;
        _autoSchemaCheck.Checked = settings.AutoCreateSchema;
        _providerCombo.SelectedIndex = settings.Provider switch
        {
            AnalysisDatabaseProvider.MySql => 0,
            AnalysisDatabaseProvider.MariaDb => 1,
            _ => 2
        };
        _hostInput.Text = settings.Host;
        _portInput.Value = settings.Port;
        _databaseInput.Text = settings.Database;
        _usernameInput.Text = settings.Username;
        _passwordInput.Text = settings.Password;
        _prefixInput.Text = settings.TablePrefix;
    }

    private bool TryCommit()
    {
        var settings = ReadFromControls();
        if (settings.Enabled)
        {
            try
            {
                settings.ValidateForUse();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "DB 설정", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        Settings = settings;
        return true;
    }

    private DatabaseConnectionSettings ReadFromControls()
    {
        return DatabaseConnectionSettings.Normalize(new DatabaseConnectionSettings
        {
            Enabled = _enabledCheck.Checked,
            SaveOnAnalysisComplete = _autoSaveCheck.Checked,
            AutoCreateSchema = _autoSchemaCheck.Checked,
            Provider = _providerCombo.SelectedIndex switch
            {
                0 => AnalysisDatabaseProvider.MySql,
                1 => AnalysisDatabaseProvider.MariaDb,
                _ => AnalysisDatabaseProvider.PostgreSql
            },
            Host = _hostInput.Text,
            Port = (int)_portInput.Value,
            Database = _databaseInput.Text,
            Username = _usernameInput.Text,
            Password = _passwordInput.Text,
            TablePrefix = _prefixInput.Text
        });
    }

    private void UpdateEnabledState()
    {
        var enabled = _enabledCheck.Checked;
        _autoSaveCheck.Enabled = enabled;
        _autoSchemaCheck.Enabled = enabled;
        _providerCombo.Enabled = enabled;
        _hostInput.Enabled = enabled;
        _portInput.Enabled = enabled;
        _databaseInput.Enabled = enabled;
        _usernameInput.Enabled = enabled;
        _passwordInput.Enabled = enabled;
        _prefixInput.Enabled = enabled;
    }

    private void ApplyDefaultPortIfUnset()
    {
        if (_portInput.Value != 0)
        {
            return;
        }

        _portInput.Value = _providerCombo.SelectedIndex switch
        {
            2 => 5432,
            _ => 3306
        };
    }

    private async Task TestConnectionAsync(Button testButton)
    {
        if (!TryCommit())
        {
            return;
        }

        testButton.Enabled = false;
        UseWaitCursor = true;
        try
        {
            await DatabaseConnectionTester.TestAsync(Settings);
            MessageBox.Show(this, "DB 연결에 성공했습니다.", "연결 테스트", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "연결 테스트 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            UseWaitCursor = false;
            testButton.Enabled = true;
        }
    }
}
