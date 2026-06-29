using System.Diagnostics;

using System.Windows;

using System.Windows.Controls;
using System.Windows.Controls.Primitives;

using System.Windows.Input;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;

using System.Windows.Media;

using DeskSearch.Helpers;

using DeskSearch.Models;

using DeskSearch.Services;



namespace DeskSearch;



public partial class MainWindow : Window

{

    private readonly SystemIndexService _indexService = new();

    private readonly SystemWatcherService _watcherService;

    private readonly DebounceDispatcher _debounce;

    private FileEntry? _contextFileEntry;



    private ContextMenu _mainContextMenu = null!;

    private ContextMenu _resultItemContextMenu = null!;

    private MenuItem _menuAlwaysOnTop = null!;

    private MenuItem _menuIndexStatus = null!;

    private MenuItem _menuOpenFile = null!;

    private MenuItem _menuShowInFolder = null!;

    private MenuItem _menuCopyPath = null!;

    private MenuItem _menuCopyFileName = null!;



    public MainWindow(SettingsService settingsService)

    {

        _settingsService = settingsService;

        InitializeComponent();

        SetupContextMenus();

        ApplySettings(_settingsService.Current);

        InitializeLocalization();

        _watcherService = new SystemWatcherService(_indexService);

        _debounce = new DebounceDispatcher(Dispatcher, delayMs: 100);

        _indexService.ConfigureExclusions(_settingsService.Current);

        _indexService.SearchEnabled += OnSearchEnabled;

        _indexService.IndexProgress += OnIndexProgress;

        _indexService.IndexProgress += OnRescanIndexProgress;

        _indexService.FullIndexRebuildStarted += (_, _) =>
            SafeBeginInvoke(() =>
            {
                if (!_indexService.HasStableSearchIndex)
                    InvalidateSearchForIndexRebuild();
            });

        _indexService.IndexUpdated += (_, _) =>
            SafeBeginInvoke(ScheduleLiveSearchRefresh, System.Windows.Threading.DispatcherPriority.Background);

        UpdateIndexUi();

        InitializeTrayIcon();

        WindowTaskbarHelper.ExcludeFromTaskbar(this);

    }



    protected override void OnSourceInitialized(EventArgs e)

    {

        base.OnSourceInitialized(e);

        WindowTaskbarHelper.ApplyExStyle(this);

    }



    private void Window_Loaded(object sender, RoutedEventArgs e)

    {

        if (System.Windows.Application.Current is App app)
            app.RegisterShowWindowCallback(ShowFromTray);

        RegisterSessionEndingHandler();
        RestoreWindowLayout();

        _watcherService.Start();

        if (_indexService.NeedsFtsMigration)
            PromptAndRunFtsMigration();
        else
            _indexService.StartBackgroundScan();

    }

    private void PromptAndRunFtsMigration()
    {
        var confirm = new MigrationConfirmDialog { Owner = this };
        if (confirm.ShowDialog() != true)
        {
            _indexService.StartBackgroundScan();
            return;
        }

        var dialog = new MigrationProgressDialog { Owner = this };
        dialog.Show();

        Task.Run(() =>
        {
            try
            {
                _indexService.RunFtsMigration(percent =>
                    SafeBeginInvoke(() => dialog.ReportProgress(percent)));
            }
            catch (Exception ex)
            {
                SafeBeginInvoke(() => ErrorDialogService.Show(LocalizationService.T("Error_IndexScan"), ex));
            }
            finally
            {
                SafeBeginInvoke(() =>
                {
                    dialog.Close();
                    _indexService.StartBackgroundScan();
                });
            }
        });
    }


    private void OnSearchEnabled(object? sender, EventArgs e)
    {
        SafeBeginInvoke(() =>
        {
            SearchBox.IsEnabled = true;
            UpdateIndexUi();
            if (IsAnyContextMenuOpen())
                return;

            SearchBox.Focus();
        });
    }

