using System;
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using MyClockWinV10.Models;
using static MyClockWinV10.Models.SettingsManager;

namespace MyClockWinV10;

public partial class SidePanelWindow : Window
{
    public Action<string>? OnThemeRequested;
    public Action<bool>?   OnFormatChanged;
    public Action<bool>?   OnWorldFormatChanged;
    public Action<double>? OnBrightnessChanged;
    public Action<Color>?  OnDigitColorChanged;
    public Action?         OnResetRequested;
    public Action<string>? OnDigitalStyleChanged;
    public Action<string>? OnAnalogStyleChanged;

    private const double TargetWidth = 400;

    private static readonly (string Label, Color Color)[] DigitColors =
    [
        ("청색", Color.FromRgb(0x58, 0xA6, 0xFF)),
        ("녹색", Color.FromRgb(0x00, 0xE6, 0x76)),
        ("적색", Color.FromRgb(0xFF, 0x44, 0x44)),
        ("주황", Color.FromRgb(0xFF, 0xC1, 0x07)),
        ("보라", Color.FromRgb(0xCC, 0x44, 0xFF)),
        ("청록", Color.FromRgb(0x64, 0xFF, 0xDA)),
        ("흰색", Color.FromRgb(0xFF, 0xFF, 0xFF)),
        ("분홍", Color.FromRgb(0xFF, 0x80, 0xAB)),
    ];

    public SidePanelWindow(ObservableCollection<AlarmItem> alarms)
    {
        InitializeComponent();
        AlarmList.ItemsSource = alarms;
        BuildColorSwatches();
    }

    // ── Open / close animation (Width expands/collapses rightward) ────────

    public void AnimateOpen(bool openRight)
    {
        var easing = new CubicEase { EasingMode = EasingMode.EaseOut };
        var dur    = TimeSpan.FromMilliseconds(220);

        if (openRight)
        {
            var anim = new DoubleAnimation { From = 1, To = TargetWidth, Duration = dur, EasingFunction = easing };
            anim.Completed += (_, _) => { BeginAnimation(WidthProperty, null); Width = TargetWidth; };
            BeginAnimation(WidthProperty, anim);
        }
        else
        {
            // Expand leftward: right edge is fixed at (Left+1), animate Width + Left in sync
            double rightEdge = Left + 1;
            var wAnim = new DoubleAnimation { From = 1, To = TargetWidth, Duration = dur, EasingFunction = easing };
            wAnim.Completed += (_, _) =>
            {
                BeginAnimation(WidthProperty, null);
                BeginAnimation(LeftProperty,  null);
                Width = TargetWidth;
                Left  = rightEdge - TargetWidth;
            };
            BeginAnimation(WidthProperty, wAnim);
            BeginAnimation(LeftProperty,  new DoubleAnimation { From = Left, To = rightEdge - TargetWidth, Duration = dur, EasingFunction = easing });
        }
    }

    public void AnimateClose(bool openRight, Action? onComplete = null)
    {
        var easing = new CubicEase { EasingMode = EasingMode.EaseIn };
        var dur    = TimeSpan.FromMilliseconds(180);

        if (openRight)
        {
            var anim = new DoubleAnimation { From = Width, To = 1, Duration = dur, EasingFunction = easing };
            anim.Completed += (_, _) => onComplete?.Invoke();
            BeginAnimation(WidthProperty, anim);
        }
        else
        {
            // Collapse leftward: right edge fixed, animate Width + Left in sync
            double rightEdge = Left + Width;
            var wAnim = new DoubleAnimation { From = Width, To = 1, Duration = dur, EasingFunction = easing };
            wAnim.Completed += (_, _) => { BeginAnimation(WidthProperty, null); BeginAnimation(LeftProperty, null); onComplete?.Invoke(); };
            BeginAnimation(WidthProperty, wAnim);
            BeginAnimation(LeftProperty,  new DoubleAnimation { From = Left, To = rightEdge - 1, Duration = dur, EasingFunction = easing });
        }
    }

    // ── World time ────────────────────────────────────────────────────────

    public void UpdateTimes(bool use24h)
    {
        WorldPanel.UpdateTimes(use24h);
        WorldHeaderText.Text = use24h ? "24시간 표시" : "12시간 표시";
    }

    // ── Alarms ────────────────────────────────────────────────────────────

