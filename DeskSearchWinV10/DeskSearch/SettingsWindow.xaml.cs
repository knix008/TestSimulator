using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;
using Forms = System.Windows.Forms;
using MediaColor = System.Windows.Media.Color;

namespace DeskSearch;

public partial class SettingsWindow : Window
{
    private enum ColorSettingTarget
    {
        Background,
        Border,
        Text,
        Icon
    }

    public AppSettings Settings { get; private set; }
    public event Action<AppSettings>? PreviewChanged;

    private readonly Func<SettingsProgressSnapshot>? _getProgress;
    private readonly Action? _startIndexing;
    private readonly Action? _stopIndexing;
    private readonly Action<ResetScope>? _resetIndex;
    private readonly DispatcherTimer? _progressTimer;
    private readonly DebounceDispatcher _scrollResumeDebounce;
    private readonly DebounceDispatcher _focusRestoreDebounce;
    private readonly Dictionary<string, System.Windows.Controls.CheckBox> _driveCheckBoxes =
        new(StringComparer.OrdinalIgnoreCase);
    private int _lastProgressPercent = -1;
    private string? _lastProgressStatus;
    private string? _lastProgressPhase;
    private bool _progressPausedForScroll;
    private bool _progressIdle;
    private bool _indexActionIsStopMode;
    private bool _resetUiPending;
    private IInputElement? _pendingFocusRestore;
    private readonly AppSettings _initialSettings;
    private readonly string _initialLanguage;
    private bool _suppressLanguageLiveApply;
    private int _deactivateCloseSuppressDepth;
    private bool _savedOnClose;

    /// <summary>True when the user closed settings with Save.</summary>
    public bool SavedOnClose => _savedOnClose;

    public SettingsWindow(
        AppSettings current,
        Action<AppSettings>? previewChanged = null,
        Func<SettingsProgressSnapshot>? getProgress = null,
        Action? startIndexing = null,
        Action? stopIndexing = null,
        Action<ResetScope>? resetIndex = null)
    {
        Settings = current.Clone();
        _initialSettings = current.Clone();
        PreviewChanged = previewChanged;
        _initialLanguage = Settings.Language;
        _getProgress = getProgress;
        _startIndexing = startIndexing;
        _stopIndexing = stopIndexing;
        _resetIndex = resetIndex;
        _scrollResumeDebounce = new DebounceDispatcher(Dispatcher, IndexResourcePolicy.SettingsScrollResumeDebounceMs);
        _focusRestoreDebounce = new DebounceDispatcher(Dispatcher, IndexResourcePolicy.SettingsFocusRestoreDebounceMs);
        InitializeComponent();
        BuildColorSwatches();
        ApplyLocalization();
        LoadToUi();
        WindowTaskbarHelper.ExcludeFromTaskbar(this);

        if (_getProgress is null)
        {
            IndexProgressLabel.Visibility = Visibility.Collapsed;
            IndexProgressPhaseLabel.Visibility = Visibility.Collapsed;
            IndexProgressTrack.Visibility = Visibility.Collapsed;
            IndexProgressPercentLabel.Visibility = Visibility.Collapsed;
            IndexProgressStatusLabel.Visibility = Visibility.Collapsed;
            ReSearchButton.Visibility = Visibility.Collapsed;
            ResetIndexButton.Visibility = Visibility.Collapsed;
            OpenDataFolderButton.Visibility = Visibility.Collapsed;
            return;
        }

        _progressTimer = new DispatcherTimer(
            TimeSpan.FromMilliseconds(IndexResourcePolicy.SettingsProgressPollMs),
            DispatcherPriority.Background,
            (_, _) => UpdateProgressUi(),
            Dispatcher);
        IndexProgressTrack.SizeChanged += (_, _) => UpdateProgressUi();
        UpdateProgressUi();
        if (!_progressIdle)
            _progressTimer.Start();
    }

    private void SettingsScrollViewer_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        if (IsWithinKeyboardFocusedScrollable(e.OriginalSource as DependencyObject))
            return;

        if (Keyboard.FocusedElement is not DependencyObject focused
            || !RequiresWheelFocusPreservation(focused))
        {
            return;
        }

        var nextOffset = SettingsScrollViewer.VerticalOffset - e.Delta;
        SettingsScrollViewer.ScrollToVerticalOffset(
            Math.Clamp(nextOffset, 0, SettingsScrollViewer.ScrollableHeight));
        e.Handled = true;

