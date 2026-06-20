using ReqTrace.Forms;
using ReqTrace.Localization;
using ReqTrace.Theme;

namespace ReqTrace;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

        ApplicationConfiguration.Initialize();
        ModernTheme.InitializeApplication();
        LocalizationService.Initialize(LocalizationService.DefaultLanguage);

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ErrorDialog.Show(null, Loc.T("Msg_UnexpectedError"), e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex)
                ErrorDialog.Show(null, Loc.T("Msg_UnexpectedError"), ex);
        };

        Application.Run(new MainForm(ResolveStartupProjectPath(args)));
    }

    private static string? ResolveStartupProjectPath(string[] args)
    {
        foreach (var arg in args)
        {
            if (string.IsNullOrWhiteSpace(arg) || arg.StartsWith('-'))
                continue;

            var path = Path.GetFullPath(arg.Trim('"'));
            if (!Path.GetExtension(path).Equals(".reqtproj", StringComparison.OrdinalIgnoreCase))
                continue;

            if (File.Exists(path))
                return path;
        }

        return null;
    }
}
