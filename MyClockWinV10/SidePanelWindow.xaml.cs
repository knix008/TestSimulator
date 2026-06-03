using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using MyClockWinV10.Models;
using MyClockWinV10.Services;
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
    public Action? OnSettingsChanged;

    private const double TargetWidth = 400;

    private bool _panelOpensRight = true;

    private readonly ObservableCollection<TimerItem> _timers;
    private readonly AlarmSoundPlayer _sounds;
    private bool _suppressSoundComboChange;

    private readonly List<RadioButton> _digitalStyleRadios = new();
    private readonly List<RadioButton> _analogStyleRadios  = new();

    private static readonly int[] BrightnessScaleValues =
        [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

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

    public SidePanelWindow(
        ObservableCollection<AlarmItem> alarms,
        ObservableCollection<TimerItem> timers,
        AlarmSoundPlayer sounds)
    {
        _timers = timers;
        _sounds = sounds;
        InitializeComponent();
        AlarmList.ItemsSource  = alarms;
        TimerList.ItemsSource  = timers;
        BuildColorSwatches();
        BuildClockStyleRadios();
        BuildAlarmSoundCombo();
        WorldPanel.EntriesChanged += () => OnSettingsChanged?.Invoke();
    }

    public void ApplyPanelSide(bool openRight)
    {
        _panelOpensRight = openRight;
        PanelChromeBorder.BorderThickness = openRight
            ? new Thickness(1, 0, 0, 0)
            : new Thickness(0, 0, 1, 0);
    }

    private void BuildAlarmSoundCombo()
    {
        AlarmSoundCombo.ItemsSource = AlarmSoundCatalog.All;
        AlarmSoundCombo.DisplayMemberPath = nameof(AlarmSoundOption.Label);
        AlarmSoundCombo.SelectedValuePath = nameof(AlarmSoundOption.Id);
    }

    // ── Open / close animation ─────────────────────────────────────────────

    public void AnimateOpen(bool openRight)
    {
        ApplyPanelSide(openRight);
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

    // ── Timers ────────────────────────────────────────────────────────────

    private void AddTimer_Click(object sender, RoutedEventArgs e)
    {
        _timers.Add(new TimerItem(0, 5, 0));
        OnSettingsChanged?.Invoke();
    }

    private void DeleteTimer_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is not TimerItem item) return;
        item.Service.Stop();
        _timers.Remove(item);
        if (_timers.Count == 0)
            _timers.Add(new TimerItem(0, 5, 0));
        OnSettingsChanged?.Invoke();
    }

    private void TimerStart_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is not TimerItem item) return;
        if (item.IsIdle) item.ApplyDuration();
        item.Service.Start();
        OnSettingsChanged?.Invoke();
    }

    private void TimerPause_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item)
            item.Service.Pause();
    }

    private void TimerStop_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item)
            item.Service.Stop();
    }

    private void TimerHoursUp_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Hours = Math.Min(99, item.Hours + 1); item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
    }
    private void TimerHoursDown_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Hours = Math.Max(0, item.Hours - 1); item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
    }
    private void TimerMinutesUp_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Minutes = (item.Minutes + 1) % 60; item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
    }
    private void TimerMinutesDown_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Minutes = (item.Minutes + 59) % 60; item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
    }
    private void TimerSecondsUp_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Seconds = (item.Seconds + 1) % 60; item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
    }
    private void TimerSecondsDown_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is TimerItem item && item.IsIdle)
        { item.Seconds = (item.Seconds + 59) % 60; item.ApplyDuration(); OnSettingsChanged?.Invoke(); }
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

    private void BrightnessSlider_Layout(object sender, RoutedEventArgs e)
        => UpdateBrightnessScaleLabels();

    private void UpdateBrightnessScaleLabels()
    {
        if (BrightnessScaleCanvas is null || BrightnessSlider is null) return;

        double width = BrightnessSlider.ActualWidth;
        if (width < 1) return;

        BrightnessScaleCanvas.Children.Clear();
        BrightnessScaleCanvas.Width = width;

        double inset = GetSliderThumbHalfWidth(BrightnessSlider);
        double track = Math.Max(0, width - inset * 2);
        double min   = BrightnessSlider.Minimum;
        double max   = BrightnessSlider.Maximum;
        double span  = max - min;
        if (span <= 0) return;

        var labelBrush = TryFindResource("SubtleForegroundBrush") as Brush ?? Brushes.Gray;

        foreach (int value in BrightnessScaleValues)
        {
            double t = (value - min) / span;
            double x = inset + t * track;

            var label = new TextBlock
            {
                Text       = value.ToString(),
                FontSize   = 10,
                Foreground = labelBrush
            };
            label.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            double w    = label.DesiredSize.Width;
            double left = Math.Clamp(x - w / 2, 0, width - w);
            Canvas.SetLeft(label, left);
            Canvas.SetTop(label, 0);
            BrightnessScaleCanvas.Children.Add(label);
        }
    }

    private static double GetSliderThumbHalfWidth(Slider slider)
    {
        slider.ApplyTemplate();
        if (slider.Template?.FindName("Thumb", slider) is FrameworkElement thumb)
        {
            thumb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            if (thumb.DesiredSize.Width > 0)
                return thumb.DesiredSize.Width / 2;
            if (thumb.ActualWidth > 0)
                return thumb.ActualWidth / 2;
        }
        return 9;
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
                              string digitalStyle, string analogStyle,
                              string alarmSoundId, int alarmVolume)
    {
        Format12h.Checked       -= Format_Checked;
        Format24h.Checked       -= Format_Checked;
        WorldFormat12h.Checked  -= WorldFormat_Checked;
        WorldFormat24h.Checked  -= WorldFormat_Checked;
        StartupToggle.Checked   -= Startup_Changed;
        StartupToggle.Unchecked -= Startup_Changed;
        SetClockStyleHandlers(enabled: false);
        (use24h ? Format24h : Format12h).IsChecked                = true;
        (worldUse24h ? WorldFormat24h : WorldFormat12h).IsChecked = true;
        BrightnessSlider.Value  = Math.Clamp(brightness, 0, 100);
        Dispatcher.BeginInvoke(UpdateBrightnessScaleLabels, System.Windows.Threading.DispatcherPriority.Loaded);
        StartupToggle.IsChecked = IsStartupEnabled();

        _suppressSoundComboChange = true;
        AlarmSoundCombo.SelectedValue = AlarmSoundCatalog.IsValid(alarmSoundId)
            ? alarmSoundId : AlarmSoundCatalog.DefaultId;
        _suppressSoundComboChange = false;
        AlarmVolumeSlider.Value = Math.Clamp(alarmVolume, 0, 100);
        SelectStyleRadio(_digitalStyleRadios, digitalStyle, nameof(DigitalStyle.SevenSegment));
        SelectStyleRadio(_analogStyleRadios,  analogStyle,  nameof(AnalogStyle.Classic));
        SetClockStyleHandlers(enabled: true);

        Format12h.Checked       += Format_Checked;
        Format24h.Checked       += Format_Checked;
        WorldFormat12h.Checked  += WorldFormat_Checked;
        WorldFormat24h.Checked  += WorldFormat_Checked;
        StartupToggle.Checked   += Startup_Changed;
        StartupToggle.Unchecked += Startup_Changed;
    }

    private void Startup_Changed(object sender, RoutedEventArgs e)
        => SetStartup(StartupToggle.IsChecked == true);

    private void Reset_Click(object sender, RoutedEventArgs e)
        => OnResetRequested?.Invoke();

    private void AlarmSoundCombo_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressSoundComboChange || AlarmSoundCombo.SelectedValue is not string id) return;
        _sounds.SoundId = id;
        OnSettingsChanged?.Invoke();
    }

    private void AlarmVolume_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (AlarmVolumeLabel is null) return;
        int pct = (int)Math.Round(e.NewValue);
        AlarmVolumeLabel.Text = $"{pct} %";
        _sounds.Volume = pct / 100.0;
        OnSettingsChanged?.Invoke();
    }

    private void PreviewAlarmSound_Click(object sender, RoutedEventArgs e)
        => _sounds.Preview();

    private void BuildClockStyleRadios()
    {
        BuildStyleRadioGroup(DigitalStylePanel, "DigStyle", ClockStyleCatalog.Digital,
            _digitalStyleRadios, DigStyle_Checked, isFirstDefault: true);
        BuildStyleRadioGroup(AnalogStylePanel, "AnaStyle", ClockStyleCatalog.Analog,
            _analogStyleRadios, AnaStyle_Checked, isFirstDefault: true);
    }

    private static void BuildStyleRadioGroup(
        Panel panel, string groupName, IReadOnlyList<ClockStyleOption> options,
        List<RadioButton> store, RoutedEventHandler handler, bool isFirstDefault)
    {
        for (int i = 0; i < options.Count; i++)
        {
            var opt = options[i];
            var rb = new RadioButton
            {
                Content   = opt.Label,
                Tag       = opt.Id,
                GroupName = groupName,
                FontSize  = 13,
                Margin    = new Thickness(0, 0, 10, 6),
                IsChecked = isFirstDefault && i == 0
            };
            rb.Checked += handler;
            store.Add(rb);
            panel.Children.Add(rb);
        }
    }

    private void SetClockStyleHandlers(bool enabled)
    {
        foreach (var rb in _digitalStyleRadios)
        {
            rb.Checked -= DigStyle_Checked;
            if (enabled) rb.Checked += DigStyle_Checked;
        }
        foreach (var rb in _analogStyleRadios)
        {
            rb.Checked -= AnaStyle_Checked;
            if (enabled) rb.Checked += AnaStyle_Checked;
        }
    }

    private static void SelectStyleRadio(List<RadioButton> radios, string id, string fallbackId)
    {
        string target = radios.Any(r => (string?)r.Tag == id) ? id : fallbackId;
        foreach (var rb in radios)
            rb.IsChecked = (string?)rb.Tag == target;
    }

    private void DigStyle_Checked(object sender, RoutedEventArgs e)
    {
        if (_digitalStyleRadios.Count == 0) return;
        var id = _digitalStyleRadios.FirstOrDefault(r => r.IsChecked == true)?.Tag as string;
        if (id is not null) OnDigitalStyleChanged?.Invoke(id);
    }

    private void AnaStyle_Checked(object sender, RoutedEventArgs e)
    {
        if (_analogStyleRadios.Count == 0) return;
        var id = _analogStyleRadios.FirstOrDefault(r => r.IsChecked == true)?.Tag as string;
        if (id is not null) OnAnalogStyleChanged?.Invoke(id);
    }
}
