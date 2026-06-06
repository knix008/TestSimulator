using MyDiagramWinV10.App;
using MyDiagramWinV10.Serialization;

namespace MyDiagramWinV10;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var initialProject = ResolveInitialProjectPath(args);
        if (!SingleInstanceMessenger.TryStartOrForward(initialProject))
            return;

        Application.ApplicationExit += (_, _) => SingleInstanceMessenger.Release();
        Application.Run(new MainForm(initialProject));
    }

    internal static string? ResolveInitialProjectPath(string[] args)
    {
        foreach (var arg in args)
        {
            if (string.IsNullOrWhiteSpace(arg))
                continue;

            var path = arg.Trim('"');
            if (!IsProjectFile(path))
                continue;

            return Path.GetFullPath(path);
        }

        return null;
    }

    internal static bool IsProjectFile(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return false;

        return path.EndsWith(DiagramProjectSerializer.FileExtension, StringComparison.OrdinalIgnoreCase)
            && File.Exists(path);
    }
}
