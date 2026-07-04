using MyDiffWinV10.App.Controls;
using MyDiffWinV10.App.Services;

namespace MyDiffWinV10.App.Dialogs;

/// <summary>
/// Central place to view/edit the app's settings: pane font size, word wrap, title bar colors, and language.
/// </summary>
public sealed class PreferencesDialog : Form
{
    private readonly AppSettings _settings;
    private readonly AppLanguage _originalLanguage;
    private readonly float _originalFontSize;
    private readonly bool _originalWordWrap;
    private readonly int _originalLeftHeaderColor;
    private readonly int _originalRightHeaderColor;

    private readonly NumericUpDown _fontSize = new() { Minimum = 7, Maximum = 18, DecimalPlaces = 1, Increment = 0.5m, Width = 80 };
    private readonly CheckBox _wordWrap = new() { AutoSize = true };
    private readonly ComboBox _language = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 140 };
    private readonly PaneHeaderColorSelector _leftHeaderColor = new();
    private readonly PaneHeaderColorSelector _rightHeaderColor = new();
    private readonly Label _lblFontSize = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 8, 6) };
    private readonly Label _lblLanguage = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 6, 8, 6) };
    private readonly Label _lblLeftHeaderColor = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 8, 8, 4) };
    private readonly Label _lblRightHeaderColor = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(0, 8, 8, 4) };
    private readonly Button _ok = new() { DialogResult = DialogResult.OK, AutoSize = true };
    private readonly Button _cancel = new() { DialogResult = DialogResult.Cancel, AutoSize = true };

    public event EventHandler? SettingsChanged;

    public PreferencesDialog(AppSettings settings)
    {
        _settings = settings;
        _originalLanguage = settings.Language;
        _originalFontSize = settings.PaneFontSize;
        _originalWordWrap = settings.WordWrap;
        _originalLeftHeaderColor = settings.LeftPaneHeaderColorArgb;
        _originalRightHeaderColor = settings.RightPaneHeaderColorArgb;

        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Font = new Font("Segoe UI", 10f);
        Width = 460;
        Height = 560;

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

        _leftHeaderColor.SetColor(Color.FromArgb(settings.LeftPaneHeaderColorArgb), notify: false);
        _rightHeaderColor.SetColor(Color.FromArgb(settings.RightPaneHeaderColorArgb), notify: false);
        _leftHeaderColor.SelectedColorChanged += (_, _) =>
        {
            _settings.LeftPaneHeaderColorArgb = _leftHeaderColor.SelectedColor.ToArgb();
            SettingsChanged?.Invoke(this, EventArgs.Empty);
        };
        _rightHeaderColor.SelectedColorChanged += (_, _) =>
        {
            _settings.RightPaneHeaderColorArgb = _rightHeaderColor.SelectedColor.ToArgb();
            SettingsChanged?.Invoke(this, EventArgs.Empty);
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            AutoSize = true,
            Padding = new Padding(12),
        };
        layout.Controls.Add(_lblFontSize);
        layout.Controls.Add(_fontSize);
        layout.Controls.Add(_wordWrap);
        layout.Controls.Add(_lblLanguage);
        layout.Controls.Add(_language);
        layout.Controls.Add(_lblLeftHeaderColor);
        layout.Controls.Add(_leftHeaderColor);
        layout.Controls.Add(_lblRightHeaderColor);
        layout.Controls.Add(_rightHeaderColor);

        var scroll = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            Padding = new Padding(0, 0, 0, 8),
        };
        scroll.Controls.Add(layout);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Padding = new Padding(12) };
        _ok.Click += (_, _) => Apply();
        buttons.Controls.Add(_cancel);
        buttons.Controls.Add(_ok);

        Controls.Add(scroll);
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
            _settings.LeftPaneHeaderColorArgb = _originalLeftHeaderColor;
            _settings.RightPaneHeaderColorArgb = _originalRightHeaderColor;
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
        _lblLeftHeaderColor.Text = Strings.PreferencesLeftHeaderColor;
        _lblRightHeaderColor.Text = Strings.PreferencesRightHeaderColor;
        _leftHeaderColor.ApplyLocalizedText();
        _rightHeaderColor.ApplyLocalizedText();
        _ok.Text = Strings.Ok;
        _cancel.Text = Strings.Cancel;
    }

    private void Apply()
    {
        _settings.PaneFontSize = (float)_fontSize.Value;
        _settings.WordWrap = _wordWrap.Checked;
        _settings.Language = _language.SelectedIndex == 0 ? AppLanguage.Korean : AppLanguage.English;
        _settings.LeftPaneHeaderColorArgb = _leftHeaderColor.SelectedColor.ToArgb();
        _settings.RightPaneHeaderColorArgb = _rightHeaderColor.SelectedColor.ToArgb();
    }
}
