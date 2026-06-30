using Microsoft.Web.WebView2.Core;

namespace MyWorkspace.Win;

internal static class WebView2EnvironmentProvider
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static CoreWebView2Environment? _sharedEnvironment;

    public static string UserDataFolder { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyWorkspaceWinV10",
        "WebView2");

    public static async Task<CoreWebView2Environment> GetSharedEnvironmentAsync()
    {
        if (_sharedEnvironment != null)
            return _sharedEnvironment;

        await Gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_sharedEnvironment != null)
                return _sharedEnvironment;

            Directory.CreateDirectory(UserDataFolder);
            _sharedEnvironment = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: UserDataFolder).ConfigureAwait(false);
            return _sharedEnvironment;
        }
        finally
        {
            Gate.Release();
        }
    }
}
