using System.Text;
using MyProject.Forms;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        if (args.Contains("--generate-template"))
        {
            var templateDir = Path.Combine(Directory.GetCurrentDirectory(), "Template");
            Directory.CreateDirectory(templateDir);
            var templatePath = Path.Combine(templateDir, "Template Project.myprj");
            ProjectFile.Save(ProjectModel.CreateTemplate(), templatePath);
            return;
        }

        if (args.Contains("--generate-icon"))
        {
            var iconPath = Path.Combine(Directory.GetCurrentDirectory(), "Assets", AppIconFactory.IconFileName);
            AppIconFactory.SaveIconFile(iconPath);
            return;
        }

        if (args.Contains("--purge-settings"))
        {
            AppSettings.PurgeUserData();
            return;
        }

        AppSettings.Load();
        AppLocalizer.Apply(AppSettings.UiLanguage);

        ApplicationConfiguration.Initialize();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ApplicationExit += (_, _) => ApplicationShutdown.RequestProcessExit();
        Application.Run(new MainForm());
        ApplicationShutdown.RequestProcessExit();
    }
}
