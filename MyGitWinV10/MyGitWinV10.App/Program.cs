using QuestPDF.Infrastructure;

namespace MyGitWinV10.App;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
