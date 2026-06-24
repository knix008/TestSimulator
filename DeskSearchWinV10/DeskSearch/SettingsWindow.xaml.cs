using System.IO;
using System.Windows;
using System.Windows.Controls;
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
    public AppSettings Settings { get; private set; }

    private readonly Func<SettingsProgressSnapshot>? _getProgress;
    private readonly Action? _reSearch;
    private readonly DispatcherTimer? _progressTimer;
    private readonly DebounceDispatcher _scrollResumeDebounce;
    private readonly Dictionary<string, System.Windows.Controls.CheckBox> _driveCheckBoxes =
        new(StringComparer.OrdinalIgnoreCase);
    private int _lastProgressPercent = -1;
    private string? _lastProgressStatus;
    private bool _progressPausedForScroll;

    public SettingsWindow(
        AppSettings current,
        Func<SettingsProgressSnapshot>? getProgress = null,
        Action? reSearch = null)
    {
        Settings = current.Clone();
        _getProgress = getProgress;
        _reSearch = reSearch;
        _scrollResumeDebounce = new DebounceDispatcher(Dispatcher, delayMs: 180);
        InitializeComponent();
        BuildColorSwatches();
        ApplyLocalization();
        LoadToUi();
        WindowTaskbarHelper.ExcludeFromTaskbar(this);

        if (_getProgress is null)
        {
            IndexProgressLabel.Visibility = Visibility.Collapsed;
            IndexProgressTrack.Visibility = Visibility.Collapsed;
            IndexProgressPercentLabel.Visibility = Visibility.Collapsed;
            IndexProgressStatusLabel.Visibility = Visibility.Collapsed;
            ReSearchButton.Visibility = Visibility.Collapsed;
            return;
        }

        _progressTimer = new DispatcherTimer(
            TimeSpan.FromMilliseconds(1000),
            DispatcherPriority.Background,
            (_, _) => UpdateProgressUi(),
            Dispatcher);
        IndexProgressTrack.SizeChanged += (_, _) => UpdateProgressUi();
        _progressTimer.Start();
        UpdateProgressUi();
    }

    private void SettingsScrollViewer_ScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        if (e.VerticalChange == 0 || _progressTimer is null)
            return;

        _progressPausedForScroll = true;
        _progressTimer.Stop();
        _scrollResumeDebounce.Debounce(ResumeProgressUpdates);
    }

    private void ResumeProgressUpdates()
    {
        _progressPausedForScroll = false;
        _progressTimer?.Start();
        UpdateProgressUi();
    }

    protected override void OnClosed(EventArgs e)
    {
        _progressTimer?.Stop();
        base.OnClosed(e);
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        WindowTaskbarHelper.ApplyExStyle(this);
    }

    private void BuildColorSwatches()
    {
        PopulateSwatches(BackgroundSwatchPanel, SettingsColorPalette.BackgroundSwatches, PresetBackground_Click);
        PopulateSwatches(BorderSwatchPanel, SettingsColorPalette.BackgroundSwatches, PresetBorder_Click);
        PopulateSwatches(TextSwatchPanel, SettingsColorPalette.TextSwatches, PresetText_Click);
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
        LanguageLabel.Text = LocalizationService.T("Settings_Language");
        LanguageKoreanRadio.Content = LocalizationService.T("Settings_Language_Korean");
        LanguageEnglishRadio.Content = LocalizationService.T("Settings_Language_English");
        SearchOptionsLabel.Text = LocalizationService.T("Settings_Search");
        CaseSensitiveSearchCheckBox.Content = LocalizationService.T("Settings_CaseSensitive");
        CaseSensitiveSearchDescLabel.Text = LocalizationService.T("Settings_CaseSensitiveDesc");
        UseRegexSearchCheckBox.Content = LocalizationService.T("Settings_UseRegex");
        UseRegexSearchDescLabel.Text = LocalizationService.T("Settings_UseRegexDesc");
        SearchMultilingualNoteLabel.Text = LocalizationService.T("Settings_SearchMultilingualNote");
        ExclusionLabel.Text = LocalizationService.T("Settings_Exclusion");
        ExcludedDrivesDescLabel.Text = LocalizationService.T("Settings_ExcludedDrivesDesc");
        ExcludedDirectoriesLabel.Text = LocalizationService.T("Settings_ExcludedDirectories");
        ExcludedDirectoriesDescLabel.Text = LocalizationService.T("Settings_ExcludedDirectoriesDesc");
        BrowseExcludedDirectoryButton.Content = CreateIconLabel("\uE838", LocalizationService.T("Settings_BrowseFolder"));
        AddExcludedDirectoryButton.Content = CreateIconLabel("\uE710", LocalizationService.T("Settings_AddExcluded"));
        RemoveExcludedDirectoryButton.Content = CreateIconLabel("\uE74D", LocalizationService.T("Settings_RemoveExcluded"));
        IndexProgressLabel.Text = LocalizationService.T("Settings_IndexProgress");
        ReSearchButton.Content = CreateIconLabel("\uE721", LocalizationService.T("Settings_ReSearch"));
        StartupLabel.Text = LocalizationService.T("Settings_Startup");
        RunAtStartupCheckBox.Content = LocalizationService.T("Settings_RunAtStartup");
        RunAtStartupDescLabel.Text = LocalizationService.T("Settings_RunAtStartupDesc");
        BackgroundColorLabel.Text = LocalizationService.T("Settings_BackgroundColor");
        PickBackgroundColorButton.Content = CreateIconLabel("\uE790", LocalizationService.T("Settings_PickColor"));
        BackgroundOpacityLabel.Text = LocalizationService.T("Settings_BackgroundOpacity");
        BorderColorLabel.Text = LocalizationService.T("Settings_BorderColor");
        PickBorderColorButton.Content = CreateIconLabel("\uE790", LocalizationService.T("Settings_PickColor"));
        TextColorLabel.Text = LocalizationService.T("Settings_TextColor");
        PickTextColorButton.Content = CreateIconLabel("\uE790", LocalizationService.T("Settings_PickColor"));
        TextPreview.Text = LocalizationService.T("Settings_SearchPreview");
        WindowOpacityLabel.Text = LocalizationService.T("Settings_WindowOpacity");
        DisplayPriorityLabel.Text = LocalizationService.T("Settings_DisplayPriority");
        PriorityAboveOthersRadio.Content = LocalizationService.T("Settings_AboveOthers");
        AboveOthersDescLabel.Text = LocalizationService.T("Settings_AboveOthersDesc");
        PriorityNormalRadio.Content = LocalizationService.T("Settings_NormalPriority");
        NormalPriorityDescLabel.Text = LocalizationService.T("Settings_NormalPriorityDesc");
        CancelButton.Content = CreateIconLabel("\uE711", LocalizationService.T("Settings_Cancel"));
        SaveButton.Content = CreateIconLabel("\uE74E", LocalizationService.T("Settings_Save"));
    }

    private static StackPanel CreateIconLabel(string glyph, string label) =>
        new()
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            Children =
            {
                new TextBlock
                {
                    Text = glyph,
                    FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
                    FontSize = 14,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 6, 0)
                },
                new TextBlock
                {
                    Text = label,
                    VerticalAlignment = VerticalAlignment.Center
                }
            }
        };

    private void LoadToUi()
    {
        LanguageKoreanRadio.IsChecked = Settings.Language != LocalizationService.English;
        LanguageEnglishRadio.IsChecked = Settings.Language == LocalizationService.English;
        CaseSensitiveSearchCheckBox.IsChecked = Settings.CaseSensitiveSearch;
        UseRegexSearchCheckBox.IsChecked = Settings.UseRegexSearch;
        RunAtStartupCheckBox.IsChecked = Settings.RunAtStartup;
        BackgroundPreview.Background = CreateBackgroundBrush();
        BorderPreview.Background = ColorHelper.ToBrush(Settings.BorderColor);
        TextPreview.Foreground = ColorHelper.ToBrush(ColorHelper.ResolveDisplayColors(Settings).TextColor);
        BackgroundOpacitySlider.Value = Settings.BackgroundOpacity;
        WindowOpacitySlider.Value = Settings.WindowOpacity;
        PriorityAboveOthersRadio.IsChecked = Settings.AlwaysOnTop;
        PriorityNormalRadio.IsChecked = !Settings.AlwaysOnTop;
        BuildExcludedDrivesUi();
        LoadExcludedDirectories();
        UpdateOpacityLabels();
    }

    private void BuildExcludedDrivesUi()
    {
        ExcludedDrivesPanel.Children.Clear();
        _driveCheckBoxes.Clear();

        var excluded = new HashSet<string>(
            Settings.ExcludedDrives
                .Select(IndexExclusionPolicy.NormalizeDriveRoot)
                .Where(static root => root is not null)
                .Cast<string>(),
            StringComparer.OrdinalIgnoreCase);

        foreach (var drive in DriveInfo.GetDrives().OrderBy(static d => d.Name))
        {
            if (!drive.IsReady)
                continue;

            var root = IndexExclusionPolicy.NormalizeDriveRoot(drive.Name);
            if (root is null)
                continue;

            var volumeLabel = string.IsNullOrWhiteSpace(drive.VolumeLabel)
                ? string.Empty
                : $" ({drive.VolumeLabel})";

            var checkBox = new System.Windows.Controls.CheckBox
            {
                Content = $"{root}{volumeLabel}",
                IsChecked = excluded.Contains(root),
                Margin = new Thickness(0, 0, 12, 4),
                Tag = root
            };

            _driveCheckBoxes[root] = checkBox;
            ExcludedDrivesPanel.Children.Add(checkBox);
        }
    }

    private void LoadExcludedDirectories()
    {
        ExcludedDirectoriesListBox.Items.Clear();

        foreach (var path in Settings.ExcludedDirectories)
        {
            var display = IndexExclusionPolicy.NormalizeDirectoryDisplay(path);
            if (!string.IsNullOrWhiteSpace(display))
                ExcludedDirectoriesListBox.Items.Add(display);
        }
    }

    private void BrowseExcludedDirectory_Click(object sender, RoutedEventArgs e)
    {
        using var dialog = new Forms.FolderBrowserDialog();
        if (dialog.ShowDialog() != Forms.DialogResult.OK)
            return;

        ExcludedDirectoryTextBox.Text = dialog.SelectedPath;
    }

    private void AddExcludedDirectory_Click(object sender, RoutedEventArgs e)
    {
        var path = ExcludedDirectoryTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(path))
            return;

        var normalized = IndexExclusionPolicy.NormalizeDirectoryPrefix(path);
        if (normalized is null)
            return;

        var display = normalized.TrimEnd('\\');
        var alreadyListed = ExcludedDirectoriesListBox.Items
            .Cast<string>()
            .Any(item =>
            {
                var existing = IndexExclusionPolicy.NormalizeDirectoryPrefix(item);
                return existing is not null
                    && existing.Equals(normalized, StringComparison.OrdinalIgnoreCase);
            });

        if (alreadyListed)
            return;

        ExcludedDirectoriesListBox.Items.Add(display);
        ExcludedDirectoryTextBox.Clear();
    }

    private void RemoveExcludedDirectory_Click(object sender, RoutedEventArgs e)
    {
        if (ExcludedDirectoriesListBox.SelectedItem is not string)
            return;

        ExcludedDirectoriesListBox.Items.Remove(ExcludedDirectoriesListBox.SelectedItem);
    }

    private void SaveExcludedPaths()
    {
        Settings.ExcludedDrives = _driveCheckBoxes
            .Where(static pair => pair.Value.IsChecked == true)
            .Select(static pair => pair.Key)
            .OrderBy(static drive => drive, StringComparer.OrdinalIgnoreCase)
            .ToList();

        Settings.ExcludedDirectories = ExcludedDirectoriesListBox.Items
            .Cast<string>()
            .Select(IndexExclusionPolicy.NormalizeDirectoryDisplay)
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
        var trackWidth = IndexProgressTrack.ActualWidth;
        if (trackWidth > 0)
            IndexProgressFill.Width = trackWidth * snapshot.Percent / 100.0;

        if (snapshot.Percent == _lastProgressPercent
            && string.Equals(snapshot.StatusText, _lastProgressStatus, StringComparison.Ordinal))
        {
            return;
        }

        _lastProgressPercent = snapshot.Percent;
        _lastProgressStatus = snapshot.StatusText;

        IndexProgressPercentLabel.Text = $"{snapshot.Percent}%";
        IndexProgressStatusLabel.Text = snapshot.StatusText;
    }

    private void ReSearch_Click(object sender, RoutedEventArgs e)
    {
        _reSearch?.Invoke();
        UpdateProgressUi();
    }

    private void UpdateOpacityLabels()
    {
        BackgroundOpacityValueLabel.Text = $"{(int)BackgroundOpacitySlider.Value}%";
        WindowOpacityValueLabel.Text = $"{(int)WindowOpacitySlider.Value}%";
    }

    private void PickBackgroundColor_Click(object sender, RoutedEventArgs e)
    {
        if (!TryPickColor(Settings.BackgroundColor, out var hex))
            return;

        Settings.BackgroundColor = hex;
        ColorHelper.SyncThemeTextColors(Settings);
        RefreshThemePreviews();
    }

    private void PickBorderColor_Click(object sender, RoutedEventArgs e)
    {
        if (!TryPickColor(Settings.BorderColor, out var hex))
            return;

        Settings.BorderColor = "#33" + hex.TrimStart('#');
        BorderPreview.Background = ColorHelper.ToBrush(Settings.BorderColor);
    }

    private void PickTextColor_Click(object sender, RoutedEventArgs e)
    {
        if (!TryPickColor(Settings.TextColor, out var hex))
            return;

        Settings.TextColor = hex;
        TextPreview.Foreground = ColorHelper.ToBrush(hex);
    }

    private static bool TryPickColor(string currentHex, out string hex)
    {
        hex = currentHex;
        var current = ColorHelper.ParseColor(currentHex);

        using var dialog = new Forms.ColorDialog
        {
            Color = System.Drawing.Color.FromArgb(current.R, current.G, current.B),
            FullOpen = true
        };

        if (dialog.ShowDialog() != Forms.DialogResult.OK)
            return false;

        hex = ColorHelper.ToHex(MediaColor.FromRgb(dialog.Color.R, dialog.Color.G, dialog.Color.B));
        return true;
    }

    private void PresetBackground_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button { Tag: string hex })
            return;

        Settings.BackgroundColor = hex;
        ColorHelper.SyncThemeTextColors(Settings);
        RefreshThemePreviews();
    }

    private void RefreshThemePreviews()
    {
        BackgroundPreview.Background = CreateBackgroundBrush();
        BorderPreview.Background = ColorHelper.ToBrush(Settings.BorderColor);
        TextPreview.Foreground = ColorHelper.ToBrush(Settings.TextColor);
    }

    private void PresetBorder_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button { Tag: string hex })
            return;

        Settings.BorderColor = "#33" + hex.TrimStart('#');
        BorderPreview.Background = ColorHelper.ToBrush(Settings.BorderColor);
    }

    private void PresetText_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button { Tag: string hex })
            return;

        Settings.TextColor = hex;
        TextPreview.Foreground = ColorHelper.ToBrush(hex);
    }

    private void BackgroundOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;
        BackgroundPreview.Background = CreateBackgroundBrush();
        BackgroundOpacityValueLabel.Text = $"{Settings.BackgroundOpacity}%";
    }

    private void WindowOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        WindowOpacityValueLabel.Text = $"{Settings.WindowOpacity}%";
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        Settings.Language = LanguageEnglishRadio.IsChecked == true
            ? LocalizationService.English
            : LocalizationService.Korean;
        Settings.CaseSensitiveSearch = CaseSensitiveSearchCheckBox.IsChecked == true;
        Settings.UseRegexSearch = UseRegexSearchCheckBox.IsChecked == true;
        Settings.RunAtStartup = RunAtStartupCheckBox.IsChecked == true;
        SaveExcludedPaths();
        Settings.AlwaysOnTop = PriorityAboveOthersRadio.IsChecked == true;
        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;

        var display = ColorHelper.ResolveDisplayColors(Settings);
        Settings.TextColor = display.TextColor;
        Settings.SubTextColor = display.SubTextColor;
        Settings.BorderColor = display.BorderColor;

        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
