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
using System.Windows.Media.Effects;
using System.Windows.Threading;
using MyClockWinV10.Helpers;
using MyClockWinV10.Models;
using MyClockWinV10.Services;

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
    private readonly ObservableCollection<TimerItem> _timers = new();
    private readonly AlarmSoundPlayer  _alarmSounds = new();
    private readonly StopwatchService  _stopwatchService = new();

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
    private bool _allowClose;

    private System.Windows.Media.Color _digitColor =
        System.Windows.Media.Color.FromRgb(0x58, 0xA6, 0xFF);
    private double _brightness = 1.0;
    private double _digitalTextBaseFontSize = 60;
    private string _lastDigitalText = "";

    private AppSettings _settings = new();
    private List<WorldTimeCityDto> _worldCities = [];

    public MainWindow()
    {
        InitializeComponent();
        var s = SettingsManager.Load();
        ApplySettingsOnStartup(s);
        InitTrayIcon();
        SettingsManager.EnsureStartupRegistryCommand();

        _timer.Tick += OnTick;
        _timer.Start();
        DigitalPanel.SizeChanged += (_, _) => RefitCurrentDigitalText();
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
        AnalogClock.Visibility = _isDigital ? Visibility.Collapsed : Visibility.Visible;

        ApplyTheme(s.Theme);
        ApplyBrightness(s.Brightness / 100.0);
        ApplyDigitalStyle(_digitalStyle);
        ApplyAnalogStyle(_analogStyle);

        _alarmSounds.SoundId = AlarmSoundCatalog.IsValid(s.AlarmSoundId) ? s.AlarmSoundId : AlarmSoundCatalog.DefaultId;
        _alarmSounds.Volume  = Math.Clamp(s.AlarmVolume, 0, 100) / 100.0;

        var timerDtos = s.Timers is { Count: > 0 } ? s.Timers : [new TimerDto()];
        foreach (var dto in timerDtos)
            _timers.Add(new TimerItem(
                Math.Clamp(dto.Hours, 0, 99),
                Math.Clamp(dto.Minutes, 0, 59),
                Math.Clamp(dto.Seconds, 0, 59),
                dto.Label));
        _timers.CollectionChanged += OnTimersCollectionChanged;
        foreach (var t in _timers) SubscribeTimerItem(t);

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

        _worldCities = s.WorldCities is { Count: > 0 }
            ? [.. s.WorldCities]
            : [.. WorldTimeDefaults.Cities];
    }

    private void SaveSettings()
    {
        _settings.Use24h       = _use24h;
        _settings.WorldUse24h  = _worldUse24h;
        _settings.Theme        = _currentTheme;
        _settings.Brightness   = (int)Math.Round(_brightness * 100);
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
        _settings.Timers = [.. _timers.Select(t => new TimerDto
        {
            Label   = t.Label,
            Hours   = t.Hours,
            Minutes = t.Minutes,
            Seconds = t.Seconds
        })];
        _settings.AlarmSoundId = _alarmSounds.SoundId;
        _settings.AlarmVolume  = (int)Math.Round(_alarmSounds.Volume * 100);
        if (_sidePanel != null)
            _worldCities = _sidePanel.WorldPanel.ToDtos();
        _settings.WorldCities = _worldCities;
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
        AnalogClock.Visibility = Visibility.Collapsed;
        ClockStatusText.Text      = "";
        SetActiveClockBtn(true);
        ApplyDigitalStyle(_digitalStyle);
        ApplyAnalogStyle(_analogStyle);
        UpdateDigital(DateTime.Now);

        ApplyTheme(d.Theme);
        ApplyBrightness(d.Brightness / 100.0);
        _alarmSounds.SoundId = d.AlarmSoundId;
        _alarmSounds.Volume  = d.AlarmVolume / 100.0;
        foreach (var t in _timers) t.Service.Stop();
        _timers.Clear();
        _timers.Add(new TimerItem(d.Timers[0].Hours, d.Timers[0].Minutes, d.Timers[0].Seconds));

        _worldCities = [.. WorldTimeDefaults.Cities];
        _sidePanel?.WorldPanel.LoadEntries(_worldCities);
        _sidePanel?.ApplySettings(d.Use24h, d.WorldUse24h, d.Brightness, _digitalStyle, _analogStyle,
            d.AlarmSoundId, d.AlarmVolume);
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

            // Recalculate preferred side at new position (open or closed)
            bool newRight = DetermineOpenRightAt(newLeft, newWidth, _panelOpensRight);
            if (newRight != _panelOpensRight)
            {
                _panelOpensRight = newRight;
                UpdatePanelToggleBtnSide(open: _rightVisible);
                _sidePanel?.ApplyPanelSide(_panelOpensRight);
            }

            // Sync side panel position (uses updated _panelOpensRight)
            if (_sidePanel != null)
            {
                _sidePanel.Left   = _panelOpensRight
                    ? (newLeft + newWidth)
                    : (newLeft - _sidePanel.Width);
                _sidePanel.Top    = newTop;
                _sidePanel.Height = newHeight;
            }
        }
        return IntPtr.Zero;
    }

    // ── System tray ───────────────────────────────────────────────────────

    private void InitTrayIcon()
    {
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("열기", null, (_, _) => RestoreFromTray());
        menu.Items.Add("닫기", null, (_, _) => Dispatcher.Invoke(ExitApplication));

        _trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Text             = "MyClock",
            ContextMenuStrip = menu
        };
        _trayIcon.DoubleClick += (_, _) => RestoreFromTray();

        try
        {
            var exe = System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName;
            var appIcon = System.Drawing.Icon.ExtractAssociatedIcon(exe);
            if (appIcon != null)
                _trayIcon.Icon = appIcon;
        }
        catch { /* fall back to dynamic icon on first tick */ }

        _trayIcon.Visible = true;
        UpdateTrayIcon(DateTime.Now);
    }

    private void MinimizeToTray()
    {
        if (_trayIcon == null) return;
        if (!IsVisible) return;

        CloseSidePanelImmediate();
        // Keep Normal state while hidden — Minimized + ShowInTaskbar=false often fails to restore.
        WindowState = WindowState.Normal;
        Hide();
        _trayIcon.Visible = true;
        UpdateTrayIcon(DateTime.Now);
    }

    private void ExitApplication()
    {
        _allowClose = true;
        Close();
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        if (WindowState == WindowState.Minimized && IsVisible)
            MinimizeToTray();
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!_allowClose)
        {
            e.Cancel = true;
            MinimizeToTray();
            return;
        }
        base.OnClosing(e);
    }

    private void RestoreFromTray()
    {
        Dispatcher.Invoke(() =>
        {
            CloseSidePanelImmediate();

            WindowState = WindowState.Normal;
            Visibility  = Visibility.Visible;
            Show();

            EnsureWindowOnScreen();

            Activate();
            Topmost = true;
            Topmost = false;
            Focus();

            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
            {
                EnsureWindowOnScreen();
                RefitCurrentDigitalText();
            });
        });
    }

    /// <summary>Clamp window position/size so the clock stays within the work area after tray restore.</summary>
    private void EnsureWindowOnScreen()
    {
        var area = SystemParameters.WorkArea;

        if (Width > area.Width)
            Width = Math.Max(MinWidth, area.Width);
        if (Height > area.Height)
            Height = Math.Max(MinHeight, area.Height);

        const double minVisible = 80;
        if (Left + Width < area.Left + minVisible)
            Left = area.Left;
        if (Left > area.Right - minVisible)
            Left = area.Right - Math.Min(Width, area.Width);
        if (Top + Height < area.Top + minVisible)
            Top = area.Top;
        if (Top > area.Bottom - minVisible)
            Top = area.Bottom - Math.Min(Height, area.Height);

        Left = Math.Clamp(Left, area.Left, Math.Max(area.Left, area.Right - Width));
        Top  = Math.Clamp(Top,  area.Top,  Math.Max(area.Top,  area.Bottom - Height));
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
        _trayIcon.Icon   = System.Drawing.Icon.FromHandle(newHandle);
        oldIcon?.Dispose();
        if (_trayIconHandle != IntPtr.Zero) DestroyIcon(_trayIconHandle);
        _trayIconHandle = newHandle;

        _trayIcon.Text = $"MyClock  {now:HH:mm:ss}";
    }

    protected override void OnClosed(EventArgs e)
    {
        SaveSettings();
        _alarmSounds.Stop();
        _sidePanel?.Close();
        if (_trayIcon != null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _trayIcon = null;
        }
        if (_trayIconHandle != IntPtr.Zero) DestroyIcon(_trayIconHandle);
        base.OnClosed(e);
        if (_allowClose)
            Application.Current.Shutdown();
    }

    // ── Timer ─────────────────────────────────────────────────────────────

    private void OnTick(object? sender, EventArgs e)
    {
        var now = DateTime.Now;
        HeaderDateText.Text = now.ToString("yyyy년 MM월 dd일  ddd");

        var activeTimer = FirstActiveTimer;
        if (activeTimer != null)
            UpdateTimerDisplay(activeTimer);
        else if (_isDigital)
            UpdateDigital(now);
        else
            UpdateAnalog(now);

        _sidePanel?.UpdateTimes(_worldUse24h);
        CheckAlarms(now);

        if (_trayIcon != null)
            UpdateTrayIcon(now);
    }

    private bool IsTimerOnMainDisplay =>
        _timers.Any(t => t.Service.State is TimerRunState.Running or TimerRunState.Paused);

    private TimerItem? FirstActiveTimer =>
        _timers.FirstOrDefault(t => t.Service.State == TimerRunState.Running)
        ?? _timers.FirstOrDefault(t => t.Service.State == TimerRunState.Paused);

    private void SubscribeTimerItem(TimerItem item)
    {
        item.Service.StateChanged += _ => Dispatcher.Invoke(() => OnTick(null, EventArgs.Empty));
        item.Completed += OnTimerCompleted;
    }

    private void OnTimersCollectionChanged(object? sender,
        System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
    {
        if (e.NewItems == null) return;
        foreach (TimerItem item in e.NewItems)
            SubscribeTimerItem(item);
    }

    private void OnTimerCompleted(TimerItem item)
    {
        Dispatcher.Invoke(() =>
        {
            var dur = item.Service.Duration;
            string time  = $"{(int)dur.TotalHours:D2}:{dur.Minutes:D2}:{dur.Seconds:D2}";
            string label = string.IsNullOrWhiteSpace(item.Label) ? time : item.Label;
            ShowAlarmNotification(time, label, "타이머 완료");
            OnTick(null, EventArgs.Empty);
        });
    }

    private void UpdateTimerDisplay(TimerItem timer)
    {
        var remaining = timer.Service.Remaining;
        int h = (int)remaining.TotalHours;
        string text = $"{h:D2}:{remaining.Minutes:D2}:{remaining.Seconds:D2}";

        if (UsesCanvasDigitalDisplay())
        {
            AmPmText.Text = timer.IsPaused ? "일시정지" : "타이머";
            SetCanvasDigitalTime(text);
        }
        else
        {
            TextAmPm.Text = timer.IsPaused ? "일시정지" : "타이머";
            string display = _digitalStyle == nameof(Models.DigitalStyle.Korean)
                ? KoreanTimeText.FormatCountdown(remaining, showSeconds: true)
                : text;
            ApplyDigitalTextTime(display);
        }

        ClockStatusText.Text = "타이머";
        if (!_isDigital)
        {
            AnalogClock.DrawClock(DateTime.Now);
            ClockStatusText.Text = text;
        }
    }

    private void UpdateDigital(DateTime now)
    {
        string ampm = _use24h ? "" : (now.Hour < 12 ? "오전" : "오후");

        if (UsesCanvasDigitalDisplay())
        {
            AmPmText.Text = ampm;
            SetCanvasDigitalTime(FormatCanvasDigitalTime(now));
        }
        else
        {
            TextAmPm.Text = ampm;
            bool showSeconds = _digitalStyle != nameof(Models.DigitalStyle.Minimal);
            string display = _digitalStyle == nameof(Models.DigitalStyle.Korean)
                ? KoreanTimeText.FormatClock(now, _use24h, showSeconds)
                : FormatNumericDigitalTime(now, showSeconds);
            ApplyDigitalTextTime(display);
        }

        ClockStatusText.Text = "";
    }

    private void ApplyDigitalTextTime(string text)
    {
        _lastDigitalText = text;
        double maxWidth = GetDigitalTextMaxWidth();

        bool alwaysFit = _digitalStyle == nameof(Models.DigitalStyle.Korean);

        TextTime.FontSize = _digitalTextBaseFontSize;
        TextTime.Measure(new System.Windows.Size(double.PositiveInfinity, double.PositiveInfinity));

        if (alwaysFit || TextTime.DesiredSize.Width > maxWidth)
            DigitalTextFitter.FitSingleLine(TextTime, text, maxWidth, _digitalTextBaseFontSize);
        else
        {
            TextTime.Text          = text;
            TextTime.TextWrapping  = TextWrapping.NoWrap;
            TextTime.TextAlignment = TextAlignment.Center;
        }
    }

    private void RefitCurrentDigitalText()
    {
        if (!_isDigital || UsesCanvasDigitalDisplay()) return;
        var active = FirstActiveTimer;
        if (active != null)
            UpdateTimerDisplay(active);
        else if (!string.IsNullOrEmpty(_lastDigitalText))
            ApplyDigitalTextTime(_lastDigitalText);
    }

    private double GetDigitalTextMaxWidth()
    {
        double w = DigitalPanel.ActualWidth;
        if (w < 40)
            w = Math.Max(0, ActualWidth - 36);
        return Math.Max(60, w - 8);
    }

    private string FormatNumericDigitalTime(DateTime now, bool showSeconds)
    {
        string time = showSeconds
            ? (_use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss"))
            : (_use24h ? now.ToString("HH:mm") : now.ToString("hh:mm"));
        return time;
    }

    private static bool UsesCanvasDigitalDisplay(string style) =>
        style is nameof(Models.DigitalStyle.SevenSegment)
            or nameof(Models.DigitalStyle.DotMatrix);

    private bool UsesCanvasDigitalDisplay() => UsesCanvasDigitalDisplay(_digitalStyle);

    private void SetCanvasDigitalTime(string time)
    {
        if (_digitalStyle == nameof(Models.DigitalStyle.DotMatrix))
            DotMatrixClock.Text = time;
        else
            SevenSeg.Text = time;
    }

    private string FormatCanvasDigitalTime(DateTime now) =>
        _use24h ? now.ToString("HH:mm:ss") : now.ToString("hh:mm:ss");

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
        ShowAlarmNotification(
            $"{alarm.Time.Hours:D2}:{alarm.Time.Minutes:D2}",
            alarm.Label,
            "알람");
    }

    private void ShowAlarmNotification(string time, string label, string header)
    {
        _alarmSounds.PlayAlarm(loop: true);
        var win = new AlarmNotificationWindow(time, label, header, () => _alarmSounds.Stop())
        { Owner = this };
        win.Closed += (_, _) => _alarmSounds.Stop();
        win.Show();
    }

    // ── Clock mode ────────────────────────────────────────────────────────

    private void ClockModeBtn_Click(object sender, RoutedEventArgs e)
    {
        _isDigital = !_isDigital;
        DigitalPanel.Visibility   = _isDigital ? Visibility.Visible   : Visibility.Collapsed;
        AnalogClock.Visibility = _isDigital ? Visibility.Collapsed : Visibility.Visible;
        SetActiveClockBtn(_isDigital);
        var active = FirstActiveTimer;
        if (active != null)
            UpdateTimerDisplay(active);
        else if (_isDigital)
            UpdateDigital(DateTime.Now);
        else
            UpdateAnalog(DateTime.Now);
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
        DotMatrixClock.DotColor = brush;
        Application.Current.Resources["DigitalTextBrush"] = brush;
        if (_digitalStyle == nameof(Models.DigitalStyle.Neon) && TextTime.Effect is DropShadowEffect glow)
            glow.Color = c;
    }

    internal void ApplyBrightness(double v)
    {
        _brightness = Math.Clamp(v, 0, 1);
        DigitalPanel.Opacity = _brightness;
    }

    internal void ApplyDigitalStyle(string style)
    {
        _digitalStyle = style;
        bool isSeg    = style == nameof(Models.DigitalStyle.SevenSegment);
        bool isDot    = style == nameof(Models.DigitalStyle.DotMatrix);
        bool isCanvas = isSeg || isDot;

        AmPmText.Visibility        = isCanvas ? Visibility.Visible   : Visibility.Collapsed;
        SevenSeg.Visibility        = isSeg    ? Visibility.Visible   : Visibility.Collapsed;
        DotMatrixClock.Visibility  = isDot    ? Visibility.Visible   : Visibility.Collapsed;
        TextClockBox.Visibility    = isCanvas ? Visibility.Collapsed : Visibility.Visible;

        if (!isCanvas)
        {
            TextTime.Effect = null;

            switch (style)
            {
                case nameof(Models.DigitalStyle.Minimal):
                    TextTime.FontFamily = new System.Windows.Media.FontFamily("Segoe UI");
                    TextTime.FontWeight = FontWeights.Light;
                    _digitalTextBaseFontSize = 72;
                    break;
                case nameof(Models.DigitalStyle.Retro):
                    TextTime.FontFamily = new System.Windows.Media.FontFamily("Courier New");
                    TextTime.FontWeight = FontWeights.Normal;
                    _digitalTextBaseFontSize = 56;
                    break;
                case nameof(Models.DigitalStyle.Neon):
                    TextTime.FontFamily = new System.Windows.Media.FontFamily("Consolas");
                    TextTime.FontWeight = FontWeights.Bold;
                    _digitalTextBaseFontSize = 64;
                    TextTime.Effect = new DropShadowEffect
                    {
                        Color       = _digitColor,
                        BlurRadius  = 18,
                        ShadowDepth = 0,
                        Opacity     = 0.85
                    };
                    break;
                case nameof(Models.DigitalStyle.Korean):
                    TextTime.FontFamily = new System.Windows.Media.FontFamily("Malgun Gothic, 맑은 고딕, Batang");
                    TextTime.FontWeight = FontWeights.SemiBold;
                    _digitalTextBaseFontSize = 36;
                    break;
                default: // LcdText
                    TextTime.FontFamily = new System.Windows.Media.FontFamily("Consolas");
                    TextTime.FontWeight = FontWeights.Bold;
                    _digitalTextBaseFontSize = 60;
                    break;
            }
        }

        TextTime.TextWrapping = TextWrapping.NoWrap;
        TextTime.ClearValue(FrameworkElement.MaxWidthProperty);

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

    private void CalendarBtn_Click(object sender, RoutedEventArgs e)
    {
        if (!_rightVisible)
        {
            _rightVisible = true;
            OpenSidePanel();
        }
        _sidePanel?.SwitchToCalendarTab();
    }

    private bool DetermineOpenRight() => DetermineOpenRightAt(Left, Width, _panelOpensRight);

    // preferRight: current side — only flip when that side runs out of space
    private static bool DetermineOpenRightAt(double left, double width, bool preferRight)
    {
        var area = SystemParameters.WorkArea;
        bool canRight = (left + width + 400) <= area.Right;
        bool canLeft  = (left         - 400) >= area.Left;
        if (preferRight) return canRight || !canLeft; // switch to left only when right is full and left is available
        else             return !canLeft;             // switch to right only when left is full
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

        _sidePanel = new SidePanelWindow(_alarms, _timers, _alarmSounds, _stopwatchService) { Owner = this };
        _sidePanel.OnThemeRequested       = name => { ApplyTheme(name); SaveSettings(); };
        _sidePanel.OnFormatChanged        = v => { _use24h = v; };
        _sidePanel.OnWorldFormatChanged   = v => { _worldUse24h = v; };
        _sidePanel.OnBrightnessChanged    = ApplyBrightness;
        _sidePanel.OnDigitColorChanged    = c => { ApplyDigitColor(c); SaveSettings(); };
        _sidePanel.OnResetRequested       = ResetToDefaults;
        _sidePanel.OnDigitalStyleChanged  = s => { ApplyDigitalStyle(s); SaveSettings(); };
        _sidePanel.OnAnalogStyleChanged   = s => { ApplyAnalogStyle(s); SaveSettings(); };
        _sidePanel.OnSettingsChanged      = SaveSettings;
        _sidePanel.WorldPanel.LoadEntries(_worldCities);
        _sidePanel.WorldPanel.EntriesChanged += OnWorldCitiesChanged;
        _sidePanel.Closed += (_, _) =>
        {
            if (_rightVisible)
            {
                _rightVisible = false;
                UpdatePanelToggleBtnSide(open: false);
            }
            _sidePanel = null;
        };

        _sidePanel.ApplySettings(_use24h, _worldUse24h, (int)Math.Round(_brightness * 100),
            _digitalStyle, _analogStyle,
            _alarmSounds.SoundId, (int)Math.Round(_alarmSounds.Volume * 100));
        PositionSidePanel();
        _sidePanel.ApplyPanelSide(_panelOpensRight);
        _sidePanel.Show();
        _sidePanel.AnimateOpen(_panelOpensRight);
    }

    internal void RequestCloseSidePanel()
    {
        if (!_rightVisible) return;
        _rightVisible = false;
        CloseSidePanel();
    }

    private void OnWorldCitiesChanged()
    {
        if (_sidePanel == null) return;
        _worldCities = _sidePanel.WorldPanel.ToDtos();
        SaveSettings();
    }

    private void CloseSidePanel()
    {
        if (_sidePanel == null) return;
        _worldCities = _sidePanel.WorldPanel.ToDtos();
        UpdatePanelToggleBtnSide(open: false);
        var panel = _sidePanel;
        panel.AnimateClose(_panelOpensRight, () => Dispatcher.Invoke(() => panel.Close()));
    }

    /// <summary>Close settings panel without animation (tray hide/restore).</summary>
    private void CloseSidePanelImmediate()
    {
        if (_sidePanel == null) return;

        _worldCities = _sidePanel.WorldPanel.ToDtos();
        _rightVisible  = false;
        UpdatePanelToggleBtnSide(open: false);

        var panel = _sidePanel;
        _sidePanel  = null;
        panel.Hide();
        panel.Close();
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
        => MinimizeToTray();
}
