using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using MyDesktop.Interop;
using MyDesktop.Models;
using MyDesktop.Services;
using MyDesktop.Views;

namespace MyDesktop;

public partial class App : Application
{
    private static App? _instance;

    private Mutex? _singleInstance;
    private WorkspaceStore? _store;
    private FenceManager? _manager;
    private TrayIcon? _tray;
    private SettingsWindow? _settings;

    public static void OpenSettings() => _instance?.ShowSettings();

    public static void Quit() => _instance?.QuitMyDesktop();

    /// <summary>
    /// Fence windows refuse to close on their own, so tear them down before asking WPF to shut down.
    /// </summary>
    private void QuitMyDesktop()
    {
        _settings?.Close();
        _manager?.Dispose();
        _manager = null;
        Shutdown();
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _instance = this;

        _singleInstance = new Mutex(true, @"Local\MyDesktop.SingleInstance", out var firstInstance);
        if (!firstInstance)
        {
            Shutdown();
            return;
        }

        _store = new WorkspaceStore();
        _manager = new FenceManager(_store);
        _manager.Start();

        _tray = new TrayIcon("MyDesktop — desktop fences", BuildTrayMenu());
        _tray.DoubleClicked += ShowSettings;
        _tray.Visible = _manager.Settings.ShowTrayIcon;
        _manager.Settings.PropertyChanged += (_, changed) =>
        {
            if (changed.PropertyName == nameof(AppSettings.ShowTrayIcon) && _manager is not null)
            {
                _tray.Visible = _manager.Settings.ShowTrayIcon;
            }
        };

        // Never leave the user staring at a desktop with no icons because something went wrong.
        AppDomain.CurrentDomain.ProcessExit += (_, _) => DesktopIcons.Restore();
        SystemEvents.SessionEnding += (_, _) => DesktopIcons.Restore();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        _manager?.Dispose();
        _store?.Flush();
        _singleInstance?.Dispose();
        base.OnExit(e);
    }

    private void ShowSettings()
    {
        if (_manager is null)
        {
            return;
        }

        if (_settings is null)
        {
            _settings = new SettingsWindow(_manager);
            _settings.Closed += (_, _) => _settings = null;
            _settings.Show();
        }
        else
        {
            _settings.Activate();
        }
    }

    private ContextMenu BuildTrayMenu()
    {
        var menu = new ContextMenu();

        // The switches here carry their state as their icon rather than as WPF's own tick, which is
        // drawn in the very same column: with a tick there they would be the only entries in
        // MyDesktop without an icon. MenuArt.SetState repoints them each time the menu opens.
        var newFence = MenuArt.Command(Strings.T("New fence"), MenuArt.NewFence, () => _manager?.CreateFenceAtCursor());
        var newPortal = MenuArt.Command(Strings.T("New folder portal…"), MenuArt.NewPortal, CreatePortal);
        var hideAll = MenuArt.Check(Strings.T("Hide all fences"), false, () => _manager?.ToggleQuickHide());

        var locked = MenuArt.Check(Strings.T("Lock fences"), false, MenuArt.Locked, MenuArt.Unlocked,
            () => Toggle(settings => settings.FencesLocked = !settings.FencesLocked));

        var bareDesktop = MenuArt.Check(Strings.T("MyDesktop draws the desktop"), false,
            () => Toggle(settings => settings.DrawDesktop = !settings.DrawDesktop));

        var login = MenuArt.Check(Strings.T("Start with Windows"), false,
            () => Toggle(settings => settings.LaunchAtLogin = !settings.LaunchAtLogin));

        var lasso = MenuArt.Check(Strings.T("Right-drag desktop makes a fence"), false,
            () => Toggle(settings => settings.CreateFenceWithRightDrag = !settings.CreateFenceWithRightDrag));

        var quickHide = MenuArt.Check(Strings.T("Double-click desktop hides fences"), false,
            () => Toggle(settings => settings.QuickHideOnDesktopDoubleClick = !settings.QuickHideOnDesktopDoubleClick));

        var language = MenuArt.Submenu(Strings.T("Language"), MenuArt.Language);
        var follow = MenuArt.Check(Strings.T("Follow Windows"), false,
            () => Toggle(settings => settings.Language = UiLanguage.System));
        var english = MenuArt.Check(Strings.T("English"), false,
            () => Toggle(settings => settings.Language = UiLanguage.English));
        var korean = MenuArt.Check(Strings.T("Korean"), false,
            () => Toggle(settings => settings.Language = UiLanguage.Korean));
        language.Items.Add(follow);
        language.Items.Add(english);
        language.Items.Add(korean);

        var settingsItem = MenuArt.Command(Strings.T("Settings…"), MenuArt.Settings, ShowSettings);
        var exit = MenuArt.Command(Strings.T("Exit MyDesktop"), MenuArt.Exit, QuitMyDesktop);

        menu.Items.Add(newFence);
        menu.Items.Add(newPortal);
        menu.Items.Add(new Separator());
        menu.Items.Add(hideAll);
        menu.Items.Add(locked);
        menu.Items.Add(bareDesktop);
        menu.Items.Add(new Separator());
        menu.Items.Add(login);
        menu.Items.Add(lasso);
        menu.Items.Add(quickHide);
        menu.Items.Add(language);
        menu.Items.Add(new Separator());
        menu.Items.Add(settingsItem);
        menu.Items.Add(exit);

        menu.Opened += (_, _) =>
        {
            if (_manager is null)
            {
                return;
            }

            var settings = _manager.Settings;

            // Headers are refreshed here so a language change shows up without restarting.
            newFence.Header = Strings.T("New fence");
            newPortal.Header = Strings.T("New folder portal…");
            hideAll.Header = Strings.T("Hide all fences");
            locked.Header = Strings.T("Lock fences");
            bareDesktop.Header = Strings.T("MyDesktop draws the desktop");
            login.Header = Strings.T("Start with Windows");
            lasso.Header = Strings.T("Right-drag desktop makes a fence");
            quickHide.Header = Strings.T("Double-click desktop hides fences");
            language.Header = Strings.T("Language");
            follow.Header = Strings.T("Follow Windows");
            english.Header = Strings.T("English");
            korean.Header = Strings.T("Korean");
            settingsItem.Header = Strings.T("Settings…");
            exit.Header = Strings.T("Exit MyDesktop");

            MenuArt.SetState(follow, settings.Language == UiLanguage.System);
            MenuArt.SetState(english, settings.Language == UiLanguage.English);
            MenuArt.SetState(korean, settings.Language == UiLanguage.Korean);

            MenuArt.SetState(hideAll, settings.AllHidden);
            MenuArt.SetState(locked, settings.FencesLocked, MenuArt.Locked, MenuArt.Unlocked);
            MenuArt.SetState(bareDesktop, settings.DrawDesktop);
            MenuArt.SetState(login, settings.LaunchAtLogin);
            MenuArt.SetState(lasso, settings.CreateFenceWithRightDrag);
            MenuArt.SetState(quickHide, settings.QuickHideOnDesktopDoubleClick);
        };

        return menu;
    }

    private void Toggle(Action<AppSettings> change)
    {
        if (_manager is not null)
        {
            change(_manager.Settings);
        }
    }

    private void CreatePortal()
    {
        if (_manager is null)
        {
            return;
        }

        var dialog = new OpenFolderDialog { Title = "Choose a folder to show as a fence" };
        if (dialog.ShowDialog() == true)
        {
            _manager.CreatePortal(dialog.FolderName);
        }
    }
}
