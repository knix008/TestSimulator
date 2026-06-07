using MyUML20WinV10.Controls;
using MyUML20WinV10.Serialization;

namespace MyUML20WinV10;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.ThreadException += (_, e) =>
            UmlErrorDialog.Show(null!, "예기치 않은 오류", e.Exception);

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            var ex = e.ExceptionObject as Exception
                  ?? new Exception(e.ExceptionObject?.ToString() ?? "알 수 없는 오류");
            UmlErrorDialog.Show(null!, "심각한 오류", ex);
        };

        ApplicationConfiguration.Initialize();

        string? initialPath = null;
        foreach (var arg in args)
        {
            if (string.IsNullOrWhiteSpace(arg))
                continue;

            var path = arg.Trim('"');
            if (UmlProjectSerializer.IsProjectFile(path))
            {
                initialPath = Path.GetFullPath(path);
                break;
            }
        }

        Application.Run(new MainForm(initialPath));
    }
}
