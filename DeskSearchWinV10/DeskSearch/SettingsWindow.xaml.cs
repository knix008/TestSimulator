using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;
using Forms = System.Windows.Forms;
using MediaColor = System.Windows.Media.Color;

namespace DeskSearch;

public partial class SettingsWindow : Window
{
    public AppSettings Settings { get; private set; }

    public SettingsWindow(AppSettings current)
    {
        Settings = current.Clone();
        InitializeComponent();
        BuildColorSwatches();
        ApplyLocalization();
        LoadToUi();
    }

    private void BuildColorSwatches()
    {
        PopulateSwatches(BackgroundSwatchPanel, SettingsColorPalette.PastelSwatches, PresetBackground_Click);
        PopulateSwatches(BorderSwatchPanel, SettingsColorPalette.PastelSwatches, PresetBorder_Click);
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
        BackgroundColorLabel.Text = LocalizationService.T("Settings_BackgroundColor");
        PickBackgroundColorButton.Content = LocalizationService.T("Settings_PickColor");
        BackgroundOpacityLabel.Text = LocalizationService.T("Settings_BackgroundOpacity");
        BorderColorLabel.Text = LocalizationService.T("Settings_BorderColor");
        PickBorderColorButton.Content = LocalizationService.T("Settings_PickColor");
        TextColorLabel.Text = LocalizationService.T("Settings_TextColor");
        PickTextColorButton.Content = LocalizationService.T("Settings_PickColor");
        TextPreview.Text = LocalizationService.T("Settings_SearchPreview");
        WindowOpacityLabel.Text = LocalizationService.T("Settings_WindowOpacity");
        DisplayPriorityLabel.Text = LocalizationService.T("Settings_DisplayPriority");
        PriorityAboveOthersRadio.Content = LocalizationService.T("Settings_AboveOthers");
        AboveOthersDescLabel.Text = LocalizationService.T("Settings_AboveOthersDesc");
        PriorityNormalRadio.Content = LocalizationService.T("Settings_NormalPriority");
        NormalPriorityDescLabel.Text = LocalizationService.T("Settings_NormalPriorityDesc");
        CancelButton.Content = LocalizationService.T("Settings_Cancel");
        SaveButton.Content = LocalizationService.T("Settings_Save");
    }

    private void LoadToUi()
    {
        LanguageKoreanRadio.IsChecked = Settings.Language != LocalizationService.English;
        LanguageEnglishRadio.IsChecked = Settings.Language == LocalizationService.English;
        BackgroundPreview.Background = CreateBackgroundBrush();
        BorderPreview.Background = ColorHelper.ToBrush(Settings.BorderColor);
        TextPreview.Foreground = ColorHelper.ToBrush(Settings.TextColor);
        BackgroundOpacitySlider.Value = Settings.BackgroundOpacity;
        WindowOpacitySlider.Value = Settings.WindowOpacity;
        PriorityAboveOthersRadio.IsChecked = Settings.AlwaysOnTop;
        PriorityNormalRadio.IsChecked = !Settings.AlwaysOnTop;
        UpdateOpacityLabels();
    }

    private SolidColorBrush CreateBackgroundBrush()
    {
        var rgb = ColorHelper.ParseColor(Settings.BackgroundColor);
        var withAlpha = ColorHelper.WithOpacity(rgb, Settings.BackgroundOpacity);
        var brush = new SolidColorBrush(withAlpha);
        brush.Freeze();
        return brush;
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
        BackgroundPreview.Background = CreateBackgroundBrush();
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
        BackgroundPreview.Background = CreateBackgroundBrush();
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

    private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;

        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;
        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        BackgroundPreview.Background = CreateBackgroundBrush();
        UpdateOpacityLabels();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        Settings.Language = LanguageEnglishRadio.IsChecked == true
            ? LocalizationService.English
            : LocalizationService.Korean;
        Settings.AlwaysOnTop = PriorityAboveOthersRadio.IsChecked == true;
        Settings.BackgroundOpacity = (int)BackgroundOpacitySlider.Value;
        Settings.WindowOpacity = (int)WindowOpacitySlider.Value;
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
