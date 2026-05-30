using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class MainWindow : Window
{
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr hIcon);

    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly ObservableCollection<AlarmItem> _alarms = new();
    private readonly HashSet<Guid> _firedAlarms = new();

    private bool _isDigital    = true;
    private bool _use24h       = false;
    private bool _worldUse24h  = false;
    private bool _rightVisible = false;

    private System.Windows.Forms.NotifyIcon? _trayIcon;
    private IntPtr _trayIconHandle = IntPtr.Zero;

    private System.Windows.Media.Color _digitColor =
        System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF);

    private static readonly (string Label, System.Windows.Media.Color Color)[] DigitColors =
    [
        ("청색",   System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF)),
        ("녹색",   System.Windows.Media.Color.FromRgb(0x00, 0xE6, 0x76)),
        ("적색",   System.Windows.Media.Color.FromRgb(0xFF, 0x44, 0x44)),
        ("주황",   System.Windows.Media.Color.FromRgb(0xFF, 0xC1, 0x07)),
        ("보라",   System.Windows.Media.Color.FromRgb(0xCC, 0x44, 0xFF)),
        ("청록",   System.Windows.Media.Color.FromRgb(0x64, 0xFF, 0xDA)),
        ("흰색",   System.Windows.Media.Color.FromRgb(0xFF, 0xFF, 0xFF)),
        ("분홍",   System.Windows.Media.Color.FromRgb(0xFF, 0x80, 0xAB)),
    ];

    public MainWindow()
    {
        InitializeComponent();
        AlarmList.ItemsSource = _alarms;
        BuildColorSwatches();
        SetActiveClockBtn(digital: true);
        InitTrayIcon();

        _timer.Tick += OnTick;
        _timer.Start();
        OnTick(null, EventArgs.Empty);
    }

    // ── System tray ───────────────────────────────────────────────────────

    private void InitTrayIcon()
    {
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("열기", null, (_, _) => RestoreFromTray());
        menu.Items.Add("닫기", null, (_, _) => Dispatcher.Invoke(Close));

        _trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Text             = "MyClock",
            Visible          = false,
            ContextMenuStrip = menu
        };
        _trayIcon.DoubleClick += (_, _) => RestoreFromTray();
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        if (WindowState == WindowState.Minimized)
        {
            Hide();
            UpdateTrayIcon(DateTime.Now);
            _trayIcon!.Visible = true;
        }
    }

    private void RestoreFromTray()
    {
        Dispatcher.Invoke(() =>
        {
            _trayIcon!.Visible = false;
            Show();
            WindowState = WindowState.Normal;
            Activate();
        });
    }

    private void UpdateTrayIcon(DateTime now)
    {
        if (_trayIcon == null) return;

        using var bmp = new Bitmap(32, 32);
        using var g   = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(System.Drawing.Color.Transparent);

        float cx = 15.5f, cy = 15.5f, r = 14f;

        g.FillEllipse(new SolidBrush(System.Drawing.Color.FromArgb(30, 30, 60)),
                      cx - r, cy - r, r * 2, r * 2);
        g.DrawEllipse(new System.Drawing.Pen(System.Drawing.Color.FromArgb(100, 140, 220), 1.5f),
                      cx - r, cy - r, r * 2, r * 2);

        for (int i = 0; i < 12; i++)
        {
            double a = i * 30 * Math.PI / 180;
            bool major = i % 3 == 0;
            float ox = cx + (r - 2)             * (float)Math.Sin(a);
            float oy = cy - (r - 2)             * (float)Math.Cos(a);
            float ix = cx + (major ? r-6 : r-4) * (float)Math.Sin(a);
            float iy = cy - (major ? r-6 : r-4) * (float)Math.Cos(a);
            g.DrawLine(new System.Drawing.Pen(System.Drawing.Color.FromArgb(160, 180, 240), major ? 1.5f : 1f),
                       ox, oy, ix, iy);
        }

        double secA = now.Second                * 6      * Math.PI / 180;
        double minA = (now.Minute + now.Second  / 60.0)  * 6      * Math.PI / 180;
        double hrA  = ((now.Hour % 12) + now.Minute / 60.0) * 30  * Math.PI / 180;

        g.DrawLine(new System.Drawing.Pen(System.Drawing.Color.White, 2.2f),
                   cx, cy, cx + r * 0.50f * (float)Math.Sin(hrA), cy - r * 0.50f * (float)Math.Cos(hrA));
        g.DrawLine(new System.Drawing.Pen(System.Drawing.Color.FromArgb(140, 180, 255), 1.5f),
                   cx, cy, cx + r * 0.75f * (float)Math.Sin(minA), cy - r * 0.75f * (float)Math.Cos(minA));
        g.DrawLine(new System.Drawing.Pen(System.Drawing.Color.Red, 1f),
                   cx, cy, cx + r * 0.85f * (float)Math.Sin(secA), cy - r * 0.85f * (float)Math.Cos(secA));
        g.FillEllipse(new SolidBrush(System.Drawing.Color.Red), cx - 2, cy - 2, 4, 4);

        IntPtr newHandle = bmp.GetHicon();
        var    oldIcon   = _trayIcon.Icon;

        _trayIcon.Icon = System.Drawing.Icon.FromHandle(newHandle);

        oldIcon?.Dispose();
        if (_trayIconHandle != IntPtr.Zero)
            DestroyIcon(_trayIconHandle);
        _trayIconHandle = newHandle;
    }

    protected override void OnClosed(EventArgs e)
    {
        _trayIcon?.Dispose();
        if (_trayIconHandle != IntPtr.Zero) DestroyIcon(_trayIconHandle);
        base.OnClosed(e);
    }

    // ── Timer ─────────────────────────────────────────────────────────────

    private void OnTick(object? sender, EventArgs e)
    {
        var now = DateTime.Now;
        HeaderDateText.Text = now.ToString("yyyy년 MM월 dd일  ddd");

        if (_isDigital) UpdateDigital(now);
        else            UpdateAnalog(now);

        WorldPanel.UpdateTimes(_worldUse24h);
        CheckAlarms(now);

        if (_trayIcon?.Visible == true)
            UpdateTrayIcon(now);
    }

    private void UpdateDigital(DateTime now)
    {
        if (_use24h)
        {
            SevenSeg.Text = now.ToString("HH:mm:ss");
            AmPmText.Text = "";
        }
        else
        {
            SevenSeg.Text = now.ToString("hh:mm:ss");
            AmPmText.Text = now.Hour < 12 ? "오전" : "오후";
        }
        ClockStatusText.Text = "";
    }

    private void UpdateAnalog(DateTime now)
    {
        AnalogClock.DrawClock(now);
        ClockStatusText.Text = _use24h
            ? now.ToString("HH:mm:ss")
            : now.ToString("tt hh:mm:ss");
    }

    // ── Alarms ────────────────────────────────────────────────────────────

    private void CheckAlarms(DateTime now)
    {
        var current = new TimeSpan(now.Hour, now.Minute, 0);
        foreach (var alarm in _alarms)
        {
            if (!alarm.IsEnabled) continue;
            if (alarm.Time == current && now.Second == 0 && _firedAlarms.Add(alarm.Id))
                FireAlarm(alarm);
            else if (alarm.Time != current)
                _firedAlarms.Remove(alarm.Id);
        }
    }

    private void FireAlarm(AlarmItem alarm)
    {
        System.Media.SystemSounds.Exclamation.Play();
        new AlarmNotificationWindow($"{alarm.Time.Hours:D2}:{alarm.Time.Minutes:D2}", alarm.Label)
        { Owner = this }.Show();
    }

    private void AddAlarm_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new AddAlarmDialog { Owner = this };
        if (dlg.ShowDialog() == true && dlg.Result is not null)
            _alarms.Add(dlg.Result);
    }

    private void DeleteAlarm_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is AlarmItem alarm)
            _alarms.Remove(alarm);
    }

    // ── Clock mode ────────────────────────────────────────────────────────

    private void DigitalBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = true;
        DigitalPanel.Visibility   = Visibility.Visible;
        AnalogClockBox.Visibility = Visibility.Collapsed;
        ClockStatusText.Text      = "";
        SetActiveClockBtn(digital: true);
        UpdateDigital(DateTime.Now);
    }

    private void AnalogBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = false;
        DigitalPanel.Visibility   = Visibility.Collapsed;
        AnalogClockBox.Visibility = Visibility.Visible;
        SetActiveClockBtn(digital: false);
        UpdateAnalog(DateTime.Now);
    }

    private void SetActiveClockBtn(bool digital)
    {
        var accent   = TryFindResource("AccentBrush")           as System.Windows.Media.Brush;
        var accentFg = TryFindResource("ActiveBtnFgBrush")      as System.Windows.Media.Brush;
        var normal   = TryFindResource("ButtonBackgroundBrush") as System.Windows.Media.Brush;
        var normalFg = TryFindResource("ButtonForegroundBrush") as System.Windows.Media.Brush;

        DigitalBtn.Background = digital ? accent   : normal;
        DigitalBtn.Foreground = digital ? accentFg : normalFg;
        AnalogBtn.Background  = digital ? normal   : accent;
        AnalogBtn.Foreground  = digital ? normalFg : accentFg;
    }

    // ── Settings ─────────────────────────────────────────────────────────

    private void Format_Checked(object sender, RoutedEventArgs e)
        => _use24h = Format24h?.IsChecked == true;

    private void WorldFormat_Checked(object sender, RoutedEventArgs e)
    {
        _worldUse24h = WorldFormat24h?.IsChecked == true;
        WorldHeaderText.Text = _worldUse24h ? "24시간 표시" : "12시간 표시";
    }

    private void Theme_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string name)
            ApplyTheme(name);
    }

    private void Brightness_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (BrightnessLabel is null) return;
        var slider = (Slider)sender;
        int pct = (int)Math.Round(e.NewValue);
        if (Math.Abs(slider.Value - pct) > 0.001)
        {
            slider.Value = pct;
            return;
        }
        BrightnessLabel.Text = $"{pct} %";
        ApplyBrightness(pct / 100.0);
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
                Foreground      = IsLight(color) ? System.Windows.Media.Brushes.Black : System.Windows.Media.Brushes.White,
                BorderThickness = new Thickness(0),
                Margin          = new Thickness(0, 0, 5, 5),
                Cursor          = Cursors.Hand,
                Tag             = color
            };
            btn.Click += ColorSwatch_Click;
            ColorSwatches.Children.Add(btn);
        }
    }

    private void ColorSwatch_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is System.Windows.Media.Color c)
            ApplyDigitColor(c);
    }

    private static bool IsLight(System.Windows.Media.Color c)
        => (c.R * 299 + c.G * 587 + c.B * 114) / 1000 > 128;

    // ── Theme & display ───────────────────────────────────────────────────

    private void ApplyTheme(string name)
    {
        var dicts = Application.Current.Resources.MergedDictionaries;
        dicts[0] = new ResourceDictionary
        {
            Source = new Uri($"Themes/{name}.xaml", UriKind.Relative)
        };
        SetActiveClockBtn(_isDigital);
        ApplyDigitColor(_digitColor);
    }

    private void ApplyDigitColor(System.Windows.Media.Color c)
    {
        _digitColor = c;
        var brush = new SolidColorBrush(c);
        SevenSeg.SegColor = brush;
        Application.Current.Resources["DigitalTextBrush"] = brush;
    }

    private void ApplyBrightness(double v) => SevenSeg.Opacity = v;

    // ── Panel toggle ──────────────────────────────────────────────────────

    private void PanelToggle_Click(object sender, RoutedEventArgs e)
    {
        _rightVisible = !_rightVisible;
        PanelToggleBtn.Content = _rightVisible ? "◀" : "▶";
        AnimateRightPanel(_rightVisible);
    }

    private void AnimateRightPanel(bool open)
    {
        // Panel is always 400px wide; window grows/shrinks by exactly 400.
        // Clock column is Width="*" so it fills the remainder automatically.
        double borderTarget = open ? 400 : 0;
        double windowTarget = open ? Width + 400 : Width - 400;

        // Enforce minimum: clock min 300 + panel 400 when open, clock min 300 when closed.
        MinWidth = open ? 700 : 300;

        var ease = open
            ? (IEasingFunction)new CubicEase { EasingMode = EasingMode.EaseOut }
            : new CubicEase { EasingMode = EasingMode.EaseIn };
        var dur = TimeSpan.FromMilliseconds(220);

        var borderAnim = new DoubleAnimation { To = borderTarget, Duration = dur, EasingFunction = ease };
        borderAnim.Completed += (_, _) =>
        {
            RightPanelBorder.BeginAnimation(Border.WidthProperty, null);
            RightPanelBorder.Width = borderTarget;
        };

        var windowAnim = new DoubleAnimation { To = windowTarget, Duration = dur, EasingFunction = ease };
        windowAnim.Completed += (_, _) =>
        {
            BeginAnimation(Window.WidthProperty, null);
            Width = windowTarget;
        };

        RightPanelBorder.BeginAnimation(Border.WidthProperty, borderAnim);
        BeginAnimation(Window.WidthProperty, windowAnim);
    }

    // ── Window chrome ─────────────────────────────────────────────────────

    private void Caption_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
            DragMove();
    }

    private void MinBtn_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState.Minimized;

    private void MaxBtn_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;

    private void CloseBtn_Click(object sender, RoutedEventArgs e)
        => Close();
}
