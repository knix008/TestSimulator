using LibGit2Sharp;
using MyGitWinV10.App.Dialogs;

namespace MyGitWinV10.App.Services;

public sealed class CredentialsPrompt
{
    private readonly Control _owner;
    private readonly string? _initialUsername;
    private readonly string? _initialPassword;
    private CredentialsDialogResult? _cached;

    public CredentialsPrompt(Control owner, string? initialUsername = null, string? initialPassword = null)
    {
        _owner = owner;
        _initialUsername = initialUsername;
        _initialPassword = initialPassword;
    }

    public CredentialsDialogResult? LastEntered => _cached;

    public Credentials Handler(string url, string? usernameFromUrl, SupportedCredentialTypes types)
    {
        if (_cached is null)
        {
            // A remembered username+PAT means this remote already authenticated successfully
            // before — reuse it silently instead of asking again. We only fall back to the
            // dialog once those credentials are missing or get cleared after a failed attempt.
            if (!string.IsNullOrWhiteSpace(_initialUsername) && !string.IsNullOrWhiteSpace(_initialPassword))
            {
                _cached = new CredentialsDialogResult(_initialUsername, _initialPassword);
                return ToCredentials(_cached.Value);
            }

            DialogResult dialogResult = DialogResult.Cancel;
            CredentialsDialogResult result = default;
            var isGitHub = Uri.TryCreate(url, UriKind.Absolute, out var parsedUri)
                && parsedUri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase);
            _owner.Invoke(() =>
            {
                using var dialog = new CredentialsDialog(usernameFromUrl ?? _initialUsername, _initialPassword, isGitHub);
                dialogResult = dialog.ShowDialog(_owner.FindForm());
                result = dialog.Result;
            });
            if (dialogResult != DialogResult.OK)
            {
                throw new OperationCanceledException("Git credentials input was cancelled.");
            }
            _cached = result;
        }

        return ToCredentials(_cached.Value);
    }

    private static Credentials ToCredentials(CredentialsDialogResult result) =>
        new UsernamePasswordCredentials
        {
            Username = result.Username,
            Password = result.Password
        };
}
