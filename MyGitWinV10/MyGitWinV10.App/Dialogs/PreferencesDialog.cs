using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class PreferencesDialog : Form
{
    private readonly AppSettingsStore _settings;

    public PreferencesDialog(AppSettingsStore settings)
    {
        _settings = settings;
        InitializeComponent();

        diffToolPathTextBox.Text = settings.ExternalDiffToolPath ?? string.Empty;
        diffToolArgumentsTextBox.Text = settings.ExternalDiffToolArguments;

        ApplyLocalizedText();
        languageComboBox.SelectedIndex = settings.Language == AppLanguage.English ? 1 : 0;
    }

    private void ApplyLocalizedText()
    {
        Text = Localization.T("Preferences.Title");
        diffToolGroupBox.Text = Localization.T("Preferences.Diff.Group");
        diffToolPathLabel.Text = Localization.T("Preferences.Diff.Path");
        browseButton.Text = Localization.T("Preferences.Diff.Browse");
        diffToolArgumentsLabel.Text = Localization.T("Preferences.Diff.Arguments");
        diffToolHintLabel.Text = Localization.T("Preferences.Diff.Hint");
        languageGroupBox.Text = Localization.T("Preferences.Language.Group");
        okButton.Text = Localization.T("Preferences.OK");
        cancelButton.Text = Localization.T("Preferences.Cancel");

        languageComboBox.Items.Clear();
        languageComboBox.Items.Add(Localization.T("Preferences.Language.Korean"));
        languageComboBox.Items.Add(Localization.T("Preferences.Language.English"));
    }

    private void BrowseButton_Click(object? sender, EventArgs e)
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "Executable (*.exe)|*.exe|All files (*.*)|*.*",
            FileName = diffToolPathTextBox.Text
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            diffToolPathTextBox.Text = dialog.FileName;
        }
    }

    private void OkButton_Click(object? sender, EventArgs e)
    {
        _settings.ExternalDiffToolPath = string.IsNullOrWhiteSpace(diffToolPathTextBox.Text)
            ? null
            : diffToolPathTextBox.Text.Trim();
        _settings.ExternalDiffToolArguments = string.IsNullOrWhiteSpace(diffToolArgumentsTextBox.Text)
            ? "\"{left}\" \"{right}\""
            : diffToolArgumentsTextBox.Text.Trim();
        _settings.Language = languageComboBox.SelectedIndex == 1 ? AppLanguage.English : AppLanguage.Korean;
        _settings.Save();
        Localization.SetLanguage(_settings.Language);
    }
}
