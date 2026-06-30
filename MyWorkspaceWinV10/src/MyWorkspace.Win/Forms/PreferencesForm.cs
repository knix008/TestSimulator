namespace MyWorkspace.Win.Forms;

public partial class PreferencesForm : Form
{
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
    }

    private void PopulateThemeCombo()
    {
        cboTheme.Items.Clear();
        cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Light, Localization.Get(K.ThemeLight)));
        cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Dark, Localization.Get(K.ThemeDark)));
        cboTheme.SelectedItem = cboTheme.Items.Cast<ThemeListItem>()
            .FirstOrDefault(item => item.Value == SelectedSettings.Theme) ?? cboTheme.Items[0];
    }

    private void PopulateLanguageCombo()
    {
        cboLanguage.Items.Clear();
        cboLanguage.Items.Add(new LanguageListItem(AppLanguage.Korean, Localization.Get(K.LanguageKorean)));
        cboLanguage.Items.Add(new LanguageListItem(AppLanguage.English, Localization.Get(K.LanguageEnglish)));
        cboLanguage.SelectedItem = cboLanguage.Items.Cast<LanguageListItem>()
            .FirstOrDefault(item => item.Value == SelectedSettings.Language) ?? cboLanguage.Items[0];
    }

    private void PopulateFontScaleCombo()
    {
        cboFontScale.Items.Clear();
        for (var step = UiFontScale.MinStep; step <= UiFontScale.MaxStep; step++)
        {
            cboFontScale.Items.Add(new FontScaleListItem(
                step,
                Localization.Get(UiFontScale.GetLocalizationKey(step))));
        }

        cboFontScale.SelectedItem = cboFontScale.Items.Cast<FontScaleListItem>()
            .FirstOrDefault(item => item.Value == UiFontScale.Normalize(SelectedSettings.FontScaleStep))
            ?? cboFontScale.Items[2];
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (cboTheme.SelectedItem is not ThemeListItem themeItem ||
            cboLanguage.SelectedItem is not LanguageListItem languageItem ||
            cboFontScale.SelectedItem is not FontScaleListItem fontScaleItem)
            return;

        SelectedSettings = AppConfig.UiSettings.Clone();
        SelectedSettings.Theme = themeItem.Value;
        SelectedSettings.Language = languageItem.Value;
        SelectedSettings.FontScaleStep = fontScaleItem.Value;
        DialogResult = DialogResult.OK;
        Close();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.PreferencesTitle);
        lblAppearance.Text = Localization.Get(K.PreferencesAppearance);
        lblTheme.Text = Localization.Get(K.PreferencesTheme);
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
