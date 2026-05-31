using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class MainWindow : Window
{
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr hIcon);

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPOS
    {
        public IntPtr hwnd, hwndInsertAfter;
        public int x, y, cx, cy;
        public uint flags;
    }
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const int  WM_WINDOWPOSCHANGING = 0x0046;

    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly ObservableCollection<AlarmItem> _alarms = new();
    private readonly HashSet<Guid> _firedAlarms = new();

    private bool _isDigital      = true;
    private bool _use24h         = false;
    private bool _worldUse24h    = false;
    private bool _rightVisible   = false;
    private bool _panelOpensRight = true;
    private string _currentTheme = "DarkTheme";
    private string _digitalStyle = "SevenSegment";
    private string _analogStyle  = "Classic";

    private SidePanelWindow? _sidePanel;
    private double _dpiScaleX = 1.0, _dpiScaleY = 1.0;

    private System.Windows.Forms.NotifyIcon? _trayIcon;
    private IntPtr _trayIconHandle = IntPtr.Zero;

    private System.Windows.Media.Color _digitColor =
        System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF);

    private AppSettings _settings = new();

    public MainWindow()
    {
        InitializeComponent();
        var s = SettingsManager.Load();
        ApplySettingsOnStartup(s);
        InitTrayIcon();

        _timer.Tick += OnTick;
        _timer.Start();
        OnTick(null, EventArgs.Empty);
    }

    // ── Settings ──────────────────────────────────────────────────────────

    private void ApplySettingsOnStartup(AppSettings s)
    {
        _settings = s;

        Width  = s.WindowWidth;
        Height = s.WindowHeight;

        if (s.WindowLeft.HasValue && s.WindowTop.HasValue)
        {
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = s.WindowLeft.Value;
            Top  = s.WindowTop.Value;
        }
        else
        {
            // First run: top-right corner of the work area
            WindowStartupLocation = WindowStartupLocation.Manual;
            var area = System.Windows.SystemParameters.WorkArea;
            Left = area.Right - s.WindowWidth - 12;
            Top  = area.Top                   + 12;
        }

        _isDigital    = s.IsDigital;
        _use24h       = s.Use24h;
        _worldUse24h  = s.WorldUse24h;
        _currentTheme = s.Theme;
        _digitColor   = ParseColor(s.DigitColor);
        _digitalStyle = s.DigitalStyleName;
        _analogStyle  = s.AnalogStyleName;

        DigitalPanel.Visibility   = _isDigital ? Visibility.Visible   : Visibility.Collapsed;
        AnalogClockBox.Visibility = _isDigital ? Visibility.Collapsed : Visibility.Visible;

        ApplyTheme(s.Theme);
        ApplyBrightness(s.Brightness / 100.0);
        ApplyDigitalStyle(_digitalStyle);
        ApplyAnalogStyle(_analogStyle);

        foreach (var dto in s.Alarms)
        {
            if (TimeSpan.TryParseExact(dto.Time, @"hh\:mm", null, out var ts))
                _alarms.Add(new AlarmItem
                {
                    Time       = ts,
                    Label      = dto.Label,
                    IsEnabled  = dto.IsEnabled,
                    IsRepeat   = dto.IsRepeat,
                    RepeatDays = dto.RepeatDays
                });
        }
    }

    private void SaveSettings()
    {
        _settings.Use24h       = _use24h;
        _settings.WorldUse24h  = _worldUse24h;
        _settings.Theme        = _currentTheme;
        _settings.Brightness   = (int)Math.Round(SevenSeg.Opacity * 100);
        _settings.DigitColor   = $"#{_digitColor.R:X2}{_digitColor.G:X2}{_digitColor.B:X2}";
        _settings.IsDigital        = _isDigital;
        _settings.DigitalStyleName = _digitalStyle;
        _settings.AnalogStyleName  = _analogStyle;
        _settings.WindowLeft   = Left;
        _settings.WindowTop    = Top;
        _settings.WindowWidth  = Width;
        _settings.WindowHeight = Height;
        _settings.Alarms = [.. _alarms.Select(a => new AlarmDto
        {
            Time       = $"{a.Time.Hours:D2}:{a.Time.Minutes:D2}",
            Label      = a.Label,
            IsEnabled  = a.IsEnabled,
            IsRepeat   = a.IsRepeat,
            RepeatDays = a.RepeatDays
        })];
        SettingsManager.Save(_settings);
    }

    private void ResetToDefaults()
    {
        var d = SettingsManager.Defaults();
        _use24h       = d.Use24h;
        _worldUse24h  = d.WorldUse24h;
        _currentTheme = d.Theme;
        _isDigital    = d.IsDigital;
        _digitColor   = ParseColor(d.DigitColor);

        _digitalStyle = "SevenSegment";
        _analogStyle  = "Classic";

        DigitalPanel.Visibility   = Visibility.Visible;
        AnalogClockBox.Visibility = Visibility.Collapsed;
        ClockStatusText.Text      = "";
        SetActiveClockBtn(true);
        ApplyDigitalStyle(_digitalStyle);
        ApplyAnalogStyle(_analogStyle);
        UpdateDigital(DateTime.Now);

        ApplyTheme(d.Theme);
        ApplyBrightness(d.Brightness / 100.0);

        _sidePanel?.ApplySettings(d.Use24h, d.WorldUse24h, d.Brightness, _digitalStyle, _analogStyle);
        SaveSettings();
    }

    private static System.Windows.Media.Color ParseColor(string hex)
    {
        try
        {
            return (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex);
        }
        catch
        {
            return System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF);
        }
    }

    // ── Win32 position-change hook (zero-lag side-panel sync) ─────────────

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        var hwnd = new WindowInteropHelper(this).Handle;
        HwndSource.FromHwnd(hwnd)?.AddHook(WndProc);

        var dpi = VisualTreeHelper.GetDpi(this);
        _dpiScaleX = dpi.DpiScaleX;
        _dpiScaleY = dpi.DpiScaleY;
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_WINDOWPOSCHANGING)
        {
            var pos = Marshal.PtrToStructure<WINDOWPOS>(lParam);
            bool noMove = (pos.flags & SWP_NOMOVE) != 0;
            bool noSize = (pos.flags & SWP_NOSIZE) != 0;

            double newLeft   = noMove ? Left   : pos.x  / _dpiScaleX;
            double newWidth  = noSize ? Width  : pos.cx / _dpiScaleX;
            double newTop    = noMove ? Top    : pos.y  / _dpiScaleY;
            double newHeight = noSize ? Height : pos.cy / _dpiScaleY;

            // Sync side panel position
            if (_sidePanel != null)
            {
                _sidePanel.Left   = _panelOpensRight
                    ? (newLeft + newWidth)
                    : (newLeft - _sidePanel.Width);
                _sidePanel.Top    = newTop;
                _sidePanel.Height = newHeight;
            }

            // When panel is closed, update button side based on available space at new position
            if (!_rightVisible)
            {
                bool newRight = DetermineOpenRightAt(newLeft, newWidth);
                if (newRight != _panelOpensRight)
                {
                    _panelOpensRight = newRight;
                    UpdatePanelToggleBtnSide(open: false);
                }
            }
        }
        return IntPtr.Zero;
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
            if (_rightVisible) _sidePanel?.Show();
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

        double secA = now.Second               * 6      * Math.PI / 180;
        double minA = (now.Minute + now.Second / 60.0)  * 6      * Math.PI / 180;
        double hrA  = ((now.Hour % 12) + now.Minute / 60.0) * 30 * Math.PI / 180;

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
        if (_trayIconHandle != IntPtr.Zero) DestroyIcon(_trayIconHandle);
        _trayIconHandle = newHandle;
    }

    protected override void OnClosed(EventArgs e)
    {
        SaveSettings();
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
        string ampm = _use24h ? "" : (now.Hour < 12 ? "오전" : "오후");

        if (_digitalStyle == "SevenSegment")
        {
            SevenSeg.Text = _use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss");
            AmPmText.Text = ampm;
        }
        else
        {
            TextAmPm.Text = ampm;
            TextTime.Text = (_digitalStyle == "Minimal")
                ? (_use24h ? now.ToString("HH:mm") : now.ToString("hh:mm"))
                : (_use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss"));
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

            if (alarm.Time == current && now.Second == 0)
            {
                bool shouldFire;
                if (!alarm.IsRepeat)
                {
                    shouldFire = true;
                }
                else
                {
                    // DayOfWeek: Sun=0 Mon=1 … Sat=6  →  bit: Sun=0 Mon=1 … Sat=6
                    int bit = (int)now.DayOfWeek;
                    shouldFire = (alarm.RepeatDays & (1 << bit)) != 0;
                }

                if (shouldFire && _firedAlarms.Add(alarm.Id))
                {
                    FireAlarm(alarm);
                    if (!alarm.IsRepeat)
                        alarm.IsEnabled = false;
                }
            }
            else if (alarm.Time != current)
            {
                _firedAlarms.Remove(alarm.Id);
            }
        }
    }

    private void FireAlarm(AlarmItem alarm)
    {
        System.Media.SystemSounds.Exclamation.Play();
        new AlarmNotificationWindow($"{alarm.Time.Hours:D2}:{alarm.Time.Minutes:D2}", alarm.Label)
        { Owner = this }.Show();
    }

    // ── Clock mode ────────────────────────────────────────────────────────

    private void ClockModeBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = !_isDigital;
        DigitalPanel.Visibility   = _isDigital ? Visibility.Visible   : Visibility.Collapsed;
        AnalogClockBox.Visibility = _isDigital ? Visibility.Collapsed : Visibility.Visible;
        SetActiveClockBtn(_isDigital);
        if (_isDigital) UpdateDigital(DateTime.Now);
        else            UpdateAnalog(DateTime.Now);
    }

    private void SetActiveClockBtn(bool digital)
    {
        IconDigital.Visibility = digital ? Visibility.Visible   : Visibility.Collapsed;
        IconAnalog.Visibility  = digital ? Visibility.Collapsed : Visibility.Visible;
        IconHour.Visibility    = digital ? Visibility.Collapsed : Visibility.Visible;
        IconMin.Visibility     = digital ? Visibility.Collapsed : Visibility.Visible;
        ClockModeBtn.ToolTip   = digital ? "아날로그로 전환" : "디지털로 전환";
    }

    // ── Theme & display (called from SidePanelWindow) ─────────────────────

    internal void ApplyTheme(string name)
    {
        _currentTheme = name;
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

    internal void ApplyDigitalStyle(string style)
    {
        _digitalStyle = style;
        bool isSeg = style == "SevenSegment";
        AmPmText.Visibility     = isSeg ? Visibility.Visible   : Visibility.Collapsed;
        SevenSeg.Visibility     = isSeg ? Visibility.Visible   : Visibility.Collapsed;
        TextClockBox.Visibility = isSeg ? Visibility.Collapsed : Visibility.Visible;

        if (!isSeg)
        {
            if (style == "Minimal")
            {
                TextTime.FontFamily = new System.Windows.Media.FontFamily("Segoe UI");
                TextTime.FontWeight = FontWeights.Light;
                TextTime.FontSize   = 72;
            }
            else
            {
                TextTime.FontFamily = new System.Windows.Media.FontFamily("Consolas");
                TextTime.FontWeight = FontWeights.Bold;
                TextTime.FontSize   = 60;
            }
        }

        if (_isDigital) UpdateDigital(DateTime.Now);
    }

    internal void ApplyAnalogStyle(string style)
    {
        _analogStyle = style;
        if (Enum.TryParse<Models.AnalogStyle>(style, out var s))
            AnalogClock.ClockStyle = s;
        if (!_isDigital) UpdateAnalog(DateTime.Now);
    }

    // ── Side panel ────────────────────────────────────────────────────────

    private void PanelToggle_Click(object sender, RoutedEventArgs e)
    {
        _rightVisible = !_rightVisible;
        if (_rightVisible) OpenSidePanel();
        else               CloseSidePanel();
    }

    private bool DetermineOpenRight() => DetermineOpenRightAt(Left, Width);

    private static bool DetermineOpenRightAt(double left, double width)
    {
        var area = SystemParameters.WorkArea;
        bool canRight = (left + width + 400) <= area.Right;
        bool canLeft  = (left         - 400) >= area.Left;
        if (canRight) return true;
        if (canLeft)  return false;
        return true;
    }

    private void UpdatePanelToggleBtnSide(bool open)
    {
        PanelToggleBtn.HorizontalAlignment = _panelOpensRight
            ? HorizontalAlignment.Right : HorizontalAlignment.Left;
        PanelToggleBtn.Content = open
            ? (_panelOpensRight ? "◀" : "▶")
            : (_panelOpensRight ? "▶" : "◀");
    }

    private void OpenSidePanel()
    {
        _panelOpensRight = DetermineOpenRight();
        UpdatePanelToggleBtnSide(open: true);

        _sidePanel = new SidePanelWindow(_alarms) { Owner = this };
        _sidePanel.OnThemeRequested       = name => { ApplyTheme(name); SaveSettings(); };
        _sidePanel.OnFormatChanged        = v => { _use24h = v; };
        _sidePanel.OnWorldFormatChanged   = v => { _worldUse24h = v; };
        _sidePanel.OnBrightnessChanged    = ApplyBrightness;
        _sidePanel.OnDigitColorChanged    = c => { ApplyDigitColor(c); SaveSettings(); };
        _sidePanel.OnResetRequested       = ResetToDefaults;
        _sidePanel.OnDigitalStyleChanged  = s => { ApplyDigitalStyle(s); SaveSettings(); };
        _sidePanel.OnAnalogStyleChanged   = s => { ApplyAnalogStyle(s); SaveSettings(); };
        _sidePanel.Closed += (_, _) =>
        {
            if (_rightVisible)
            {
                _rightVisible = false;
                UpdatePanelToggleBtnSide(open: false);
            }
            _sidePanel = null;
        };

        _sidePanel.ApplySettings(_use24h, _worldUse24h, (int)Math.Round(SevenSeg.Opacity * 100),
                                 _digitalStyle, _analogStyle);
        PositionSidePanel();
        _sidePanel.Show();
        _sidePanel.AnimateOpen(_panelOpensRight);
    }

    private void CloseSidePanel()
    {
        if (_sidePanel == null) return;
        UpdatePanelToggleBtnSide(open: false);
        var panel = _sidePanel;
        panel.AnimateClose(_panelOpensRight, () => Dispatcher.Invoke(() => panel.Close()));
    }

    private void PositionSidePanel()
    {
        if (_sidePanel == null) return;
        _sidePanel.Top    = Top;
        _sidePanel.Height = Height;
        _sidePanel.Left   = _panelOpensRight ? (Left + Width) : (Left - 1);
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
