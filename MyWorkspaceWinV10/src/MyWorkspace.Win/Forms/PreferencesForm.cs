namespace MyWorkspace.Win.Forms;

public partial class PreferencesForm : Form
{
    private readonly UiSettings _originalSettings = AppConfig.UiSettings.Clone();
    private readonly PastelColorThemePicker _colorThemePicker = new();
    private bool _suppressLivePreview;

    public UiSettings SelectedSettings { get; private set; } = AppConfig.UiSettings.Clone();

    public PreferencesForm()
    {
        InitializeComponent();
        AppTheme.ApplyStandardDialog(this);
    }

    private void PreferencesForm_Load(object? sender, EventArgs e)
    {
        ApplyLocalization();
        PopulateThemeCombo();
        PopulateLanguageCombo();
        PopulateFontScaleCombo();
        SetupColorThemePicker();
    }

    private void SetupColorThemePicker()
    {
        _colorThemePicker.AutoSize = true;
        _colorThemePicker.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        _colorThemePicker.Dock = DockStyle.Top;
        _colorThemePicker.Margin = Padding.Empty;
        _colorThemePicker.SelectionChanged += (_, _) => ApplyLivePreview();
        _colorThemePicker.LoadFromSettings(SelectedSettings);
        pnlColorTheme.Controls.Add(_colorThemePicker);
        _colorThemePicker.ApplyTheme();
        AppTheme.FinalizeDialogLayout(this);
    }

    private void PopulateThemeCombo()
    {
        var selected = (cboTheme.SelectedItem as ThemeListItem)?.Value ?? SelectedSettings.Theme;
        RepopulateThemeCombo(selected);
        cboTheme.SelectedIndexChanged += (_, _) => ApplyLivePreview();
    }

    private void PopulateLanguageCombo()
    {
        var selected = (cboLanguage.SelectedItem as LanguageListItem)?.Value ?? SelectedSettings.Language;
        RepopulateLanguageCombo(selected);
        cboLanguage.SelectedIndexChanged += (_, _) => ApplyLivePreview();
    }

    private void PopulateFontScaleCombo()
    {
        var selected = (cboFontScale.SelectedItem as FontScaleListItem)?.Value
            ?? UiFontScale.Normalize(SelectedSettings.FontScaleStep);
        RepopulateFontScaleCombo(selected);
        cboFontScale.SelectedIndexChanged += (_, _) => ApplyLivePreview();
    }

    private void RepopulateThemeCombo(AppThemeKind selected)
    {
        _suppressLivePreview = true;
        try
        {
            cboTheme.Items.Clear();
            cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Light, Localization.Get(K.ThemeLight)));
            cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Dark, Localization.Get(K.ThemeDark)));
            cboTheme.SelectedItem = cboTheme.Items.Cast<ThemeListItem>()
                .FirstOrDefault(item => item.Value == selected) ?? cboTheme.Items[0];
        }
        finally
        {
            _suppressLivePreview = false;
        }
    }

    private void RepopulateLanguageCombo(AppLanguage selected)
    {
        _suppressLivePreview = true;
        try
        {
            cboLanguage.Items.Clear();
            cboLanguage.Items.Add(new LanguageListItem(AppLanguage.Korean, Localization.Get(K.LanguageKorean)));
            cboLanguage.Items.Add(new LanguageListItem(AppLanguage.English, Localization.Get(K.LanguageEnglish)));
            cboLanguage.SelectedItem = cboLanguage.Items.Cast<LanguageListItem>()
                .FirstOrDefault(item => item.Value == selected) ?? cboLanguage.Items[0];
        }
        finally
        {
            _suppressLivePreview = false;
        }
    }

    private void RepopulateFontScaleCombo(int selected)
    {
        selected = UiFontScale.Normalize(selected);
        _suppressLivePreview = true;
        try
        {
            cboFontScale.Items.Clear();
            for (var step = UiFontScale.MinStep; step <= UiFontScale.MaxStep; step++)
            {
                cboFontScale.Items.Add(new FontScaleListItem(
                    step,
                    Localization.Get(UiFontScale.GetLocalizationKey(step))));
            }

            cboFontScale.SelectedItem = cboFontScale.Items.Cast<FontScaleListItem>()
                .FirstOrDefault(item => item.Value == selected)
                ?? cboFontScale.Items[2];
        }
        finally
        {
            _suppressLivePreview = false;
        }
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (!TryReadSettings(out var settings))
            return;

        SelectedSettings = settings;
        DialogResult = DialogResult.OK;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult != DialogResult.OK)
        {
            Localization.SetLanguage(_originalSettings.Language);
            AppTheme.ApplyAppearance(_originalSettings);
        }

        base.OnFormClosing(e);
    }

    private void ApplyLivePreview()
    {
        if (_suppressLivePreview || !TryReadSettings(out var settings))
            return;

        Localization.SetLanguage(settings.Language);
        AppTheme.ApplyAppearance(settings);
        RefreshLocalizedOptions(settings);
        _colorThemePicker.ApplyTheme();
        AppTheme.FinalizeDialogLayout(this);
    }

    private void RefreshLocalizedOptions(UiSettings settings)
    {
        ApplyLocalization();
        RepopulateThemeCombo(settings.Theme);
        RepopulateLanguageCombo(settings.Language);
        RepopulateFontScaleCombo(settings.FontScaleStep);
    }

    private bool TryReadSettings(out UiSettings settings)
    {
        settings = AppConfig.UiSettings.Clone();

        if (cboTheme.SelectedItem is not ThemeListItem themeItem ||
            cboLanguage.SelectedItem is not LanguageListItem languageItem ||
            cboFontScale.SelectedItem is not FontScaleListItem fontScaleItem)
        {
            return false;
        }

        settings.Theme = themeItem.Value;
        settings.Language = languageItem.Value;
        settings.FontScaleStep = fontScaleItem.Value;
        _colorThemePicker.ApplyToSettings(settings);
        return true;
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.PreferencesTitle);
        lblAppearance.Text = Localization.Get(K.PreferencesAppearance);
        lblTheme.Text = Localization.Get(K.PreferencesTheme);
        lblColorTheme.Text = Localization.Get(K.PreferencesColorTheme);
        lblLanguage.Text = Localization.Get(K.PreferencesLanguage);
        lblFontScale.Text = Localization.Get(K.PreferencesFontScale);
        lblHint.Text = Localization.Get(K.PreferencesRestartHint);
        btnOk.Text = Localization.Get(K.ButtonOk);
        btnCancel.Text = Localization.Get(K.ButtonCancel);
    }

    private sealed record ThemeListItem(AppThemeKind Value, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed record LanguageListItem(AppLanguage Value, string Label)
    {
        public override string ToString() => Label;
    }

    private sealed record FontScaleListItem(int Value, string Label)
    {
        public override string ToString() => Label;
    }
}
