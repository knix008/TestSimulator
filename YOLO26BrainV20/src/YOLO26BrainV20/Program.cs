namespace YOLO26BrainV20;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        if (args.Any(static a =>
                string.Equals(a, "--help", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "-h", StringComparison.OrdinalIgnoreCase)))
        {
            CliRunner.PrintHelp();
            return 0;
        }

        if (CliRunner.WantsConsoleMode(args))
        {
            if (args.Any(a => string.Equals(a, "--help", StringComparison.OrdinalIgnoreCase) ||
                              string.Equals(a, "-h", StringComparison.OrdinalIgnoreCase)))
            {
                CliRunner.PrintHelp();
                return 0;
            }

            return CliRunner.Run(args);
        }

        Application.Run(new BrainCtMainForm());
        return 0;
    }
}