    private void AddAlarm_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new AddAlarmDialog { Owner = Owner ?? this };
        if (dlg.ShowDialog() == true && dlg.Result is not null)
            ((ObservableCollection<AlarmItem>)AlarmList.ItemsSource!).Add(dlg.Result);
    }

    private void EditAlarm_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is AlarmItem alarm)
            new AddAlarmDialog(alarm) { Owner = Owner ?? this }.ShowDialog();
    }

    private void DeleteAlarm_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is AlarmItem alarm)
            ((ObservableCollection<AlarmItem>)AlarmList.ItemsSource!).Remove(alarm);
    }

    // ── Settings ──────────────────────────────────────────────────────────

    private void Format_Checked(object sender, RoutedEventArgs e)
        => OnFormatChanged?.Invoke(Format24h?.IsChecked == true);

    private void WorldFormat_Checked(object sender, RoutedEventArgs e)
        => OnWorldFormatChanged?.Invoke(WorldFormat24h?.IsChecked == true);

    private void Theme_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string name)
            OnThemeRequested?.Invoke(name);
    }

    private void Brightness_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (BrightnessLabel is null) return;
        var slider = (Slider)sender;
        int pct = (int)Math.Round(e.NewValue);
        if (Math.Abs(slider.Value - pct) > 0.001) { slider.Value = pct; return; }
        BrightnessLabel.Text = $"{pct} %";
        OnBrightnessChanged?.Invoke(pct / 100.0);
    }

    private void BuildColorSwatches()
    {
        foreach (var (label, color) in DigitColors)
        {
            var btn = new Button
            {
                Width           = 66,
                Height          = 36,
                Content         = label,
                FontSize        = 12,
                Background      = new SolidColorBrush(color),
                Foreground      = IsLight(color) ? Brushes.Black : Brushes.White,
                BorderThickness = new Thickness(0),
                Margin          = new Thickness(0, 0, 5, 5),
                Cursor          = Cursors.Hand,
                Tag             = color
            };
            btn.Click += (s, _) => { if (s is Button b && b.Tag is Color c) OnDigitColorChanged?.Invoke(c); };
            ColorSwatches.Children.Add(btn);
        }
    }

    private static bool IsLight(Color c)
        => (c.R * 299 + c.G * 587 + c.B * 114) / 1000 > 128;

    // ── Settings sync (called from MainWindow) ────────────────────────────

    public void ApplySettings(bool use24h, bool worldUse24h, int brightness,
                              string digitalStyle, string analogStyle)
    {
        Format12h.Checked       -= Format_Checked;
        Format24h.Checked       -= Format_Checked;
        WorldFormat12h.Checked  -= WorldFormat_Checked;
        WorldFormat24h.Checked  -= WorldFormat_Checked;
        StartupToggle.Checked   -= Startup_Changed;
        StartupToggle.Unchecked -= Startup_Changed;
        DigStyleSeg.Checked     -= DigStyle_Checked;
        DigStyleLcd.Checked     -= DigStyle_Checked;
        DigStyleMin.Checked     -= DigStyle_Checked;
        AnaStyleClassic.Checked -= AnaStyle_Checked;
        AnaStyleMinimal.Checked -= AnaStyle_Checked;
        AnaStyleRoman.Checked   -= AnaStyle_Checked;
        AnaStyleIndices.Checked -= AnaStyle_Checked;

        (use24h ? Format24h : Format12h).IsChecked                = true;
        (worldUse24h ? WorldFormat24h : WorldFormat12h).IsChecked = true;
        BrightnessSlider.Value  = brightness;
        StartupToggle.IsChecked = IsStartupEnabled();
        (digitalStyle switch { "LcdText" => DigStyleLcd, "Minimal" => DigStyleMin, _ => DigStyleSeg }).IsChecked = true;
        (analogStyle  switch { "Minimal" => AnaStyleMinimal, "Roman" => AnaStyleRoman, "Indices" => AnaStyleIndices, _ => AnaStyleClassic }).IsChecked = true;

        Format12h.Checked       += Format_Checked;
        Format24h.Checked       += Format_Checked;
        WorldFormat12h.Checked  += WorldFormat_Checked;
        WorldFormat24h.Checked  += WorldFormat_Checked;
        StartupToggle.Checked   += Startup_Changed;
        StartupToggle.Unchecked += Startup_Changed;
        DigStyleSeg.Checked     += DigStyle_Checked;
        DigStyleLcd.Checked     += DigStyle_Checked;
        DigStyleMin.Checked     += DigStyle_Checked;
        AnaStyleClassic.Checked += AnaStyle_Checked;
        AnaStyleMinimal.Checked += AnaStyle_Checked;
        AnaStyleRoman.Checked   += AnaStyle_Checked;
        AnaStyleIndices.Checked += AnaStyle_Checked;
    }

    private void Startup_Changed(object sender, RoutedEventArgs e)
        => SetStartup(StartupToggle.IsChecked == true);

    private void Reset_Click(object sender, RoutedEventArgs e)
        => OnResetRequested?.Invoke();

    private void DigStyle_Checked(object sender, RoutedEventArgs e)
    {
        if (DigStyleSeg is null) return;
        string style = DigStyleSeg.IsChecked == true ? "SevenSegment"
                     : DigStyleLcd.IsChecked == true ? "LcdText"
                     : "Minimal";
        OnDigitalStyleChanged?.Invoke(style);
    }

    private void AnaStyle_Checked(object sender, RoutedEventArgs e)
    {
        if (AnaStyleClassic is null) return;
        string style = AnaStyleClassic.IsChecked == true ? "Classic"
                     : AnaStyleMinimal.IsChecked == true ? "Minimal"
                     : AnaStyleRoman.IsChecked   == true ? "Roman"
                     : "Indices";
        OnAnalogStyleChanged?.Invoke(style);
    }
}