    private bool IsAnyContextMenuOpen() =>
        _mainContextMenu.IsOpen || _resultItemContextMenu.IsOpen;

    private DebounceDispatcher? _indexUiDebounce;

    private DebounceDispatcher IndexUiDebounce =>
        _indexUiDebounce ??= new DebounceDispatcher(Dispatcher, IndexResourcePolicy.IndexUiUpdateDebounceMs);

    private void OnIndexProgress(object? sender, IndexProgressEventArgs e)
    {
        var scanComplete = e.IsScanComplete;
        IndexUiDebounce.Debounce(() =>
        {
            if (!IsLoaded)
                return;

            UpdateIndexUi();
            _openSettingsWindow?.RefreshProgressUi();

            if (scanComplete)
                ScheduleLiveSearchRefresh();
        });
    }

    private void SafeBeginInvoke(Action action, System.Windows.Threading.DispatcherPriority priority = System.Windows.Threading.DispatcherPriority.Normal)
    {
        try
        {
            Dispatcher.BeginInvoke(priority, () =>
            {
                try
                {
                    action();
                }
                catch (Exception ex)
                {
                    ErrorDialogService.Show(LocalizationService.T("Error_Unhandled"), ex);
                }
            });
        }
        catch
        {
            // 앱 종료 중
        }
    }



    private void UpdateIndexUi()

    {

        var isComplete = _indexService.IsScanComplete;
        var count = isComplete || _indexService.HasStableSearchIndex
            ? _indexService.Count
            : _indexService.ScanIndexedCount;
        var phase = _indexService.ProgressPhase;
        var status = isComplete || _indexService.HasStableSearchIndex
            ? LocalizationService.F("Index_Complete", count)
            : phase switch
            {
                IndexProgressPhase.Analyzing => LocalizationService.F("Index_Analyzing", count),
                IndexProgressPhase.Applying => LocalizationService.F("Index_Applying", count),
                _ => LocalizationService.F("Index_InProgress", count)
            };

        _menuIndexStatus.Header = status;

        SearchBox.IsEnabled = _indexService.IsSearchEnabled;

    }



    private void SetupContextMenus()

