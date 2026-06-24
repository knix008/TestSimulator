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



    public MainWindow()

    {

        InitializeComponent();

        SetupContextMenus();

        ApplySettings(_settingsService.Current);

        InitializeLocalization();

        _watcherService = new SystemWatcherService(_indexService);

        _debounce = new DebounceDispatcher(Dispatcher, delayMs: 100);

        _indexService.SearchEnabled += OnSearchEnabled;

        _indexService.IndexProgress += OnIndexProgress;

        _indexService.IndexUpdated += (_, _) => Dispatcher.Invoke(RefreshSearchIfNeeded);

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

        RestoreWindowLayout();

        SearchBox.ToolTip = LocalizationService.T("Index_Starting");

        _watcherService.Start();

        _indexService.StartBackgroundScan();

    }


    private void OnSearchEnabled(object? sender, EventArgs e)

    {

        Dispatcher.Invoke(() =>

        {

            SearchBox.IsEnabled = true;

            UpdateIndexUi();

            SearchBox.Focus();

        });

    }



    private void OnIndexProgress(object? sender, IndexProgressEventArgs e)

    {

        Dispatcher.Invoke(UpdateIndexUi);

    }



    private void UpdateIndexUi()

    {

        var count = _indexService.Count;
        var status = _indexService.IsScanComplete
            ? LocalizationService.F("Index_Complete", count)
            : LocalizationService.F("Index_InProgress", count);



        SearchBox.ToolTip = status;

        _menuIndexStatus.Header = status;

    }



    private void SetupContextMenus()

    {

        _menuAlwaysOnTop = new MenuItem
        {
            Header = LocalizationService.T("Menu_AboveOthers"),
            IsCheckable = true,
            IsChecked = true
        };
        _menuAlwaysOnTop.Click += MenuAlwaysOnTop_Click;

        _menuIndexStatus = new MenuItem
        {
            Header = LocalizationService.T("Index_Indexing"),
            IsEnabled = false
        };

        _menuClearSearch = CreateLocalizedMenuItem("Menu_ClearSearch", MenuClearSearch_Click);
        _menuRefreshIndex = CreateLocalizedMenuItem("Menu_RefreshIndex", MenuRefreshIndex_Click);
        _menuOpenDesktop = CreateLocalizedMenuItem("Menu_OpenDesktop", MenuOpenDesktop_Click);
        _menuResetPosition = CreateLocalizedMenuItem("Menu_ResetPosition", MenuResetPosition_Click);
        _menuSettings = CreateLocalizedMenuItem("Menu_Settings", MenuSettings_Click);
        _menuHide = CreateLocalizedMenuItem("Menu_Hide", MenuHide_Click);
        _menuExit = CreateLocalizedMenuItem("Menu_Exit", MenuExit_Click);

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



        _menuOpenFile = CreateLocalizedMenuItem("Menu_Open", MenuOpenFile_Click);
        _menuShowInFolder = CreateLocalizedMenuItem("Menu_ShowInFolder", MenuShowInFolder_Click);
        _menuCopyPath = CreateLocalizedMenuItem("Menu_CopyPath", MenuCopyPath_Click);
        _menuCopyFileName = CreateLocalizedMenuItem("Menu_CopyFileName", MenuCopyFileName_Click);

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
                CreateLocalizedMenuItem("Menu_ClearSearch", MenuClearSearch_Click),
                CreateLocalizedMenuItem("Menu_RefreshIndex", MenuRefreshIndex_Click),
                CreateLocalizedMenuItem("Menu_Settings", MenuSettings_Click),
                CreateLocalizedMenuItem("Menu_Hide", MenuHide_Click),
                CreateLocalizedMenuItem("Menu_ResetPosition", MenuResetPosition_Click),
                new Separator(),
                CreateLocalizedMenuItem("Menu_Exit", MenuExit_Click)
            }
        };

        _resultItemContextMenu.Opened += ResultItemContextMenu_Opened;



        RootBorder.ContextMenu = _mainContextMenu;

        SearchBox.ContextMenu = _mainContextMenu;

        ResultsList.ContextMenu = _mainContextMenu;

    }



    private void UpdateIndexStatusMenu() => UpdateIndexUi();



    private void MainContextMenu_Opened(object sender, RoutedEventArgs e)

    {

        _menuAlwaysOnTop.IsChecked = Topmost;

        UpdateIndexUi();

    }



    private void ResultItem_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount != 1)
            return;

        if (sender is ListBoxItem { IsSelected: true, DataContext: FileEntry entry })
            OpenEntry(entry);
    }

    private void ResultItem_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)

    {

        if (sender is not ListBoxItem item)

            return;



        item.IsSelected = true;

        item.Focus();

        _contextFileEntry = item.DataContext as FileEntry;

        item.ContextMenu = _resultItemContextMenu;

    }



    private void ResultItemContextMenu_Opened(object sender, RoutedEventArgs e)
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

        ResultsList.Visibility = Visibility.Collapsed;

        SearchBox.Focus();

    }



    private void MenuRefreshIndex_Click(object sender, RoutedEventArgs e)
    {
        _menuIndexStatus.Header = LocalizationService.T("Index_Indexing");
        UpdateIndexUi();
        _indexService.RestartScan();
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

        if (string.IsNullOrEmpty(SearchBox.Text))

            StartDrag(e);

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

                ResultsList.Visibility = Visibility.Collapsed;

                break;



            case Key.Down when ResultsList.Items.Count > 0:

                ResultsList.Focus();

                ResultsList.SelectedIndex = 0;

                e.Handled = true;

                break;



            case Key.Enter when ResultsList.SelectedItem is FileEntry entry:
                OpenEntry(entry);
                e.Handled = true;
                break;

        }

    }



    private void ResultsList_KeyDown(object sender, KeyEventArgs e)

    {

        switch (e.Key)

        {

            case Key.Enter when ResultsList.SelectedItem is FileEntry entry:
                OpenEntry(entry);
                e.Handled = true;
                break;



            case Key.Escape:

                SearchBox.Focus();

                e.Handled = true;

                break;



            case Key.Up when ResultsList.SelectedIndex == 0:

                SearchBox.Focus();

                e.Handled = true;

                break;

        }

    }



    private void ResultsList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (ResultsList.SelectedItem is FileEntry entry)
            OpenEntryDefault(entry);
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