        _pendingFocusRestore = focused as IInputElement;
        _focusRestoreDebounce.Debounce(RestorePendingFocus);
    }

    private static bool RequiresWheelFocusPreservation(DependencyObject focused) =>
        focused is System.Windows.Controls.TextBox
            or System.Windows.Controls.ComboBox
            or System.Windows.Controls.Primitives.ButtonBase
            or System.Windows.Controls.Primitives.ToggleButton
            or System.Windows.Controls.Primitives.RangeBase;

    private void RestorePendingFocus()
    {
        var previous = _pendingFocusRestore;
        _pendingFocusRestore = null;
        RestoreKeyboardFocus(previous);
    }

    private static bool IsWithinKeyboardFocusedScrollable(DependencyObject? source)
    {
        while (source is not null)
        {
            if (source is Slider { IsKeyboardFocusWithin: true }
                or System.Windows.Controls.ListBox { IsKeyboardFocusWithin: true })
            {
                return true;
            }

            source = VisualTreeHelper.GetParent(source);
        }

        return false;
    }

    private void RestoreKeyboardFocus(IInputElement? previous)
    {
        if (previous is not DependencyObject element || !IsDescendantOfSettings(element))
            return;

        Dispatcher.BeginInvoke(
            DispatcherPriority.Input,
            () =>
            {
                if (previous is UIElement { IsVisible: true, IsEnabled: true })
                    Keyboard.Focus(previous);
            });
    }

    private bool IsDescendantOfSettings(DependencyObject element)
    {
        var current = element;
        while (current is not null)
        {
            if (ReferenceEquals(current, this))
                return true;

            current = LogicalTreeHelper.GetParent(current)
                ?? VisualTreeHelper.GetParent(current);
        }

        return false;
    }

    private void SettingsScrollViewer_ScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        if (e.VerticalChange == 0 || _progressTimer is null || _progressIdle)
            return;

        _progressPausedForScroll = true;
        _progressTimer.Stop();
        _scrollResumeDebounce.Debounce(ResumeProgressUpdates);
    }

    private void ResumeProgressUpdates()
    {
        _progressPausedForScroll = false;
        if (_progressIdle)
            return;

        _progressTimer?.Start();
        UpdateProgressUi();
    }

    private void EnterProgressIdleMode()
    {
        if (_progressIdle)
            return;

        _progressIdle = true;
        _progressPausedForScroll = false;
        _progressTimer?.Stop();
    }

    private void ExitProgressIdleMode()
    {
        if (!_progressIdle)
            return;

        _progressIdle = false;
        if (!_progressPausedForScroll)
            _progressTimer?.Start();
    }

    private void SyncProgressActivityMode(SettingsProgressSnapshot snapshot)
    {
        if (_resetUiPending || snapshot.IsIndexing || snapshot.IsSearching)
            ExitProgressIdleMode();
        else
            EnterProgressIdleMode();
    }

    internal void RefreshProgressUi()
    {
        if (_getProgress is null)
            return;

        _lastProgressPercent = -1;
        _lastProgressStatus = null;
        _lastProgressPhase = null;
        UpdateProgressUi();
    }

    protected override void OnDeactivated(EventArgs e)
    {
        base.OnDeactivated(e);
        ScheduleOutsideClickCloseCheck();
    }

    private void ScheduleOutsideClickCloseCheck()
    {
        Dispatcher.BeginInvoke(DispatcherPriority.Input, CheckOutsideClickClose);
    }

    private void CheckOutsideClickClose()
    {
        if (!IsVisible || _deactivateCloseSuppressDepth > 0)
            return;

        if (IsPointerOverAppChrome() || IsPointerOverOwnedDialog() || IsOwnedDialogOpen())
            return;

        CloseWithoutSave();
    }

    private bool IsPointerOverAppChrome()
    {
        if (ScreenHelper.IsPointerOverWindow(this))
            return true;

        if (Owner is Window owner && ScreenHelper.IsPointerOverWindow(owner))
            return true;

        foreach (Window window in System.Windows.Application.Current.Windows)
        {
            if (window is ResultsWindow { IsVisible: true } results
                && ScreenHelper.IsPointerOverWindow(results))
            {
                return true;
            }
        }

        return false;
    }

    private bool IsOwnedDialogOpen()
    {
        foreach (Window window in System.Windows.Application.Current.Windows)
        {
            if (window.IsVisible && window.Owner == this && !ReferenceEquals(window, this))
                return true;
        }

        return false;
    }

    private bool IsPointerOverOwnedDialog()
    {
        foreach (Window window in System.Windows.Application.Current.Windows)
        {
            if (!window.IsVisible || ReferenceEquals(window, this))
                continue;

            if (window.Owner == this && ScreenHelper.IsPointerOverWindow(window))
                return true;
        }

        return false;
    }

    private void SettingsRoot_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != Key.Escape || !ShouldCloseOnEscape(e.OriginalSource as DependencyObject))
            return;

        CloseWithoutSave();
        e.Handled = true;
    }

    private static bool ShouldCloseOnEscape(DependencyObject? source)
    {
        while (source is not null)
        {
            if (source is System.Windows.Controls.ComboBox { IsDropDownOpen: true })
                return false;

            source = VisualTreeHelper.GetParent(source);
        }

        return true;
    }

    private void CloseWithoutSave()
    {
        if (!IsVisible)
            return;

        _savedOnClose = false;
        Close();
    }

    private IDisposable SuppressDeactivateClose()
    {
        _deactivateCloseSuppressDepth++;
        return new DeactivateCloseSuppressScope(this);
    }

    private sealed class DeactivateCloseSuppressScope(SettingsWindow window) : IDisposable
    {
        public void Dispose()
        {
            if (window._deactivateCloseSuppressDepth > 0)
                window._deactivateCloseSuppressDepth--;
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        _progressTimer?.Stop();

        if (!_savedOnClose)
            PreviewChanged?.Invoke(_initialSettings.Clone());

        if (!_savedOnClose
            && !string.Equals(LocalizationService.CurrentLanguage, _initialLanguage, StringComparison.Ordinal))
        {
            LocalizationService.Apply(_initialLanguage);
        }

        base.OnClosed(e);
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        WindowTaskbarHelper.ApplyExStyle(this);
    }

    private void BuildColorSwatches()
    {
        RebuildColorSwatches();
    }

    private static void PopulateSwatches(WrapPanel panel, IReadOnlyList<string> colors, RoutedEventHandler handler)
    {
        foreach (var hex in colors)
        {
            var button = new System.Windows.Controls.Button
            {
                Style = (Style)panel.FindResource("ColorSwatchButton"),
                Tag = hex,
                ToolTip = hex,
                Background = ColorHelper.ToBrush(hex)
            };
            button.Click += handler;
            panel.Children.Add(button);
        }
    }

    private void ApplyLocalization()
    {
        Title = LocalizationService.T("Settings_Title");
        HeaderText.Text = LocalizationService.T("Settings_Header");
        InfoButton.Content = CreateIconLabel("\uE946", LocalizationService.T("Settings_Info"), SettingsIconColors.Info);
        LanguageLabel.Text = LocalizationService.T("Settings_Language");
        LanguageKoreanRadio.Content = LocalizationService.T("Settings_Language_Korean");
        LanguageEnglishRadio.Content = LocalizationService.T("Settings_Language_English");
        SearchOptionsLabel.Text = LocalizationService.T("Settings_Search");
        CaseSensitiveSearchCheckBox.Content = LocalizationService.T("Settings_CaseSensitive");
        CaseSensitiveSearchDescLabel.Text = LocalizationService.T("Settings_CaseSensitiveDesc");
        UseRegexSearchCheckBox.Content = LocalizationService.T("Settings_UseRegex");
        UseRegexSearchDescLabel.Text = LocalizationService.T("Settings_UseRegexDesc");
        SearchResultSortLabel.Text = LocalizationService.T("Settings_SearchResultSort");
        SearchResultSortDescLabel.Text = LocalizationService.T("Settings_SearchResultSortDesc");
        LoadSearchResultSortOptions();
        SearchMultilingualNoteLabel.Text = LocalizationService.T("Settings_SearchMultilingualNote");
        ExclusionLabel.Text = LocalizationService.T("Settings_Exclusion");
        ExcludedDrivesDescLabel.Text = LocalizationService.T("Settings_ExcludedDrivesDesc");
        ExcludedDirectoriesLabel.Text = LocalizationService.T("Settings_ExcludedDirectories");
        ExcludedDirectoriesDescLabel.Text = LocalizationService.T("Settings_ExcludedDirectoriesDesc");
        BrowseExcludedDirectoryButton.Content = CreateIconLabel("\uE838", LocalizationService.T("Settings_BrowseFolder"), SettingsIconColors.BrowseFolder);
        RemoveExcludedDirectoryButton.Content = CreateIconLabel("\uE74D", LocalizationService.T("Settings_RemoveExcluded"), SettingsIconColors.Remove);
        IndexProgressLabel.Text = LocalizationService.T("Settings_IndexProgress");
        ResetIndexButton.Content = CreateIconLabel("\uE894", LocalizationService.T("Settings_ResetIndex"), SettingsIconColors.Reset);
        OpenDataFolderButton.Content = CreateIconLabel("\uE8DA", LocalizationService.T("Settings_OpenDataFolder"), SettingsIconColors.OpenDataFolder);
        ApplyIndexActionButtonAppearance(_indexActionIsStopMode);
        StartupLabel.Text = LocalizationService.T("Settings_Startup");
        RunAtStartupCheckBox.Content = LocalizationService.T("Settings_RunAtStartup");
        RunAtStartupDescLabel.Text = LocalizationService.T("Settings_RunAtStartupDesc");
        ColorSettingsLabel.Text = LocalizationService.T("Settings_ColorSettings");
        ColorTargetLabel.Text = LocalizationService.T("Settings_ColorTarget");
        PickColorButton.Content = CreateIconLabel("\uE790", LocalizationService.T("Settings_PickColor"), SettingsIconColors.PickBackground);
        BackgroundOpacityLabel.Text = LocalizationService.T("Settings_BackgroundOpacity");
        BorderThicknessLabel.Text = LocalizationService.T("Settings_BorderThickness");
        TextPreview.Text = LocalizationService.T("Settings_SearchPreview");
        WindowOpacityLabel.Text = LocalizationService.T("Settings_WindowOpacity");
        DisplayPriorityLabel.Text = LocalizationService.T("Settings_DisplayPriority");
        PriorityAboveOthersRadio.Content = LocalizationService.T("Settings_AboveOthers");
        AboveOthersDescLabel.Text = LocalizationService.T("Settings_AboveOthersDesc");
        PriorityNormalRadio.Content = LocalizationService.T("Settings_NormalPriority");
        NormalPriorityDescLabel.Text = LocalizationService.T("Settings_NormalPriorityDesc");
        CancelButton.Content = CreateIconLabel("\uE711", LocalizationService.T("Settings_Cancel"), SettingsIconColors.Cancel);
        SaveButton.Content = CreateIconLabel("\uE74E", LocalizationService.T("Settings_Save"), SettingsIconColors.Save);
        LoadColorTargetOptions();
    }

    private void LoadColorTargetOptions()
    {
        var selected = GetSelectedColorTarget();

        ColorTargetComboBox.Items.Clear();
        AddColorTargetOption(ColorSettingTarget.Background, LocalizationService.T("Settings_BackgroundColor"));
        AddColorTargetOption(ColorSettingTarget.Border, LocalizationService.T("Settings_BorderColor"));
        AddColorTargetOption(ColorSettingTarget.Text, LocalizationService.T("Settings_TextColor"));
        AddColorTargetOption(ColorSettingTarget.Icon, LocalizationService.T("Settings_IconColor"));

        SelectColorTarget(selected);
        RebuildColorSwatches();
    }

    private void AddColorTargetOption(ColorSettingTarget target, string label)
    {
        ColorTargetComboBox.Items.Add(new ComboBoxItem
        {
            Content = label,
            Tag = target,
            VerticalContentAlignment = VerticalAlignment.Center,
            Padding = new Thickness(8, 0, 8, 0)
        });
    }

    private static StackPanel CreateIconLabel(string glyph, string label, string iconColorHex)
    {
        var iconBrush = ColorHelper.ToBrush(iconColorHex);
        return new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            Children =
            {
                new TextBlock
                {
                    Text = glyph,
                    FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
                    FontSize = 14,
                    Foreground = iconBrush,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 6, 0)
                },
                new TextBlock
                {
                    Text = label,
                    Foreground = System.Windows.SystemColors.ControlTextBrush,
                    VerticalAlignment = VerticalAlignment.Center
                }
            }
        };
    }

    private void LoadToUi()
    {
        _suppressLanguageLiveApply = true;
        try
        {
            LanguageKoreanRadio.IsChecked = Settings.Language != LocalizationService.English;
            LanguageEnglishRadio.IsChecked = Settings.Language == LocalizationService.English;
        }
        finally
        {
            _suppressLanguageLiveApply = false;
        }
        CaseSensitiveSearchCheckBox.IsChecked = Settings.CaseSensitiveSearch;
        UseRegexSearchCheckBox.IsChecked = Settings.UseRegexSearch;
        SelectSearchResultSort(Settings.SearchResultSort);
        RunAtStartupCheckBox.IsChecked = Settings.RunAtStartup;
        SelectColorTarget(ColorSettingTarget.Background);
        BorderThicknessSlider.Value = Settings.BorderThickness;
        TextPreview.Foreground = ColorHelper.ToBrush(ColorHelper.ResolveDisplayColors(Settings).TextColor);
        BackgroundOpacitySlider.Value = Settings.BackgroundOpacity;
        WindowOpacitySlider.Value = Settings.WindowOpacity;
        PriorityAboveOthersRadio.IsChecked = Settings.AlwaysOnTop;
        PriorityNormalRadio.IsChecked = !Settings.AlwaysOnTop;
        BuildIncludedDrivesUi();
        LoadIncludedDirectories();
        RefreshThemePreviews();
        UpdateOpacityLabels();
    }

    private void SelectColorTarget(ColorSettingTarget target)
    {
        foreach (ComboBoxItem item in ColorTargetComboBox.Items)
        {
            if (item.Tag is ColorSettingTarget value && value == target)
            {
                ColorTargetComboBox.SelectedItem = item;
                return;
            }
        }

        if (ColorTargetComboBox.Items.Count > 0)
            ColorTargetComboBox.SelectedIndex = 0;
    }

    private ColorSettingTarget GetSelectedColorTarget()
    {
        if (ColorTargetComboBox.SelectedItem is ComboBoxItem { Tag: ColorSettingTarget target })
            return target;

        return ColorSettingTarget.Background;
    }

    private void LoadSearchResultSortOptions()
    {
        var selected = SearchResultSortComboBox.SelectedItem is ComboBoxItem { Tag: SearchResultSortOrder sort }
            ? sort
            : Settings.SearchResultSort;

        SearchResultSortComboBox.Items.Clear();

        foreach (var option in SearchResultSortPolicy.All)
        {
            SearchResultSortComboBox.Items.Add(new ComboBoxItem
            {
                Content = LocalizationService.T(SearchResultSortPolicy.GetLabelKey(option)),
                Tag = option,
                VerticalContentAlignment = VerticalAlignment.Center,
                Padding = new Thickness(8, 0, 8, 0)
            });
        }

        SelectSearchResultSort(selected);
    }

    private void SelectSearchResultSort(SearchResultSortOrder sort)
    {
        sort = SearchResultSortPolicy.Normalize(sort);

        foreach (ComboBoxItem item in SearchResultSortComboBox.Items)
        {
            if (item.Tag is SearchResultSortOrder value && value == sort)
            {
                SearchResultSortComboBox.SelectedItem = item;
                return;
            }
        }

        if (SearchResultSortComboBox.Items.Count > 0)
            SearchResultSortComboBox.SelectedIndex = 0;
    }

    private SearchResultSortOrder GetSelectedSearchResultSort()
    {
        if (SearchResultSortComboBox.SelectedItem is ComboBoxItem { Tag: SearchResultSortOrder sort })
            return SearchResultSortPolicy.Normalize(sort);

        return SearchResultSortOrder.MatchQuality;
    }

    private void BuildIncludedDrivesUi()
    {
        ExcludedDrivesPanel.Children.Clear();
        _driveCheckBoxes.Clear();

        var included = new HashSet<string>(
            Settings.IncludedDrives
                .Select(IndexInclusionPolicy.NormalizeDriveRoot)
                .Where(static root => root is not null)
                .Cast<string>(),
            StringComparer.OrdinalIgnoreCase);

        foreach (var drive in DriveInfo.GetDrives().OrderBy(static d => d.Name))
        {
            if (!drive.IsReady)
                continue;

            var root = IndexInclusionPolicy.NormalizeDriveRoot(drive.Name);
            if (root is null)
                continue;

            AddIncludedDriveCheckBox(root, included.Contains(root), FormatDriveLabel(drive, root));
        }

        foreach (var root in Settings.IncludedDrives
                     .Select(IndexInclusionPolicy.NormalizeDriveRoot)
                     .Where(static root => root is not null)
                     .Cast<string>()
                     .OrderBy(static root => root, StringComparer.OrdinalIgnoreCase))
        {
            if (_driveCheckBoxes.ContainsKey(root))
                continue;

            AddIncludedDriveCheckBox(
                root,
                isChecked: true,
                $"{root} ({LocalizationService.T("Settings_DriveUnavailable")})");
        }
    }

    private void AddIncludedDriveCheckBox(string root, bool isChecked, string label)
    {
        var checkBox = new System.Windows.Controls.CheckBox
        {
            Content = label,
            IsChecked = isChecked,
            Margin = new Thickness(0, 0, 12, 4),
            Tag = root
        };

        _driveCheckBoxes[root] = checkBox;
        ExcludedDrivesPanel.Children.Add(checkBox);
    }

    private static string FormatDriveLabel(DriveInfo drive, string root)
    {
        var volumeLabel = string.IsNullOrWhiteSpace(drive.VolumeLabel)
            ? string.Empty
            : $" ({drive.VolumeLabel})";

        return $"{root}{volumeLabel}";
    }

    private void LoadIncludedDirectories()
    {
        ExcludedDirectoriesListBox.Items.Clear();

        foreach (var path in Settings.IncludedDirectories)
        {
            var display = IndexInclusionPolicy.NormalizeDirectoryDisplay(path);
            if (!string.IsNullOrWhiteSpace(display))
                ExcludedDirectoriesListBox.Items.Add(display);
        }
    }

    private void BrowseExcludedDirectory_Click(object sender, RoutedEventArgs e)
    {
        var ownerHandle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        string[]? selectedPaths;
        using (SuppressDeactivateClose())
            selectedPaths = MultiFolderBrowserDialog.ShowDialog(ownerHandle, Settings.LastIncludedDirectoryBrowsePath);

        if (selectedPaths is null)
            return;

        foreach (var path in selectedPaths)
            AddIncludedDirectory(path);

        var lastPath = selectedPaths.LastOrDefault();
        if (!string.IsNullOrWhiteSpace(lastPath))
            Settings.LastIncludedDirectoryBrowsePath = lastPath;
    }

    private void AddIncludedDirectory(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return;

        var normalized = IndexInclusionPolicy.NormalizeDirectoryPrefix(path);
        if (normalized is null)
            return;

        var display = normalized.TrimEnd('\\');
        var alreadyListed = ExcludedDirectoriesListBox.Items
            .Cast<string>()
            .Any(item =>
            {
                var existing = IndexInclusionPolicy.NormalizeDirectoryPrefix(item);
                return existing is not null
                    && existing.Equals(normalized, StringComparison.OrdinalIgnoreCase);
            });

        if (alreadyListed)
            return;

        ExcludedDirectoriesListBox.Items.Add(display);
    }

    private void RemoveExcludedDirectory_Click(object sender, RoutedEventArgs e)
    {
        if (ExcludedDirectoriesListBox.SelectedItem is not string)
            return;

        ExcludedDirectoriesListBox.Items.Remove(ExcludedDirectoriesListBox.SelectedItem);
    }

    private void SaveIncludedPaths()
    {
        Settings.IncludedDrives = _driveCheckBoxes
            .Where(static pair => pair.Value.IsChecked == true)
            .Select(static pair => pair.Key)
            .OrderBy(static drive => drive, StringComparer.OrdinalIgnoreCase)
            .ToList();

        Settings.IncludedDirectories = ExcludedDirectoriesListBox.Items
            .Cast<string>()
            .Select(IndexInclusionPolicy.NormalizeDirectoryDisplay)
            .Where(static path => !string.IsNullOrWhiteSpace(path))
            .Cast<string>()
            .ToList();
    }

    private SolidColorBrush CreateBackgroundBrush()
    {
        var rgb = ColorHelper.ParseColor(Settings.BackgroundColor);
        var withAlpha = ColorHelper.WithOpacity(rgb, Settings.BackgroundOpacity);
        var brush = new SolidColorBrush(withAlpha);
        brush.Freeze();
        return brush;
    }

    private void UpdateProgressUi()
    {
        if (_getProgress is null || _progressPausedForScroll)
            return;

        var snapshot = _getProgress();

        if (_resetUiPending)
        {
            if (snapshot.IsIndexing || !snapshot.CanResetIndex)
                _resetUiPending = false;
            else
            {
                SyncIndexActionButton(snapshot.IsScanRunning, snapshot.IsPostProcessing);
                SyncResetIndexButton(false);
                return;
            }
        }

        if (snapshot.Percent == _lastProgressPercent
            && string.Equals(snapshot.StatusText, _lastProgressStatus, StringComparison.Ordinal)
            && string.Equals(snapshot.PhaseText, _lastProgressPhase, StringComparison.Ordinal))
        {
            SyncIndexActionButton(snapshot.IsScanRunning, snapshot.IsPostProcessing);
            SyncResetIndexButton(snapshot.CanResetIndex);
            SyncProgressActivityMode(snapshot);
            return;
        }

        _lastProgressPercent = snapshot.Percent;
        _lastProgressStatus = snapshot.StatusText;
        _lastProgressPhase = snapshot.PhaseText;

        var trackWidth = IndexProgressTrack.ActualWidth;
        if (trackWidth > 0)
            IndexProgressFill.Width = trackWidth * snapshot.Percent / 100.0;

        IndexProgressPercentLabel.Text = $"{snapshot.Percent}%";

        if (snapshot.IsIndexing && !string.IsNullOrEmpty(snapshot.PhaseText))
        {
            IndexProgressPhaseLabel.Text = snapshot.PhaseText;
            IndexProgressPhaseLabel.Visibility = Visibility.Visible;
        }
        else
        {
            IndexProgressPhaseLabel.Visibility = Visibility.Collapsed;
        }

        IndexProgressStatusLabel.Text = snapshot.StatusText;
        SyncIndexActionButton(snapshot.IsScanRunning, snapshot.IsPostProcessing);
        SyncResetIndexButton(snapshot.CanResetIndex);
        SyncProgressActivityMode(snapshot);
    }

    private void SyncResetIndexButton(bool isEnabled)
    {
        ResetIndexButton.IsEnabled = isEnabled;
    }

    private void SyncIndexActionButton(bool isStopMode, bool isPostProcessing)
    {
        ReSearchButton.IsEnabled = true;

        if (_indexActionIsStopMode == isStopMode)
            return;

        _indexActionIsStopMode = isStopMode;
        ApplyIndexActionButtonAppearance(isStopMode);
    }

    private void ApplyIndexActionButtonAppearance(bool isStopMode)
    {
        if (isStopMode)
        {
            ReSearchButton.Content = CreateStopIconLabel(LocalizationService.T("Settings_StopIndexing"));
            ReSearchButton.Background = new SolidColorBrush(MediaColor.FromRgb(0xC4, 0x2B, 0x1C));
            ReSearchButton.Foreground = System.Windows.Media.Brushes.White;
            ReSearchButton.BorderBrush = new SolidColorBrush(MediaColor.FromRgb(0xA5, 0x24, 0x18));
            ReSearchButton.BorderThickness = new Thickness(1);
        }
        else
        {
            ReSearchButton.Content = CreateIconLabel("\uE721", LocalizationService.T("Settings_Indexing"), SettingsIconColors.Indexing);
            ReSearchButton.ClearValue(System.Windows.Controls.Control.BackgroundProperty);
            ReSearchButton.ClearValue(System.Windows.Controls.Control.ForegroundProperty);
            ReSearchButton.ClearValue(System.Windows.Controls.Control.BorderBrushProperty);
            ReSearchButton.ClearValue(System.Windows.Controls.Control.BorderThicknessProperty);
        }
    }

    private static StackPanel CreateStopIconLabel(string label)
    {
        var iconBrush = ColorHelper.ToBrush(SettingsIconColors.Stop);
        return new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            Children =
            {
                new TextBlock
                {
                    Text = "\uE71A",
                    FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
                    FontSize = 14,
                    Foreground = iconBrush,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 6, 0)
                },
                new TextBlock
                {
                    Text = label,
                    Foreground = System.Windows.Media.Brushes.White,
                    VerticalAlignment = VerticalAlignment.Center
                }
            }
        };
    }

    private void IndexAction_Click(object sender, RoutedEventArgs e)
    {
        var snapshot = _getProgress?.Invoke();
        if (snapshot is { IsScanRunning: true })
            _stopIndexing?.Invoke();
        else
        {
            ExitProgressIdleMode();
            _startIndexing?.Invoke();
            _indexActionIsStopMode = false;
            SyncIndexActionButton(isStopMode: true, isPostProcessing: false);
        }

        _lastProgressPercent = -1;
        _lastProgressStatus = null;
        _lastProgressPhase = null;
        UpdateProgressUi();
    }

    private void ResetIndex_Click(object sender, RoutedEventArgs e)
    {
        if (!ResetIndexButton.IsEnabled)
            return;

        var choiceDialog = new ResetChoiceDialog { Owner = this };
        bool? accepted;
        using (SuppressDeactivateClose())
            accepted = choiceDialog.ShowDialog();

        if (accepted != true)
            return;

        _resetUiPending = true;
        ExitProgressIdleMode();
        _resetIndex?.Invoke(choiceDialog.Scope);
        ApplyResetProgressUi();
    }

    internal void ApplyFactorySettings(AppSettings defaults)
    {
        Settings = defaults.Clone();
        LoadToUi();
        ApplyLocalization();
        UpdateProgressUi();
        PushLivePreview();
    }

    private void ApplyResetProgressUi()
    {
        var status = LocalizationService.T("Settings_IndexResetStatus");

        _lastProgressPercent = 0;
        _lastProgressStatus = status;
        _lastProgressPhase = string.Empty;

        var trackWidth = IndexProgressTrack.ActualWidth;
        if (trackWidth > 0)
            IndexProgressFill.Width = 0;

        IndexProgressPercentLabel.Text = "0%";
        IndexProgressPhaseLabel.Visibility = Visibility.Collapsed;
        IndexProgressStatusLabel.Text = status;
        SyncIndexActionButton(isStopMode: false, isPostProcessing: false);
        SyncResetIndexButton(isEnabled: false);
        ExitProgressIdleMode();
    }

    private void OpenDataFolder_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            AppStoragePaths.OpenDataFolderInExplorer();
        }
        catch (Exception ex)
        {
            ErrorDialogService.Show(LocalizationService.T("Error_OpenDataFolder"), ex);
        }
    }

    private void UpdateOpacityLabels()
    {
        BackgroundOpacityValueLabel.Text = $"{(int)BackgroundOpacitySlider.Value}%";
        WindowOpacityValueLabel.Text = $"{(int)WindowOpacitySlider.Value}%";
        BorderThicknessValueLabel.Text = $"{BorderThicknessSlider.Value:0.0}";
    }

    private void PickColorButton_Click(object sender, RoutedEventArgs e)
    {
        if (!TryPickColor(GetSelectedColorHex(), out var hex))
            return;

        ApplySelectedColor(hex);
    }

    private string GetSelectedColorHex() => GetSelectedColorTarget() switch
    {
        ColorSettingTarget.Background => Settings.BackgroundColor,
        ColorSettingTarget.Border => Settings.BorderColor,
        ColorSettingTarget.Text => Settings.TextColor,
        ColorSettingTarget.Icon => Settings.IconColor,
        _ => Settings.BackgroundColor
    };

    private void ApplySelectedColor(string hex)
    {
        switch (GetSelectedColorTarget())
        {
            case ColorSettingTarget.Background:
                Settings.BackgroundColor = hex;
                ColorHelper.SyncThemeTextColors(Settings);
                Settings.IconColor = ColorHelper.GetDefaultIconColor(Settings.BackgroundColor);
                break;
            case ColorSettingTarget.Border:
                Settings.BorderColor = NormalizeBorderHex(hex);
                break;
            case ColorSettingTarget.Text:
                Settings.TextColor = hex;
                break;
            case ColorSettingTarget.Icon:
                Settings.IconColor = hex;
                break;
        }

        RefreshThemePreviews();
        PushLivePreview();
    }

    private static string NormalizeBorderHex(string hex) =>
        hex.StartsWith("#") && hex.Length == 9
            ? hex
            : "#33" + hex.TrimStart('#');

    private bool TryPickColor(string currentHex, out string hex)
    {
        hex = currentHex;
        var current = ColorHelper.ParseColor(currentHex);

        using var dialog = new Forms.ColorDialog
        {
            Color = System.Drawing.Color.FromArgb(current.R, current.G, current.B),
            FullOpen = true
        };

        Forms.DialogResult result;
        using (SuppressDeactivateClose())
            result = dialog.ShowDialog();

        if (result != Forms.DialogResult.OK)
            return false;

        hex = ColorHelper.ToHex(MediaColor.FromRgb(dialog.Color.R, dialog.Color.G, dialog.Color.B));
        return true;
    }

    private void PresetColor_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button { Tag: string hex })
            return;

        ApplySelectedColor(hex);
    }

    private void RefreshThemePreviews()
    {
        PreviewBackgroundLayer.Background = CreateBackgroundBrush();
        PreviewBorderLayer.Background = System.Windows.Media.Brushes.Transparent;
        PreviewBorderLayer.BorderBrush = ColorHelper.ToBrush(Settings.BorderColor);
        PreviewBorderLayer.BorderThickness = new Thickness(Settings.BorderThickness);
        TextPreview.Foreground = ColorHelper.ToBrush(Settings.TextColor);
        IconPreviewMuted.Foreground = ColorHelper.ToBrush(Settings.IconColor, 0xB0);
        IconPreviewPrimary.Foreground = ColorHelper.ToBrush(Settings.IconColor);
        IconPreviewAccent.Foreground = ColorHelper.ToBrush(Settings.IconColor);

        var showIcons = GetSelectedColorTarget() == ColorSettingTarget.Icon;
        IconPreviewPanel.Visibility = showIcons ? Visibility.Visible : Visibility.Collapsed;
        TextPreviewPanel.Visibility = showIcons ? Visibility.Collapsed : Visibility.Visible;
    }

    private void BackgroundOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;
        RefreshThemePreviews();
        BackgroundOpacityValueLabel.Text = $"{Settings.BackgroundOpacity}%";
        PushLivePreview();
    }

    private void BorderThicknessSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.BorderThickness = BorderThicknessSlider.Value;
        RefreshThemePreviews();
        BorderThicknessValueLabel.Text = $"{Settings.BorderThickness:0.0}";
        PushLivePreview();
    }

    private void WindowOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        WindowOpacityValueLabel.Text = $"{Settings.WindowOpacity}%";
        PushLivePreview();
    }

    private void PriorityRadio_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded)
            return;

        Settings.AlwaysOnTop = PriorityAboveOthersRadio.IsChecked == true;
        PushLivePreview();
    }

    private void LanguageRadio_Checked(object sender, RoutedEventArgs e)
    {
        if (_suppressLanguageLiveApply)
            return;

        var language = LanguageEnglishRadio.IsChecked == true
            ? LocalizationService.English
            : LocalizationService.Korean;

        if (string.Equals(language, LocalizationService.CurrentLanguage, StringComparison.Ordinal))
            return;

        Settings.Language = language;
        LocalizationService.Apply(language);
        ApplyLocalization();
        UpdateProgressUi();
        PushLivePreview();
    }

    private void ColorTargetComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!IsLoaded)
            return;

        RebuildColorSwatches();
        RefreshThemePreviews();
    }

    private void RebuildColorSwatches()
    {
        ColorSwatchPanel.Children.Clear();
        var colors = GetSelectedColorTarget() switch
        {
            ColorSettingTarget.Background => SettingsColorPalette.BackgroundSwatches,
            ColorSettingTarget.Border => SettingsColorPalette.BackgroundSwatches,
            ColorSettingTarget.Text => SettingsColorPalette.TextSwatches,
            ColorSettingTarget.Icon => SettingsColorPalette.TextSwatches,
            _ => SettingsColorPalette.BackgroundSwatches
        };

        PopulateSwatches(ColorSwatchPanel, colors, PresetColor_Click);
    }

    private void PushLivePreview()
    {
        PreviewChanged?.Invoke(Settings.Clone());
    }

    private void InfoButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new AboutDialog { Owner = this };
        using (SuppressDeactivateClose())
            dialog.ShowDialog();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        Settings.Language = LanguageEnglishRadio.IsChecked == true
            ? LocalizationService.English
            : LocalizationService.Korean;
        Settings.CaseSensitiveSearch = CaseSensitiveSearchCheckBox.IsChecked == true;
        Settings.UseRegexSearch = UseRegexSearchCheckBox.IsChecked == true;
        Settings.SearchResultSort = GetSelectedSearchResultSort();
        Settings.RunAtStartup = RunAtStartupCheckBox.IsChecked == true;
        SaveIncludedPaths();
        Settings.AlwaysOnTop = PriorityAboveOthersRadio.IsChecked == true;
        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;
        Settings.BorderThickness = BorderThicknessSlider.Value;

        var display = ColorHelper.ResolveDisplayColors(Settings);
        Settings.TextColor = display.TextColor;
        Settings.SubTextColor = display.SubTextColor;
        Settings.BorderColor = display.BorderColor;

        _savedOnClose = true;
        PushLivePreview();
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => CloseWithoutSave();
}
