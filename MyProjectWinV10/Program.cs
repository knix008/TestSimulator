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

        ApplicationConfiguration.Initialize();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ApplicationExit += (_, _) => ExceptionHandler.NotifyShutdown();
        ExceptionHandler.Register();

        try
        {
            AppSettings.Load();
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            ExceptionHandler.Show(null, "Startup Error", "Could not start the application.", ex);
        }
    }
}