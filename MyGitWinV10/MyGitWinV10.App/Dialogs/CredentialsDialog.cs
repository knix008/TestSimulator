using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class CredentialsDialog : Form
{
    private readonly bool _isGitHub;

    public CredentialsDialog(string? suggestedUsername, string? suggestedPassword = null, bool isGitHub = false)
    {
        _isGitHub = isGitHub;
        InitializeComponent();
        if (!string.IsNullOrWhiteSpace(suggestedUsername))
        {
            usernameTextBox.Text = suggestedUsername;
        }
        if (!string.IsNullOrEmpty(suggestedPassword))
        {
            passwordTextBox.Text = suggestedPassword;
        }

        ApplyLocalizedText();
        Load += (_, _) => Localization.LanguageChanged += OnLanguageChanged;
        FormClosed += (_, _) => Localization.LanguageChanged -= OnLanguageChanged;
    }

    private void OnLanguageChanged() => ApplyLocalizedText();

    private void ApplyLocalizedText()
    {
        Text = Localization.T("Credentials.Title");
        infoLabel.Text = Localization.T("Credentials.Info");
        usernameLabel.Text = Localization.T("Credentials.Username");
        passwordLabel.Text = _isGitHub
            ? Localization.T("Credentials.Pat")
            : Localization.T("Credentials.Password");
        patHintLabel.Text = _isGitHub
            ? Localization.T("Credentials.PatHintGitHub")
            : Localization.T("Credentials.PatHintGeneric");
        patHintLabel.Visible = true;
        okButton.Text = Localization.T("Common.OK");
        cancelButton.Text = Localization.T("Common.Cancel");
    }

    public CredentialsDialogResult Result { get; private set; }

    private void OkButton_Click(object? sender, EventArgs e) =>
        Result = new CredentialsDialogResult(usernameTextBox.Text, passwordTextBox.Text);
}
