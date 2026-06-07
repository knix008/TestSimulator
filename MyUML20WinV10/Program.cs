using MyUML20WinV10.Serialization;

namespace MyUML20WinV10;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
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
