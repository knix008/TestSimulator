using DiffMergeWinV10.App.Services;

namespace DiffMergeWinV10.App.Dialogs;

/// <summary>
/// Central place to view/edit the app's settings (pane font size, word wrap, language) and to
/// clear the remembered last session.
/// </summary>
public sealed class PreferencesDialog : Form
{
    private readonly AppSettings _settings;
    private readonly AppLanguage _originalLanguage;
    private readonly float _originalFontSize;
    private readonly bool _originalWordWrap;
    private readonly LastSessionInfo? _originalLastSession;

    private readonly NumericUpDown _fontSize = new() { Minimum = 7, Maximum = 18, DecimalPlaces = 1, Increment = 0.5m, Width = 80 };
    private readonly CheckBox _wordWrap = new() { AutoSize = true };
    private readonly ComboBox _language = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 140 };
    private readonly Label _lblFontSize = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 8, 6) };
    private readonly Label _lblLanguage = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 8, 6) };
    private readonly Button _forgetSession = new() { AutoSize = true };
    private readonly Button _ok = new() { DialogResult = DialogResult.OK, AutoSize = true };
    private readonly Button _cancel = new() { DialogResult = DialogResult.Cancel, AutoSize = true };
    private bool _sessionForgotten;

    public event EventHandler? SettingsChanged;

    public PreferencesDialog(AppSettings settings)
    {
        _settings = settings;
        _originalLanguage = settings.Language;
        _originalFontSize = settings.PaneFontSize;
        _originalWordWrap = settings.WordWrap;
        _originalLastSession = settings.LastSession;

        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 10f);
        Width = 400;
        Height = 260;

        _fontSize.Value = (decimal)settings.PaneFontSize;
        _wordWrap.Checked = settings.WordWrap;
        _fontSize.ValueChanged += (_, _) =>
        {
            _settings.PaneFontSize = (float)_fontSize.Value;
            SettingsChanged?.Invoke(this, EventArgs.Empty);
        };
        _wordWrap.CheckedChanged += (_, _) =>
        {
            _settings.WordWrap = _wordWrap.Checked;
            SettingsChanged?.Invoke(this, EventArgs.Empty);
        };
        _language.Items.Add(Strings.LanguageKorean);
        _language.Items.Add(Strings.LanguageEnglish);
        _language.SelectedIndex = settings.Language == AppLanguage.Korean ? 0 : 1;
        _language.SelectedIndexChanged += (_, _) => ApplyLanguageSelection();

        var layout = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, AutoSize = true, Padding = new Padding(12) };
        layout.Controls.Add(_lblFontSize, 0, 0);
        layout.Controls.Add(_fontSize, 1, 0);
        layout.Controls.Add(_wordWrap, 0, 1);
        layout.SetColumnSpan(_wordWrap, 2);
        layout.Controls.Add(_lblLanguage, 0, 2);
        layout.Controls.Add(_language, 1, 2);

        _forgetSession.Margin = new Padding(12, 12, 12, 0);
        _forgetSession.Click += (_, _) =>
        {
            _sessionForgotten = true;
            _settings.LastSession = null;
            MessageBox.Show(this, Strings.PreferencesSessionCleared, Strings.PreferencesTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Padding = new Padding(12) };
        _ok.Click += (_, _) => Apply();
        buttons.Controls.Add(_cancel);
        buttons.Controls.Add(_ok);

        Controls.Add(layout);
        Controls.Add(_forgetSession);
        Controls.Add(buttons);
        AcceptButton = _ok;
        CancelButton = _cancel;

        ApplyLocalizedText();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.OK)
        {
            _settings.Language = _originalLanguage;
            _settings.PaneFontSize = _originalFontSize;
            _settings.WordWrap = _originalWordWrap;
            _settings.LastSession = _originalLastSession;
        }

        base.OnFormClosing(e);
    }

    private void ApplyLanguageSelection()
    {
        _settings.Language = _language.SelectedIndex == 0 ? AppLanguage.Korean : AppLanguage.English;
        Strings.Language = _settings.Language;
        ApplyLocalizedText();
        SettingsChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ApplyLocalizedText()
    {
        Text = Strings.PreferencesTitle;
        _lblFontSize.Text = Strings.PreferencesPaneFontSize;
        _wordWrap.Text = Strings.PreferencesWordWrap;
        _lblLanguage.Text = Strings.PreferencesLanguage;
        _forgetSession.Text = Strings.PreferencesForgetSession;
        _ok.Text = Strings.Ok;
        _cancel.Text = Strings.Cancel;
    }

    private void Apply()
    {
        _settings.PaneFontSize = (float)_fontSize.Value;
        _settings.WordWrap = _wordWrap.Checked;
        _settings.Language = _language.SelectedIndex == 0 ? AppLanguage.Korean : AppLanguage.English;
        if (_sessionForgotten)
        {
            _settings.LastSession = null;
        }
    }
}