    {

        _menuAlwaysOnTop = new MenuItem
        {
            Header = LocalizationService.T("Menu_AboveOthers"),
            IsCheckable = true,
            IsChecked = true,
            Icon = MenuGlyphIcons.CreateWpfIcon(MenuGlyphIcons.AlwaysOnTop)
        };
        _menuAlwaysOnTop.Click += MenuAlwaysOnTop_Click;

        _menuIndexStatus = new MenuItem
        {
            Header = LocalizationService.T("Index_Indexing"),
            IsEnabled = false,
            Icon = MenuGlyphIcons.CreateWpfIcon(MenuGlyphIcons.IndexStatus)
        };

        _menuClearSearch = CreateLocalizedMenuItem("Menu_ClearSearch", MenuGlyphIcons.ClearSearch, MenuClearSearch_Click);
        _menuRefreshIndex = CreateLocalizedMenuItem("Menu_RefreshIndex", MenuGlyphIcons.RefreshIndex, MenuRefreshIndex_Click);
        _menuOpenDesktop = CreateLocalizedMenuItem("Menu_OpenDesktop", MenuGlyphIcons.OpenDesktop, MenuOpenDesktop_Click);
        _menuResetPosition = CreateLocalizedMenuItem("Menu_ResetPosition", MenuGlyphIcons.ResetPosition, MenuResetPosition_Click);
        _menuSettings = CreateLocalizedMenuItem("Menu_Settings", MenuGlyphIcons.Settings, MenuSettings_Click);
        _menuHide = CreateLocalizedMenuItem("Menu_Hide", MenuGlyphIcons.Hide, MenuHide_Click);
        _menuExit = CreateLocalizedMenuItem("Menu_Exit", MenuGlyphIcons.Exit, MenuExit_Click);

        _mainContextMenu = new ContextMenu
        {
            Items =
            {
                _menuClearSearch,
                new Separator(),
                _menuRefreshIndex,
                _menuOpenDesktop,
                new Separator(),
                _menuResetPosition,
                _menuAlwaysOnTop,
                new Separator(),
                _menuSettings,
                new Separator(),
                _menuHide,
                new Separator(),
                _menuIndexStatus,
                new Separator(),
                _menuExit
            }
        };

        _mainContextMenu.Opened += MainContextMenu_Opened;



        _menuOpenFile = CreateLocalizedMenuItem("Menu_Open", MenuGlyphIcons.Open, MenuOpenFile_Click);
        _menuShowInFolder = CreateLocalizedMenuItem("Menu_ShowInFolder", MenuGlyphIcons.ShowInFolder, MenuShowInFolder_Click);
        _menuCopyPath = CreateLocalizedMenuItem("Menu_CopyPath", MenuGlyphIcons.CopyPath, MenuCopyPath_Click);
        _menuCopyFileName = CreateLocalizedMenuItem("Menu_CopyFileName", MenuGlyphIcons.CopyFileName, MenuCopyFileName_Click);

        _resultItemContextMenu = new ContextMenu
        {
            Items =
            {
                _menuOpenFile,
                _menuShowInFolder,
                new Separator(),
                _menuCopyPath,
                _menuCopyFileName,
                new Separator(),
                CreateLocalizedMenuItem("Menu_ClearSearch", MenuGlyphIcons.ClearSearch, MenuClearSearch_Click),
                CreateLocalizedMenuItem("Menu_RefreshIndex", MenuGlyphIcons.RefreshIndex, MenuRefreshIndex_Click),
                CreateLocalizedMenuItem("Menu_Settings", MenuGlyphIcons.Settings, MenuSettings_Click),
                CreateLocalizedMenuItem("Menu_Hide", MenuGlyphIcons.Hide, MenuHide_Click),
                CreateLocalizedMenuItem("Menu_ResetPosition", MenuGlyphIcons.ResetPosition, MenuResetPosition_Click),
                new Separator(),
                CreateLocalizedMenuItem("Menu_Exit", MenuGlyphIcons.Exit, MenuExit_Click)
            }
        };



        RootBorder.ContextMenu = _mainContextMenu;

        SearchBox.ContextMenu = _mainContextMenu;

    }



    private void MainContextMenu_Opened(object? sender, RoutedEventArgs e)
    {
        _menuAlwaysOnTop.IsChecked = Topmost;
    }

    private void PrepareResultItemContextMenu()
    {
        var entry = _contextFileEntry;
        var hasFile = entry is not null;

        _menuOpenFile.IsEnabled = hasFile;
        _menuShowInFolder.IsEnabled = hasFile;
        _menuCopyPath.IsEnabled = hasFile;
        _menuCopyFileName.IsEnabled = hasFile;

        _menuOpenFile.Header = hasFile
            ? LocalizationService.F("Menu_OpenFormat", entry!.FileName)
            : LocalizationService.T("Menu_Open");
    }



    private void MenuClearSearch_Click(object sender, RoutedEventArgs e)

    {

        SearchBox.Clear();

        HideSearchResults();

        SearchBox.Focus();

    }



    private void MenuRefreshIndex_Click(object sender, RoutedEventArgs e)
    {
        RequestStartIndexingFromSettings();
    }



    private void MenuOpenDesktop_Click(object sender, RoutedEventArgs e)

    {

        var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

        OpenPath(desktopPath);

    }



    private void MenuResetPosition_Click(object sender, RoutedEventArgs e)

    {

        ResetWindowPosition();

    }



    private void MenuAlwaysOnTop_Click(object sender, RoutedEventArgs e)

    {

        Topmost = _menuAlwaysOnTop.IsChecked;

        SaveAlwaysOnTopSetting();

    }



