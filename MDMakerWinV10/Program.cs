namespace MDMakerWinV10;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var startupFile = args.Length > 0 && File.Exists(args[0]) ? args[0] : null;
        Application.Run(new MainForm(startupFile));
    }
}
