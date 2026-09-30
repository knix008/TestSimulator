using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using Palisades.Interop;
using Palisades.Models;
using Palisades.Services;
using Palisades.Views;

namespace Palisades;

public partial class App : Application
{
    private static App? _instance;

    private Mutex? _singleInstance;
    private WorkspaceStore? _store;
    private FenceManager? _manager;
    private TrayIcon? _tray;
    private SettingsWindow? _settings;

    public static void OpenSettings() => _instance?.ShowSettings();

    public static void Quit() => _instance?.QuitPalisades();

    /// <summary>
    /// Fence windows refuse to close on their own, so tear them down before asking WPF to shut down.
    /// </summary>
    private void QuitPalisades()
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

        _singleInstance = new Mutex(true, @"Local\Palisades.SingleInstance", out var firstInstance);
        if (!firstInstance)
        {
            Shutdown();
            return;
        }

        _store = new WorkspaceStore();
        _manager = new FenceManager(_store);
        _manager.Start();

        _tray = new TrayIcon("Palisades — desktop fences", BuildTrayMenu());
        _tray.DoubleClicked += ShowSettings;

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

        var newFence = new MenuItem { Header = Strings.T("New fence") };
        newFence.Click += (_, _) => _manager?.CreateFenceAtCursor();

        var newPortal = new MenuItem { Header = Strings.T("New folder portal…") };
        newPortal.Click += (_, _) => CreatePortal();

        var hideAll = new MenuItem { Header = Strings.T("Hide all fences"), IsCheckable = true };
        hideAll.Click += (_, _) => _manager?.ToggleQuickHide();

        var locked = new MenuItem { Header = Strings.T("Lock fences"), IsCheckable = true };
        locked.Click += (_, _) => Toggle(settings => settings.FencesLocked = !settings.FencesLocked);

        var bareDesktop = new MenuItem { Header = Strings.T("Palisades draws the desktop"), IsCheckable = true };
        bareDesktop.Click += (_, _) => Toggle(settings => settings.DrawDesktop = !settings.DrawDesktop);

        var login = new MenuItem { Header = Strings.T("Start with Windows"), IsCheckable = true };
        login.Click += (_, _) => Toggle(settings => settings.LaunchAtLogin = !settings.LaunchAtLogin);

        var lasso = new MenuItem { Header = Strings.T("Right-drag desktop makes a fence"), IsCheckable = true };
        lasso.Click += (_, _) => Toggle(settings => settings.CreateFenceWithRightDrag = !settings.CreateFenceWithRightDrag);

        var quickHide = new MenuItem { Header = Strings.T("Double-click desktop hides fences"), IsCheckable = true };
        quickHide.Click += (_, _) => Toggle(settings => settings.QuickHideOnDesktopDoubleClick = !settings.QuickHideOnDesktopDoubleClick);

        var language = new MenuItem { Header = Strings.T("Language") };
        var follow = new MenuItem { Header = Strings.T("Follow Windows"), IsCheckable = true };
        follow.Click += (_, _) => Toggle(settings => settings.Language = UiLanguage.System);
        var english = new MenuItem { Header = Strings.T("English"), IsCheckable = true };
        english.Click += (_, _) => Toggle(settings => settings.Language = UiLanguage.English);
        var korean = new MenuItem { Header = Strings.T("Korean"), IsCheckable = true };
        korean.Click += (_, _) => Toggle(settings => settings.Language = UiLanguage.Korean);
        language.Items.Add(follow);
        language.Items.Add(english);
        language.Items.Add(korean);

        var settingsItem = new MenuItem { Header = Strings.T("Settings…") };
        settingsItem.Click += (_, _) => ShowSettings();

        var exit = new MenuItem { Header = Strings.T("Exit Palisades") };
        exit.Click += (_, _) => QuitPalisades();

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
            bareDesktop.Header = Strings.T("Palisades draws the desktop");
            login.Header = Strings.T("Start with Windows");
            lasso.Header = Strings.T("Right-drag desktop makes a fence");
            quickHide.Header = Strings.T("Double-click desktop hides fences");
            language.Header = Strings.T("Language");
            follow.Header = Strings.T("Follow Windows");
            english.Header = Strings.T("English");
            korean.Header = Strings.T("Korean");
            settingsItem.Header = Strings.T("Settings…");
            exit.Header = Strings.T("Exit Palisades");

            follow.IsChecked = settings.Language == UiLanguage.System;
            english.IsChecked = settings.Language == UiLanguage.English;
            korean.IsChecked = settings.Language == UiLanguage.Korean;

            hideAll.IsChecked = settings.AllHidden;
            locked.IsChecked = settings.FencesLocked;
            bareDesktop.IsChecked = settings.DrawDesktop;
            login.IsChecked = settings.LaunchAtLogin;
            lasso.IsChecked = settings.CreateFenceWithRightDrag;
            quickHide.IsChecked = settings.QuickHideOnDesktopDoubleClick;
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
