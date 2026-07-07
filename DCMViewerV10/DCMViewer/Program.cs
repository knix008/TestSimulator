using FellowOakDicom;
using FellowOakDicom.Imaging;
using FellowOakDicom.Imaging.NativeCodec;

namespace DCMViewer;

static class Program
{
    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main(string[] args)
    {
        if (TryHandleInstallerCommand(args))
            return;

        ApplicationConfiguration.Initialize();

        new DicomSetupBuilder()
            .RegisterServices(s => s
                .AddFellowOakDicom()
                .AddTranscoderManager<NativeTranscoderManager>()
                .AddImageManager<WinFormsImageManager>())
            .Build();

        var startupFile = args.FirstOrDefault(IsStartupFilePath);
        using var mainForm = new MainForm();
        if (startupFile is not null)
            mainForm.OpenFileOnStartup(startupFile);

        Application.Run(mainForm);
    }

    private static bool TryHandleInstallerCommand(string[] args)
    {
        if (!args.Any(arg => arg.Equals("--install-set-dcm-default", StringComparison.OrdinalIgnoreCase)))
            return false;

        ApplicationConfiguration.Initialize();
        FileAssociationHelper.Register();
        FileAssociationHelper.TrySetAsDefault(out _);
        return true;
    }

    private static bool IsStartupFilePath(string arg) =>
        !string.IsNullOrWhiteSpace(arg)
        && !arg.StartsWith('-')
        && File.Exists(arg);
}
