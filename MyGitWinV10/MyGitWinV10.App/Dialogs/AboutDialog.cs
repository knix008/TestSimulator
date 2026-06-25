using System.Reflection;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class AboutDialog : Form
{
    public AboutDialog()
    {
        InitializeComponent();
        ApplyLocalizedText();
        Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged() => ApplyLocalizedText();

    private void ApplyLocalizedText()
    {
        Text = Localization.T("About.Title");
        descriptionLabel.Text = Localization.T("About.Description");
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        versionLabel.Text = Localization.Tf("About.Version", version?.ToString(3) ?? "1.0.0");
        okButton.Text = Localization.T("Common.OK");
    }
}
