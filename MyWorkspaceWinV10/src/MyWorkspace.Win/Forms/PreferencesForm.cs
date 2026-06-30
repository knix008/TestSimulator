namespace MyWorkspace.Win.Forms;

public partial class PreferencesForm : Form
{
    public UiSettings SelectedSettings { get; private set; } = AppConfig.UiSettings.Clone();

    public PreferencesForm()
    {
        InitializeComponent();
    }

    private void PreferencesForm_Load(object? sender, EventArgs e)
    {
        AppTheme.ApplyStandardDialog(this);
        ApplyLocalization();

        cboTheme.Items.Clear();
        cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Light, Localization.Get(K.ThemeLight)));
        cboTheme.Items.Add(new ThemeListItem(AppThemeKind.Dark, Localization.Get(K.ThemeDark)));
        cboTheme.SelectedItem = cboTheme.Items.Cast<ThemeListItem>()
            .FirstOrDefault(item => item.Value == SelectedSettings.Theme) ?? cboTheme.Items[0];

        cboLanguage.Items.Clear();
        cboLanguage.Items.Add(new LanguageListItem(AppLanguage.Korean, Localization.Get(K.LanguageKorean)));
        cboLanguage.Items.Add(new LanguageListItem(AppLanguage.English, Localization.Get(K.LanguageEnglish)));
        cboLanguage.SelectedItem = cboLanguage.Items.Cast<LanguageListItem>()
            .FirstOrDefault(item => item.Value == SelectedSettings.Language) ?? cboLanguage.Items[0];
    }

    private void btnOk_Click(object? sender, EventArgs e)
    {
        if (cboTheme.SelectedItem is not ThemeListItem themeItem ||
            cboLanguage.SelectedItem is not LanguageListItem languageItem)
            return;

        SelectedSettings = new UiSettings
        {
            Theme = themeItem.Value,
            Language = languageItem.Value
        };
        DialogResult = DialogResult.OK;
        Close();
    }

    private void ApplyLocalization()
    {
        Text = Localization.Get(K.PreferencesTitle);
        lblAppearance.Text = Localization.Get(K.PreferencesAppearance);
        lblTheme.Text = Localization.Get(K.PreferencesTheme);
        lblLanguage.Text = Localization.Get(K.PreferencesLanguage);
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
}
