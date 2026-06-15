using MyAgileBoardWinV10.Forms;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        ErrorHandler.InstallGlobalHandlers();
        Application.Run(new MyAgileForm());
    }
}