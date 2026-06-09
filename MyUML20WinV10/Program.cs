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

        if (args.Any(a => string.Equals(a, "--generate-templates", StringComparison.OrdinalIgnoreCase)))
        {
            var explicitDir = args.Skip(1).FirstOrDefault(a => !a.StartsWith('-'));
            var directory = explicitDir
                ?? FindSourceTemplatesProjectsDirectory()
                ?? MyUML20WinV10.Templates.UmlDiagramTemplateLibrary.GetTemplatesProjectsDirectory();
            MyUML20WinV10.Templates.UmlDiagramTemplateLibrary.ExportProjectFiles(directory);
            Console.WriteLine($"템플릿 프로젝트를 저장했습니다: {directory}");
            return;
        }

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

    static string? FindSourceTemplatesProjectsDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "MyUML20WinV10.csproj")))
                return Path.Combine(dir.FullName, "Templates", "Projects");

            dir = dir.Parent;
        }

        return null;
    }
}
