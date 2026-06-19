using System.Reflection;

namespace MyGitWinV10.App.Dialogs;

public partial class AboutDialog : Form
{
    public AboutDialog()
    {
        InitializeComponent();
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        versionLabel.Text = $"Version {version?.ToString(3) ?? "1.0.0"}";
    }
}