    private void MenuHide_Click(object sender, RoutedEventArgs e)
    {
        HideToTray();
    }

    private void MenuExit_Click(object sender, RoutedEventArgs e)

    {

        RequestApplicationExit();

    }



    private void MenuOpenFile_Click(object sender, RoutedEventArgs e)

    {

        if (_contextFileEntry is not null)
            OpenEntryDefault(_contextFileEntry);

    }



    private void MenuShowInFolder_Click(object sender, RoutedEventArgs e)

    {

        if (_contextFileEntry is not null)

            ShowInFolder(_contextFileEntry.FullPath);

    }



    private void MenuCopyPath_Click(object sender, RoutedEventArgs e)

    {

        if (_contextFileEntry is not null)

            System.Windows.Clipboard.SetText(_contextFileEntry.FullPath);

    }



    private void MenuCopyFileName_Click(object sender, RoutedEventArgs e)

    {

        if (_contextFileEntry is not null)

            System.Windows.Clipboard.SetText(_contextFileEntry.FileName);

    }



    private void DragHandle_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)

    {

        StartDrag(e);

    }



    private void SearchBox_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (SearchBox.IsKeyboardFocusWithin)
            return;

        SearchBox.Focus();
        e.Handled = true;
    }



    private void RootBorder_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)

    {

        if (ShouldStartDrag(e.OriginalSource as DependencyObject))

            StartDrag(e);

    }



    private static bool ShouldStartDrag(DependencyObject? source)

    {

        while (source is not null)

        {

            switch (source)

            {

                case ListBoxItem:

                case System.Windows.Controls.ListBox:

                case ScrollViewer:

                case System.Windows.Controls.Primitives.ScrollBar:

                case Thumb:

                case RepeatButton:

                case System.Windows.Controls.TextBox:
                case System.Windows.Controls.Button:

                    return false;

                case Border { Name: "DragHandle" }:
                case Border { Name: "LeftResizeGrip" }:
                case Border { Name: "RightResizeGrip" }:
                    return false;

            }



            source = VisualTreeHelper.GetParent(source);

        }



        return true;

    }



    private void StartDrag(MouseButtonEventArgs e)

    {

        if (e.ClickCount != 1 || e.LeftButton != MouseButtonState.Pressed)

            return;



        try

        {

            DragMove();

        }

        catch (InvalidOperationException)

        {

            // DragMove는 마우스 버튼이 이미 떼어진 경우 예외를 던질 수 있음

        }



        e.Handled = true;

    }



    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        _debounce.Debounce(PerformSearch);
    }

    private void SearchBox_KeyDown(object sender, KeyEventArgs e)

    {

        switch (e.Key)

        {

            case Key.Escape:

                SearchBox.Clear();

                HideSearchResults();

                break;



            case Key.Down when _resultsWindow is { IsVisible: true } && _resultsWindow.ResultCount > 0:

                _resultsWindow.FocusResults();

                e.Handled = true;

                break;



            case Key.Enter when _resultsWindow?.GetSelectedEntry() is FileEntry entry:
                OpenEntry(entry);
                e.Handled = true;
                break;

        }

    }



    private static void OpenEntry(FileEntry entry)
    {
        if (entry.IsDirectory)
            OpenPath(entry.FullPath);
        else
            ShowInFolder(entry.FullPath);
    }

    private static void OpenEntryDefault(FileEntry entry)
    {
        if (entry.IsDirectory)
            OpenPath(entry.FullPath);
        else
            OpenFile(entry.FullPath);
    }

    private static void OpenFile(string fullPath)

    {

        Process.Start(new ProcessStartInfo(fullPath) { UseShellExecute = true });

    }



    private static void OpenPath(string path)

    {

        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });

    }



    private static void ShowInFolder(string fullPath)

    {

        Process.Start(new ProcessStartInfo

        {

            FileName = "explorer.exe",

            Arguments = $"/select,\"{fullPath}\"",

            UseShellExecute = true

        });

    }

}


