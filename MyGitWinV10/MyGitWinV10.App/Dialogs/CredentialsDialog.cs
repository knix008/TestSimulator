using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public partial class CredentialsDialog : Form
{
    public CredentialsDialog(string? suggestedUsername, string? suggestedPassword = null, bool isGitHub = false)
    {
        InitializeComponent();
        if (!string.IsNullOrWhiteSpace(suggestedUsername))
        {
            usernameTextBox.Text = suggestedUsername;
        }
        if (!string.IsNullOrEmpty(suggestedPassword))
        {
            passwordTextBox.Text = suggestedPassword;
        }

        if (isGitHub)
        {
            passwordLabel.Text = "Personal Access Token (PAT)";
            patHintLabel.Text = "GitHub no longer accepts your account password here — use a PAT\nfrom github.com/settings/tokens (not your login password).";
            patHintLabel.Visible = true;
        }
        else
        {
            passwordLabel.Text = "Password or Personal Access Token";
            patHintLabel.Text = "This host accepts either your account password or a personal\naccess token, depending on how it is configured.";
            patHintLabel.Visible = true;
        }
    }

    public CredentialsDialogResult Result { get; private set; }

    private void OkButton_Click(object? sender, EventArgs e) =>
        Result = new CredentialsDialogResult(usernameTextBox.Text, passwordTextBox.Text);
}
