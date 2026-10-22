namespace DeskSearch.Setup;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);

        using var dialog = new LanguageSelectionForm();
        if (dialog.ShowDialog() != DialogResult.OK)
            return 0;

        try
        {
            return InstallerLauncher.Run(dialog.SelectedLanguage);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"DeskSearch setup failed.\n설치에 실패했습니다.\n\n{ex.Message}",
                "DeskSearch Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }
}
