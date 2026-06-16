using MyAgileBoardWinV10.Forms;
using MyAgileBoardWinV10.Utils;
using QuestPDF.Infrastructure;

namespace MyAgileBoardWinV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        QuestPDF.Settings.License = LicenseType.Community;
        ApplicationConfiguration.Initialize();
        ErrorHandler.InstallGlobalHandlers();
        Application.Run(new MyAgileForm());
    }
}