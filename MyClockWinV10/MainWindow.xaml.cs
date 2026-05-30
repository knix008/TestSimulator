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
using System.Windows.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class MainWindow : Window
{
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr hIcon);

    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly ObservableCollection<AlarmItem> _alarms = new();
    private readonly HashSet<Guid> _firedAlarms = new();

    private bool _isDigital   = true;
    private bool _use24h      = false;
    private bool _worldUse24h = false;
    private bool _rightVisible = false;

    private SidePanelWindow? _sidePanel;

    private System.Windows.Forms.NotifyIcon? _trayIcon;
    private IntPtr _trayIconHandle = IntPtr.Zero;

    private System.Windows.Media.Color _digitColor =
        System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF);

    public MainWindow()
    {
        InitializeComponent();
        SetActiveClockBtn(digital: true);
        InitTrayIcon();
        PanelToggleBtn.Content = "▶";

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
            _sidePanel?.Hide();
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
            if (_rightVisible && _sidePanel != null)
            {
                _sidePanel.Show();
                PositionSidePanel();
            }
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
            float ox = cx + (r - 2)           * (float)Math.Sin(a);
            float oy = cy - (r - 2)           * (float)Math.Cos(a);
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
        _sidePanel?.Close();
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

        _sidePanel?.UpdateTimes(_worldUse24h);
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

    // ── Clock mode ────────────────────────────────────────────────────────

    private void DigitalBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = true;
        DigitalPanel.Visibility    = Visibility.Visible;
        AnalogClockBox.Visibility  = Visibility.Collapsed;
        ClockStatusText.Text       = "";
        SetActiveClockBtn(digital: true);
        UpdateDigital(DateTime.Now);
    }

    private void AnalogBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = false;
        DigitalPanel.Visibility    = Visibility.Collapsed;
        AnalogClockBox.Visibility  = Visibility.Visible;
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

    // ── Theme & settings (called back from SidePanelWindow) ───────────────

    internal void ApplyTheme(string name)
    {
        var dicts = Application.Current.Resources.MergedDictionaries;
        dicts[0] = new ResourceDictionary
        {
            Source = new Uri($"Themes/{name}.xaml", UriKind.Relative)
        };
        SetActiveClockBtn(_isDigital);
        ApplyDigitColor(_digitColor);
    }

    internal void ApplyDigitColor(System.Windows.Media.Color c)
    {
        _digitColor = c;
        var brush = new SolidColorBrush(c);
        SevenSeg.SegColor = brush;
        Application.Current.Resources["DigitalTextBrush"] = brush;
    }

    internal void ApplyBrightness(double v) => SevenSeg.Opacity = v;

    // ── Panel toggle (opens/closes SidePanelWindow) ───────────────────────

    private void PanelToggle_Click(object sender, RoutedEventArgs e)
    {
        _rightVisible = !_rightVisible;

        if (_rightVisible)
        {
            PanelToggleBtn.Content = "◀";
            OpenSidePanel();
        }
        else
        {
            PanelToggleBtn.Content = "▶";
            CloseSidePanel();
        }
    }

    private void OpenSidePanel()
    {
        _sidePanel = new SidePanelWindow(_alarms)
        {
            Owner = this
        };
        _sidePanel.OnThemeRequested    = ApplyTheme;
        _sidePanel.OnFormatChanged     = v => { _use24h = v; };
        _sidePanel.OnWorldFormatChanged = v => { _worldUse24h = v; };
        _sidePanel.OnBrightnessChanged = ApplyBrightness;
        _sidePanel.OnDigitColorChanged = ApplyDigitColor;
        _sidePanel.Closed             += (_, _) =>
        {
            if (_rightVisible)
            {
                _rightVisible = false;
                PanelToggleBtn.Content = "▶";
            }
            _sidePanel = null;
        };

        PositionSidePanel();
        _sidePanel.Show();
        _sidePanel.AnimateOpen();
    }

    private void CloseSidePanel()
    {
        if (_sidePanel == null) return;
        var panel = _sidePanel;
        panel.AnimateClose(() => Dispatcher.Invoke(() => panel.Close()));
    }

    private void PositionSidePanel()
    {
        if (_sidePanel == null) return;
        _sidePanel.Left   = Left + Width;
        _sidePanel.Top    = Top;
        _sidePanel.Height = Height;
    }

    protected override void OnLocationChanged(EventArgs e)
    {
        base.OnLocationChanged(e);
        PositionSidePanel();
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo info)
    {
        base.OnRenderSizeChanged(info);
        PositionSidePanel();
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
