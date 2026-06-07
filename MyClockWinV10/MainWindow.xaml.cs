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
    [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr hwnd, ref MARGINS margins);

    [StructLayout(LayoutKind.Sequential)]
    private struct MARGINS
    {
        public int cxLeftWidth, cxRightWidth, cyTopHeight, cyBottomHeight;
    }

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
    private readonly HashSet<Guid> _firedCalEvents = new();
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

    // Per-mode geometry — updated in real-time by SizeChanged / LocationChanged
    private double  _digitalW = 300, _digitalH = 300;
    private double? _digitalL,       _digitalT;
    private double  _analogW  = 300, _analogH  = 300;
    private double? _analogL,        _analogT;

    private bool _chromeVisible;
    private readonly DispatcherTimer _chromeHideTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };

    private MenuItem? _settingsMenuItem;
    private MenuItem? _clockModeMenuItem;
    private MenuItem? _maximizeMenuItem;
    private ContextMenu? _windowContextMenu;

    private const double DigitalMinWidth       = 140;
    private const double DigitalMinHeight      = 50;
    private const double DigitalAmPmRowHeight  = 28;
    private const double AnalogMinWidth        = 150;
    private const double AnalogMinHeight       = 150;
    private const double ResizeBorderHit  = 6;

    private bool _isDraggingWindow;
    private bool _awaitingSettingsCloseOrDrag;
    private System.Windows.Point _mouseDownScreen;
    private System.Windows.Point _dragWindowOrigin;

    public MainWindow()
    {
        InitializeComponent();
        var s = SettingsManager.Load();
        ApplySettingsOnStartup(s);
        InitTrayIcon();
        InitChromeHover();
        InitContextMenu();
        SettingsManager.EnsureStartupRegistryCommand();

        _timer.Tick += OnTick;
        _timer.Start();
        DigitalPanel.SizeChanged += (_, _) =>
        {
            RefitCurrentDigitalText();
            if (UsesCanvasDigitalDisplay())
            {
                SevenSeg.InvalidateMeasure();
                DotMatrixClock.InvalidateMeasure();
            }
        };
        ClockSizer.SizeChanged += (_, _) => SyncOverlayLayout();
        SizeChanged     += (_, _) => TrackModeGeometry();
        LocationChanged += (_, _) => TrackModeGeometry();
        Loaded += MainWindow_Loaded;
        OnTick(null, EventArgs.Empty);
    }

    private void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        ApplyClockModeLayout();
        SyncOverlayLayout();
        EnsureWindowOnScreen();
    }

    private void SyncOverlayLayout()
    {
        double w = ClockSizer.ActualWidth;
        double h = ClockSizer.ActualHeight;
        if (w <= 0 || h <= 0) return;

        WindowBackgroundLayer.Width  = w;
        WindowBackgroundLayer.Height = h;
        Canvas.SetLeft(WindowBackgroundLayer, 0);
        Canvas.SetTop(WindowBackgroundLayer, 0);

        HeaderDateText.Width = w;
        Canvas.SetLeft(HeaderDateText, 0);
        Canvas.SetTop(HeaderDateText, 4);

        ClockStatusText.Width = w;
        Canvas.SetLeft(ClockStatusText, 0);
        Canvas.SetTop(ClockStatusText, Math.Max(0, h - 20));

        ResizeHoverOutline.Width  = w;
        ResizeHoverOutline.Height = h;
        Canvas.SetLeft(ResizeHoverOutline, 0);
        Canvas.SetTop(ResizeHoverOutline, 0);

        Canvas.SetLeft(ResizeGripVisual, Math.Max(0, w - 16));
        Canvas.SetTop(ResizeGripVisual, Math.Max(0, h - 16));
    }

    private void TrackModeGeometry()
    {
        if (_isDigital) { _digitalW = Width; _digitalH = Height; _digitalL = Left; _digitalT = Top; }
        else            { _analogW  = Width; _analogH  = Height; _analogL  = Left; _analogT  = Top; }
    }

    private static void SetAmPmText(TextBlock target, string ampm)
    {
        target.Text = ampm;
        target.Visibility = string.IsNullOrEmpty(ampm) ? Visibility.Collapsed : Visibility.Visible;
    }

    // ── Settings ──────────────────────────────────────────────────────────

    private void ApplySettingsOnStartup(AppSettings s)
    {
        _settings = s;

        // Restore the correct mode's geometry, falling back to generic slot for old saves
        double restoreW, restoreH;
        double? restoreL, restoreT;
        if (s.IsDigital)
        {
            restoreW = s.DigitalWindowWidth  ?? s.WindowWidth;
            restoreH = s.DigitalWindowHeight ?? s.WindowHeight;
            restoreL = s.DigitalWindowLeft   ?? s.WindowLeft;
            restoreT = s.DigitalWindowTop    ?? s.WindowTop;
        }
        else
        {
            restoreW = s.AnalogWindowWidth  ?? s.WindowWidth;
            restoreH = s.AnalogWindowHeight ?? s.WindowHeight;
            restoreL = s.AnalogWindowLeft   ?? s.WindowLeft;
            restoreT = s.AnalogWindowTop    ?? s.WindowTop;
        }
        Width  = restoreW;
        Height = restoreH;

        WindowStartupLocation = WindowStartupLocation.Manual;
        if (restoreL.HasValue && restoreT.HasValue)
        {
            Left = restoreL.Value;
            Top  = restoreT.Value;
        }
        else
        {
            var area = SystemParameters.WorkArea;
            Left = area.Right - restoreW - 12;
            Top  = area.Top + 12;
        }

        // Initialise per-mode geometry trackers from saved values.
        // The active mode uses the just-restored window geometry as its baseline.
        // The inactive mode uses whatever was saved for it (null position = not yet set).
        if (s.IsDigital)
        {
            _digitalW = Width;  _digitalH = Height;
            _digitalL = Left;   _digitalT = Top;
            _analogW  = s.AnalogWindowWidth  ?? Width;
            _analogH  = s.AnalogWindowHeight ?? Height;
            _analogL  = s.AnalogWindowLeft;
            _analogT  = s.AnalogWindowTop;
        }
        else
        {
            _analogW  = Width;  _analogH  = Height;
            _analogL  = Left;   _analogT  = Top;
            _digitalW = s.DigitalWindowWidth  ?? Width;
            _digitalH = s.DigitalWindowHeight ?? Height;
            _digitalL = s.DigitalWindowLeft;
            _digitalT = s.DigitalWindowTop;
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
        ApplyClockModeMinSize();

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
        // Always save BOTH modes so every switch or restart restores the right geometry.
        _settings.DigitalWindowWidth  = _digitalW;  _settings.DigitalWindowHeight = _digitalH;
        _settings.DigitalWindowLeft   = _digitalL;  _settings.DigitalWindowTop    = _digitalT;
        _settings.AnalogWindowWidth   = _analogW;   _settings.AnalogWindowHeight  = _analogH;
        _settings.AnalogWindowLeft    = _analogL;   _settings.AnalogWindowTop     = _analogT;
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
        UpdateClockModeMenuItem();
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

    // ── Hover chrome (transparent until mouse over) ───────────────────────

    private void InitChromeHover()
    {
        _chromeHideTimer.Tick += (_, _) =>
        {
            _chromeHideTimer.Stop();
            if (!ShouldKeepChromeVisible())
                SetChromeVisible(false);
        };
        SetChromeVisible(false);
    }

    private void Window_MouseEnter(object sender, MouseEventArgs e) => SetChromeVisible(true);

    private void Window_MouseLeave(object sender, MouseEventArgs e) => ScheduleHideChrome();

    private void SidePanel_MouseEnter(object sender, MouseEventArgs e) => SetChromeVisible(true);

    private void SidePanel_MouseLeave(object sender, MouseEventArgs e) => ScheduleHideChrome();

    private void ScheduleHideChrome()
    {
        _chromeHideTimer.Stop();
        _chromeHideTimer.Start();
    }

    private bool ShouldKeepChromeVisible()
    {
        if (IsMouseOver) return true;
        if (_sidePanel is { IsVisible: true } panel && panel.IsMouseOver) return true;
        return false;
    }

    private void SetChromeVisible(bool visible)
    {
        if (_chromeVisible == visible) return;
        _chromeVisible = visible;

        WindowBackgroundLayer.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        HeaderDateText.Visibility        = visible ? Visibility.Visible : Visibility.Collapsed;
        ClockStatusText.Visibility       = visible && !string.IsNullOrEmpty(ClockStatusText.Text)
            ? Visibility.Visible
            : Visibility.Collapsed;
        ResizeHoverOutline.Visibility    = visible ? Visibility.Visible : Visibility.Collapsed;
        ResizeGripVisual.Visibility      = visible ? Visibility.Visible : Visibility.Collapsed;
    }

    private void InitContextMenu()
    {
        _settingsMenuItem = CreateMenuItem("\uE713", "설정...", (_, _) => ToggleSettingsPanel());

        var calendarItem = CreateMenuItem("\uE787", "Outlook 캘린더", (_, _) => OpenCalendar());

        _clockModeMenuItem = CreateMenuItem("\uE121", (_, _) => ToggleClockMode());

        var minimizeItem = CreateMenuItem("\uE921", "최소화", (_, _) => WindowState = WindowState.Minimized);

        _maximizeMenuItem = CreateMenuItem("\uE922", (_, _) => ToggleMaximize());

        var hideToTrayItem = CreateMenuItem("\uE74D", "트레이로 숨기기", (_, _) => MinimizeToTray());

        var separator = new Separator { Style = (Style)FindResource("ClockContextMenuSeparatorStyle") };

        var menu = new ContextMenu
        {
            Style = (Style)FindResource("ClockContextMenuStyle"),
            Items =
            {
                _settingsMenuItem,
                calendarItem,
                _clockModeMenuItem,
                separator,
                minimizeItem,
                _maximizeMenuItem,
                hideToTrayItem
            }
        };
        menu.Opened += (_, _) =>
        {
            UpdateSettingsMenuItem();
            UpdateClockModeMenuItem();
            UpdateMaximizeMenuItem();
            SetChromeVisible(true);
        };

        var itemStyle = (Style)FindResource("ClockContextMenuItemStyle");
        foreach (var item in menu.Items)
        {
            if (item is MenuItem mi)
                mi.Style = itemStyle;
        }

        RootGrid.ContextMenu = menu;
        _windowContextMenu = menu;
        ContextMenu = menu;
        UpdateSettingsMenuItem();
        UpdateClockModeMenuItem();
        UpdateMaximizeMenuItem();
    }

    private MenuItem CreateMenuItem(string iconGlyph, RoutedEventHandler click)
        => CreateMenuItem(iconGlyph, "", click);

    private MenuItem CreateMenuItem(string iconGlyph, string header, RoutedEventHandler click)
    {
        var item = new MenuItem
        {
            Header = CreateMenuItemHeader(iconGlyph, header),
            Style  = (Style)FindResource("ClockContextMenuItemStyle")
        };
        item.Click += click;
        return item;
    }

    private UIElement CreateMenuItemHeader(string glyph, string text)
    {
        var row = new Grid { Background = System.Windows.Media.Brushes.Transparent };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var icon = CreateMenuIcon(glyph);
        Grid.SetColumn(icon, 0);
        row.Children.Add(icon);

        if (!string.IsNullOrEmpty(text))
        {
            var label = new TextBlock
            {
                Text              = text,
                FontSize          = 14,
                VerticalAlignment = VerticalAlignment.Center
            };
            label.SetResourceReference(TextBlock.ForegroundProperty, "ForegroundBrush");
            Grid.SetColumn(label, 1);
            row.Children.Add(label);
        }

        return row;
    }

    private UIElement CreateMenuIcon(string glyph)
    {
        var icon = new TextBlock
        {
            Text                = glyph,
            FontFamily          = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
            FontSize            = 20,
            Width               = 28,
            Height              = 28,
            TextAlignment       = TextAlignment.Center,
            VerticalAlignment   = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            Background          = System.Windows.Media.Brushes.Transparent,
            SnapsToDevicePixels = true,
            UseLayoutRounding   = true
        };
        TextOptions.SetTextRenderingMode(icon, TextRenderingMode.ClearType);
        TextOptions.SetTextFormattingMode(icon, TextFormattingMode.Display);
        icon.SetResourceReference(TextBlock.ForegroundProperty, "ForegroundBrush");
        return icon;
    }

    private void UpdateSettingsMenuItem()
    {
        if (_settingsMenuItem == null) return;
        bool open = _rightVisible;
        _settingsMenuItem.Header = CreateMenuItemHeader(
            open ? "\uE711" : "\uE713",
            open ? "설정 닫기" : "설정...");
    }

    private void UpdateClockModeMenuItem()
    {
        if (_clockModeMenuItem == null) return;
        if (_isDigital)
        {
            _clockModeMenuItem.Header = CreateMenuItemHeader(
                "\uE121", "아날로그 시계로 전환");
        }
        else
        {
            _clockModeMenuItem.Header = CreateMenuItemHeader(
                "\uE8A5", "디지털 시계로 전환");
        }
    }

    private void UpdateMaximizeMenuItem()
    {
        if (_maximizeMenuItem == null) return;
        bool maximized = WindowState == WindowState.Maximized;
        _maximizeMenuItem.Header = CreateMenuItemHeader(
            maximized ? "\uE923" : "\uE922",
            maximized ? "창 크기 복원" : "최대화");
    }

    private void ApplyClockModeLayout()
    {
        ApplyClockModeMinSize();
        if (!_isDigital && Height < Width * 0.75)
            Height = Math.Max(MinHeight, Width);
        SyncOverlayLayout();
    }

    private void ApplyClockModeMinSize()
    {
        MinWidth  = _isDigital ? DigitalMinWidth  : AnalogMinWidth;
        MinHeight = _isDigital ? GetDigitalMinHeight() : AnalogMinHeight;

        if (Width < MinWidth)  Width  = MinWidth;
        if (Height < MinHeight) Height = MinHeight;
    }

    private double GetDigitalMinHeight()
    {
        double h = DigitalMinHeight;
        if (!_use24h && UsesCanvasDigitalDisplay())
            h += DigitalAmPmRowHeight;
        return h;
    }

    private void ToggleSettingsPanel()
    {
        if (_rightVisible) CloseSidePanel();
        else
        {
            _rightVisible = true;
            OpenSidePanel();
        }
    }

    private void ToggleClockMode()
    {
        // Snapshot the OLD mode's geometry before flip (TrackModeGeometry keeps these current,
        // but reading them here is belt-and-suspenders and costs nothing).
        if (_isDigital) { _digitalW = Width; _digitalH = Height; _digitalL = Left; _digitalT = Top; }
        else            { _analogW  = Width; _analogH  = Height; _analogL  = Left; _analogT  = Top; }

        _isDigital = !_isDigital;

        // Snapshot restore targets into locals BEFORE any side-effects.
        // ApplyClockModeMinSize() may trigger SizeChanged → TrackModeGeometry, which would
        // overwrite the new mode's stored geometry with the current (old-mode) window state.
        // Using local vars means we always restore the correct saved geometry regardless.
        double  newW = _isDigital ? _digitalW : _analogW;
        double  newH = _isDigital ? _digitalH : _analogH;
        double? newL = _isDigital ? _digitalL : _analogL;
        double? newT = _isDigital ? _digitalT : _analogT;

        // Apply the NEW mode's min-size constraints before restoring Width/Height so WPF
        // does not clamp the window to the old mode's MinHeight/MinWidth.
        ApplyClockModeMinSize();

        Width  = newW;
        Height = newH;
        if (newL.HasValue && newT.HasValue) { Left = newL.Value; Top = newT.Value; }

        DigitalPanel.Visibility   = _isDigital ? Visibility.Visible   : Visibility.Collapsed;
        AnalogClock.Visibility    = _isDigital ? Visibility.Collapsed : Visibility.Visible;
        UpdateClockModeMenuItem();
        var active = FirstActiveTimer;
        if (active != null)
            UpdateTimerDisplay(active);
        else if (_isDigital)
            UpdateDigital(DateTime.Now);
        else
            UpdateAnalog(DateTime.Now);

        ApplyClockModeLayout();
        TrackModeGeometry();   // capture final layout-adjusted geometry for the new mode
        SaveSettings();
    }

    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
        UpdateMaximizeMenuItem();
    }

    private void OpenCalendar()
    {
        if (!_rightVisible)
        {
            _rightVisible = true;
            OpenSidePanel();
        }
        _sidePanel?.SwitchToCalendarTab();
    }

    private void AttachSidePanelChromeHover(SidePanelWindow panel)
    {
        panel.MouseEnter += SidePanel_MouseEnter;
        panel.MouseLeave += SidePanel_MouseLeave;
    }

    private void DetachSidePanelChromeHover(SidePanelWindow panel)
    {
        panel.MouseEnter -= SidePanel_MouseEnter;
        panel.MouseLeave -= SidePanel_MouseLeave;
    }

    // ── Win32 position-change hook (zero-lag side-panel sync) ─────────────

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        var hwnd = new WindowInteropHelper(this).Handle;
        HwndSource.FromHwnd(hwnd)?.AddHook(WndProc);

        var margins = new MARGINS { cxLeftWidth = -1, cxRightWidth = -1, cyTopHeight = -1, cyBottomHeight = -1 };
        DwmExtendFrameIntoClientArea(hwnd, ref margins);

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
                _sidePanel?.ApplyPanelSide(_panelOpensRight);
            }

            // Sync side panel position (uses updated _panelOpensRight)
            if (_sidePanel != null)
            {
                _sidePanel.Left   = _panelOpensRight
                    ? (newLeft + newWidth)
                    : (newLeft - _sidePanel.Width);
                ApplySidePanelPosition(newTop);
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
        UpdateMaximizeMenuItem();
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
        CheckCalendarAlarms(now);

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
            SetAmPmText(AmPmText, timer.IsPaused ? "일시정지" : "타이머");
            SetCanvasDigitalTime(text);
        }
        else
        {
            SetAmPmText(TextAmPm, timer.IsPaused ? "일시정지" : "타이머");
            string display = _digitalStyle == nameof(Models.DigitalStyle.Korean)
                ? KoreanTimeText.FormatCountdown(remaining, showSeconds: true)
                : text;
            ApplyDigitalTextTime(display);
        }

        ClockStatusText.Text = "타이머";
        if (_chromeVisible)
            ClockStatusText.Visibility = Visibility.Visible;
        SyncOverlayLayout();
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
            SetAmPmText(AmPmText, ampm);
            SetCanvasDigitalTime(FormatCanvasDigitalTime(now));
        }
        else
        {
            SetAmPmText(TextAmPm, ampm);
            bool showSeconds = _digitalStyle != nameof(Models.DigitalStyle.Minimal);
            string display = _digitalStyle == nameof(Models.DigitalStyle.Korean)
                ? KoreanTimeText.FormatClock(now, _use24h, showSeconds)
                : FormatNumericDigitalTime(now, showSeconds);
            ApplyDigitalTextTime(display);
        }

        ClockStatusText.Text = "";
        ClockStatusText.Visibility = Visibility.Collapsed;
    }

    private void ApplyDigitalTextTime(string text)
    {
        _lastDigitalText = text;

        TextTime.FontSize = _digitalTextBaseFontSize;
        TextTime.Text          = text;
        TextTime.TextWrapping  = TextWrapping.NoWrap;
        TextTime.TextAlignment = TextAlignment.Center;
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
        string status = _use24h
            ? now.ToString("HH:mm:ss")
            : now.ToString("tt hh:mm:ss");
        ClockStatusText.Text = status;
        ClockStatusText.Visibility = _chromeVisible ? Visibility.Visible : Visibility.Collapsed;
        SyncOverlayLayout();
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

    private void CheckCalendarAlarms(DateTime now)
    {
        var events = _sidePanel?.CalEvents;
        if (events == null || events.Count == 0) return;

        foreach (var ev in events)
        {
            if (ev.ReminderMinutes == null) continue;

            // 알람 발화 시각 = 일정 시작 - ReminderMinutes
            var eventStart = ev.Date.Date + (ev.IsAllDay ? TimeSpan.Zero : ev.StartTime);
            var fireAt     = eventStart.AddMinutes(-ev.ReminderMinutes.Value);

            // 현재 분(초 무시)이 발화 시각의 분과 일치할 때 1번만 발화
            var fireMinute = new DateTime(fireAt.Year, fireAt.Month, fireAt.Day,
                                         fireAt.Hour, fireAt.Minute, 0);
            var nowMinute  = new DateTime(now.Year, now.Month, now.Day,
                                         now.Hour, now.Minute, 0);

            if (nowMinute == fireMinute && _firedCalEvents.Add(ev.Id))
            {
                string timeStr = ev.IsAllDay
                    ? ev.Date.ToString("M월 d일")
                    : $"{ev.Date:M월 d일} {ev.StartTime:hh\\:mm}";
                ShowAlarmNotification(timeStr, ev.Title, "일정 알림");
            }
            else if (nowMinute > fireMinute.AddMinutes(1))
            {
                _firedCalEvents.Remove(ev.Id);
            }
        }
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

    // ── Theme & display (called from SidePanelWindow) ─────────────────────

    internal void ApplyTheme(string name)
    {
        _currentTheme = name;
        var dicts = Application.Current.Resources.MergedDictionaries;
        dicts[0] = new ResourceDictionary
        {
            Source = new Uri($"Themes/{name}.xaml", UriKind.Relative)
        };
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

        if (_isDigital)
        {
            ApplyClockModeMinSize();
            UpdateDigital(DateTime.Now);
        }
    }

    internal void ApplyAnalogStyle(string style)
    {
        _analogStyle = style;
        if (Enum.TryParse<Models.AnalogStyle>(style, out var s))
            AnalogClock.ClockStyle = s;
        if (!_isDigital) UpdateAnalog(DateTime.Now);
    }

    // ── Side panel ────────────────────────────────────────────────────────

    private void OpenSidePanel()
    {
        _panelOpensRight = DetermineOpenRight();

        _sidePanel = new SidePanelWindow(_alarms, _timers, _alarmSounds, _stopwatchService) { Owner = this };
        _sidePanel.OnThemeRequested       = name => { ApplyTheme(name); SaveSettings(); };
        _sidePanel.OnFormatChanged        = v =>
        {
            _use24h = v;
            ApplyClockModeMinSize();
        };
        _sidePanel.OnWorldFormatChanged   = v => { _worldUse24h = v; };
        _sidePanel.OnBrightnessChanged    = ApplyBrightness;
        _sidePanel.OnDigitColorChanged    = c => { ApplyDigitColor(c); SaveSettings(); };
        _sidePanel.OnResetRequested       = ResetToDefaults;
        _sidePanel.OnDigitalStyleChanged  = s => { ApplyDigitalStyle(s); SaveSettings(); };
        _sidePanel.OnAnalogStyleChanged   = s => { ApplyAnalogStyle(s); SaveSettings(); };
        _sidePanel.OnSettingsChanged      = SaveSettings;
        _sidePanel.WorldPanel.LoadEntries(_worldCities);
        _sidePanel.WorldPanel.EntriesChanged += OnWorldCitiesChanged;
        _sidePanel.Closed += (s, _) =>
        {
            if (_rightVisible)
                _rightVisible = false;
            if (s is SidePanelWindow panel)
                DetachSidePanelChromeHover(panel);
            _sidePanel = null;
            UpdateSettingsMenuItem();
            ScheduleHideChrome();
        };

        _sidePanel.ApplySettings(_use24h, _worldUse24h, (int)Math.Round(_brightness * 100),
            _digitalStyle, _analogStyle,
            _alarmSounds.SoundId, (int)Math.Round(_alarmSounds.Volume * 100));
        PositionSidePanel();
        _sidePanel.ApplyPanelSide(_panelOpensRight);
        AttachSidePanelChromeHover(_sidePanel);
        _sidePanel.Show();
        UpdateSettingsMenuItem();
        SetChromeVisible(true);
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
        var panel = _sidePanel;
        panel.AnimateClose(_panelOpensRight, () => Dispatcher.Invoke(() => panel.Close()));
    }

    /// <summary>Close settings panel without animation (tray hide/restore).</summary>
    private void CloseSidePanelImmediate()
    {
        if (_sidePanel == null) return;

        _worldCities = _sidePanel.WorldPanel.ToDtos();
        _rightVisible  = false;

        var panel = _sidePanel;
        _sidePanel  = null;
        panel.Hide();
        panel.Close();
    }

    private void PositionSidePanel()
    {
        if (_sidePanel == null) return;
        ApplySidePanelPosition(Top);
        _sidePanel.Left = _panelOpensRight ? (Left + Width) : (Left - 1);
    }

    private static double GetSidePanelHeight()
    {
        var area = SystemParameters.WorkArea;
        return Math.Min(SidePanelWindow.PreferredHeight, area.Height);
    }

    private void ApplySidePanelPosition(double clockTop)
    {
        if (_sidePanel == null) return;

        double panelH = GetSidePanelHeight();
        var area = SystemParameters.WorkArea;

        double top = clockTop;
        if (top + panelH > area.Bottom)
            top = Math.Max(area.Top, area.Bottom - panelH);

        _sidePanel.Height = panelH;
        _sidePanel.Top    = top;
    }

    // ── Window chrome ─────────────────────────────────────────────────────

    private bool DetermineOpenRight() => DetermineOpenRightAt(Left, Width, _panelOpensRight);

    // preferRight: current side — only flip when that side runs out of space
    private static bool DetermineOpenRightAt(double left, double width, bool preferRight)
    {
        var area = SystemParameters.WorkArea;
        bool canRight = (left + width + 400) <= area.Right;
        bool canLeft  = (left         - 400) >= area.Left;
        if (preferRight) return canRight || !canLeft;
        else             return !canLeft;
    }

    private bool IsInResizeBorder(System.Windows.Point p)
    {
        double w = ActualWidth, h = ActualHeight;
        if (w <= 0 || h <= 0) return false;

        double t = ResizeBorderHit;
        return p.X <= t || p.Y <= t || p.X >= w - t || p.Y >= h - t;
    }

    private void Window_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_windowContextMenu == null) return;

        UpdateSettingsMenuItem();
        UpdateClockModeMenuItem();
        UpdateMaximizeMenuItem();

        _windowContextMenu.PlacementTarget = this;
        _windowContextMenu.IsOpen = true;
        e.Handled = true;
    }

    private void Window_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left) return;
        if (IsInResizeBorder(e.GetPosition(this))) return;

        _mouseDownScreen = PointToScreen(e.GetPosition(this));

        if (_rightVisible && _sidePanel != null)
        {
            _awaitingSettingsCloseOrDrag = true;
            CaptureMouse();
            e.Handled = true;
            return;
        }

        BeginWindowDrag();
        e.Handled = true;
    }

    private void Window_MouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed) return;

        var screen = PointToScreen(e.GetPosition(this));

        if (_awaitingSettingsCloseOrDrag)
        {
            if (DragDistance(screen, _mouseDownScreen) <= 4) return;

            _awaitingSettingsCloseOrDrag = false;
            _dragWindowOrigin = new System.Windows.Point(Left, Top);
            _mouseDownScreen  = screen;
            _isDraggingWindow = true;
            return;
        }

        if (!_isDraggingWindow) return;

        Left = _dragWindowOrigin.X + (screen.X - _mouseDownScreen.X);
        Top  = _dragWindowOrigin.Y + (screen.Y - _mouseDownScreen.Y);
    }

    private void Window_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left) return;
        if (_awaitingSettingsCloseOrDrag)
        {
            var screen = PointToScreen(e.GetPosition(this));
            if (DragDistance(screen, _mouseDownScreen) <= 4)
            {
                RequestCloseSidePanel();
                UpdateSettingsMenuItem();
            }
        }

        _awaitingSettingsCloseOrDrag = false;
        _isDraggingWindow = false;
        if (IsMouseCaptured)
            ReleaseMouseCapture();

        EnsureWindowOnScreen();
    }

    private void BeginWindowDrag()
    {
        _isDraggingWindow = true;
        _dragWindowOrigin = new System.Windows.Point(Left, Top);
        CaptureMouse();
    }

    private static double DragDistance(System.Windows.Point a, System.Windows.Point b)
    {
        double dx = a.X - b.X, dy = a.Y - b.Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }
}
