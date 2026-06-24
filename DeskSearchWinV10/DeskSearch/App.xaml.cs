using System.Windows;
using DeskSearch.Services;

namespace DeskSearch;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        var settings = new SettingsService();
        LocalizationService.Apply(settings.Current.Language);
        base.OnStartup(e);
    }
}
