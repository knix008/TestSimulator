using System.Diagnostics;
using MyProject.Forms;
using MyProject.Models;
using MyProject.Theme;

namespace MyProject;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
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

        AppShutdown.Initialize(Debugger.IsAttached);

        ApplicationConfiguration.Initialize();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        AppShutdown.RegisterExceptionHandlers();

        AppSettings.Load();
        Application.Run(new MainForm());
    }
}
