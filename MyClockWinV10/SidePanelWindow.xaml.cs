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
using MyClockWinV10.Screensaver;
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
    public Action<Color>?  OnAmPmColorChanged;
    public Action?         OnResetRequested;
    public Action<string>? OnDigitalStyleChanged;
    public Action<string>? OnAnalogStyleChanged;
    public Action<bool>?   OnAlwaysOnTopChanged;
    public Action? OnSettingsChanged;

    internal const double TargetWidth = 400;
    internal const double PreferredHeight = 560;

    private bool _panelOpensRight = true;

    private readonly ObservableCollection<TimerItem> _timers;
    private readonly AlarmSoundPlayer  _sounds;
    private readonly StopwatchService  _stopwatch;
    private readonly System.Windows.Threading.DispatcherTimer _swTimer = new()
        { Interval = TimeSpan.FromMilliseconds(50) };
    private bool _suppressSoundComboChange;

    private readonly List<RadioButton> _digitalStyleRadios = new();
    private readonly List<RadioButton> _analogStyleRadios  = new();
    private Button? _digitCustomColorBtn;
    private Button? _amPmCustomColorBtn;
    private readonly List<Button> _amPmColorButtons = new();
    private Color _currentDigitColor     = Color.FromRgb(0x58, 0xA6, 0xFF);
    private Color _currentAmPmColor      = Color.FromRgb(0x89, 0xB4, 0xFA);
    private Color _lastCustomAmPmColor   = Color.FromRgb(0x89, 0xB4, 0xFA);

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
        AlarmSoundPlayer sounds,
        StopwatchService stopwatch)
    {
        _timers    = timers;
        _sounds    = sounds;
        _stopwatch = stopwatch;
        InitializeComponent();
        AlarmList.ItemsSource  = alarms;
        TimerList.ItemsSource  = timers;
        SwLapList.ItemsSource  = stopwatch.Laps;
        BuildColorSwatches();
        BuildAmPmColorSwatches();
        BuildClockStyleRadios();
        BuildAlarmSoundCombo();
        WorldPanel.EntriesChanged += () => OnSettingsChanged?.Invoke();
        _swTimer.Tick += (_, _) => RefreshSwDisplay();
        InitStopwatchUi();
        InitCalendar();
    }

    // ── Stopwatch ─────────────────────────────────────────────────────────

    private void InitStopwatchUi()
    {
        RefreshSwDisplay();
        bool running = _stopwatch.IsRunning;
        SwStartBtn.IsEnabled = !running;
        SwLapBtn.IsEnabled   =  running;
        SwStopBtn.IsEnabled  =  running;
        if (running) _swTimer.Start();
    }

    private void RefreshSwDisplay()
    {
        var e = _stopwatch.Elapsed;
        SwDisplay.Text =
            $"{(int)e.TotalHours:D2}:{e.Minutes:D2}:{e.Seconds:D2}.{e.Milliseconds / 10:D2}";
    }

    private void SwStart_Click(object sender, RoutedEventArgs e)
    {
        _stopwatch.Start();
        SwStartBtn.IsEnabled = false;
        SwLapBtn.IsEnabled   = true;
        SwStopBtn.IsEnabled  = true;
        _swTimer.Start();
    }

    private void SwLap_Click(object sender, RoutedEventArgs e)
        => _stopwatch.RecordLap();

    private void SwStop_Click(object sender, RoutedEventArgs e)
    {
        _stopwatch.Stop();
        _swTimer.Stop();
        RefreshSwDisplay();
        SwStartBtn.IsEnabled = true;
        SwLapBtn.IsEnabled   = false;
        SwStopBtn.IsEnabled  = false;
    }

    private void SwReset_Click(object sender, RoutedEventArgs e)
    {
        _stopwatch.Reset();
        _swTimer.Stop();
        SwDisplay.Text       = "00:00:00.00";
        SwStartBtn.IsEnabled = true;
        SwLapBtn.IsEnabled   = false;
        SwStopBtn.IsEnabled  = false;
    }

    // ── Built-in Calendar ────────────────────────────────────────────────

    private DateTime _calMonth = new(DateTime.Today.Year, DateTime.Today.Month, 1);
    internal List<CalendarEvent> CalEvents { get; private set; } = [];

    private void InitCalendar()
    {
        CalEvents = CalendarEventStore.Load();
        RebuildCalendar();
    }

    // ── Calendar layout constants ──────────────────────────────────────────
    private const double CalRowHeight = 72;
    private const double DayNumHeight = 20;
    private const double LaneHeight   = 15;
    private const int    MaxLanes     = 3;

    internal void RebuildCalendar()
    {
        var g = CalDayGrid;
        g.Children.Clear();
        g.RowDefinitions.Clear();
        g.ColumnDefinitions.Clear();

        CalMonthTitle.Text = _calMonth.ToString("yyyy년 M월");

        int startOffset = (int)_calMonth.DayOfWeek; // 0=Sun

        for (int c = 0; c < 7; c++)
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        for (int r = 0; r < 6; r++)
        {
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(CalRowHeight) });

            DateTime weekStart = _calMonth.AddDays(r * 7 - startOffset);
            DateTime weekEnd   = weekStart.AddDays(6);

            // ── Collect multi-day bars for this week ────────────────────
            var rawBars = new List<(CalendarEvent ev, int c0, int c1)>();
            foreach (var ev in CalEvents)
            {
                if (ev.Recurrence != RecurrenceType.None || !ev.IsMultiDay) continue;
                DateTime evEnd = ev.EndDate!.Value.Date;
                if (ev.Date.Date > weekEnd || evEnd < weekStart) continue;
                int c0 = Math.Max(0, (int)(ev.Date.Date - weekStart).TotalDays);
                int c1 = Math.Min(6, (int)(evEnd   - weekStart).TotalDays);
                rawBars.Add((ev, c0, c1));
            }
            rawBars.Sort((a, b) =>
            {
                int cmp = (b.c1 - b.c0).CompareTo(a.c1 - a.c0); // longer first
                return cmp != 0 ? cmp : a.c0.CompareTo(b.c0);
            });

            // Greedy lane assignment
            int[] laneEnd = { -1, -1, -1 };
            var bars = new List<(CalendarEvent ev, int c0, int c1, int lane)>();
            foreach (var (ev, c0, c1) in rawBars)
            {
                int lane = -1;
                for (int l = 0; l < MaxLanes; l++)
                    if (laneEnd[l] < c0) { lane = l; laneEnd[l] = c1; break; }
                if (lane >= 0) bars.Add((ev, c0, c1, lane));
                // overflow: still accessible via context menu
            }

            // Which lanes each column already has occupied
            var occupied = new HashSet<int>[7];
            for (int c = 0; c < 7; c++) occupied[c] = [];
            foreach (var (_, c0, c1, lane) in bars)
                for (int c = c0; c <= c1; c++) occupied[c].Add(lane);

            // ── Per-cell: background + day number + single-day chips ────
            for (int c = 0; c < 7; c++)
            {
                DateTime date  = weekStart.AddDays(c);
                bool valid     = date.Year == _calMonth.Year && date.Month == _calMonth.Month;
                bool isToday   = valid && date == DateTime.Today;
                bool isSun     = date.DayOfWeek == DayOfWeek.Sunday;
                bool isSat     = date.DayOfWeek == DayOfWeek.Saturday;

                Brush numFg = isToday ? Brushes.White
                            : !valid  ? (Brush)FindResource("SubtleForegroundBrush")
                            : isSun   ? new SolidColorBrush(Color.FromRgb(0xE0, 0x55, 0x55))
                            : isSat   ? new SolidColorBrush(Color.FromRgb(0x55, 0x88, 0xEE))
                            :           (Brush)FindResource("ForegroundBrush");

                // Background cell (click + context menu)
                var cell = new Border
                {
                    Background    = isToday ? (Brush)FindResource("AccentBrush") : Brushes.Transparent,
                    Margin        = new Thickness(1),
                    CornerRadius  = new CornerRadius(4),
                    Cursor        = valid ? Cursors.Hand : Cursors.Arrow,
                    ClipToBounds  = true
                };
                Grid.SetRow(cell, r); Grid.SetColumn(cell, c);
                g.Children.Add(cell);

                // Day number
                var numTb = new TextBlock
                {
                    Text                = valid ? date.Day.ToString() : "",
                    FontSize            = 11,
                    FontWeight          = isToday ? FontWeights.Bold : FontWeights.Normal,
                    Foreground          = numFg,
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment   = VerticalAlignment.Top,
                    Margin              = new Thickness(0, 2, 4, 0),
                    IsHitTestVisible    = false
                };
                Grid.SetRow(numTb, r); Grid.SetColumn(numTb, c);
                g.Children.Add(numTb);

                if (!valid) continue;

                var capturedDate = date;
                var allEvts      = GetEventsForDate(date);
                var singleEvts   = GetSingleDayEventsForDate(date);

                // Double-click → add/edit
                cell.MouseLeftButtonDown += (_, e) =>
                {
                    if (e.ClickCount != 2) return;
                    var evts = GetEventsForDate(capturedDate);
                    if (evts.Count > 0) OpenEditEventDialog(evts[0], capturedDate);
                    else                OpenAddEventDialog(capturedDate);
                };
                AttachContextMenu(cell, capturedDate, allEvts);

                // Single-day chips in available lanes
                var availLanes = Enumerable.Range(0, MaxLanes)
                                           .Where(l => !occupied[c].Contains(l))
                                           .ToList();
                for (int li = 0; li < Math.Min(singleEvts.Count, availLanes.Count); li++)
                {
                    var ev      = singleEvts[li];
                    double top  = DayNumHeight + availLanes[li] * LaneHeight;
                    var chip    = MakeEventChip(ev, top, true);
                    var capEv   = ev;
                    chip.MouseLeftButtonDown += (_, _) => OpenEditEventDialog(capEv, capturedDate);
                    AttachEventBarContextMenu(chip, capEv, capturedDate);
                    Grid.SetRow(chip, r); Grid.SetColumn(chip, c);
                    g.Children.Add(chip);
                }
            }

            // ── Multi-day spanning bars ─────────────────────────────────
            foreach (var (ev, c0, c1, lane) in bars)
            {
                double top      = DayNumHeight + lane * LaneHeight;
                bool startsHere = ev.Date.Date >= weekStart;
                bool endsHere   = ev.EndDate!.Value.Date <= weekEnd;
                var bar = MakeEventChip(ev, top, false,
                    new CornerRadius(startsHere ? 3 : 0, endsHere ? 3 : 0,
                                    endsHere   ? 3 : 0, startsHere ? 3 : 0),
                    new Thickness(startsHere ? 2 : 0, top, endsHere ? 2 : 0, 0),
                    showTitle: startsHere);

                var capEv   = ev;
                var capDate = weekStart.AddDays(c0);
                bar.MouseLeftButtonDown += (_, _) => OpenEditEventDialog(capEv, capDate);
                AttachEventBarContextMenu(bar, capEv, capDate);

                Grid.SetRow(bar, r);
                Grid.SetColumn(bar, c0);
                Grid.SetColumnSpan(bar, c1 - c0 + 1);
                g.Children.Add(bar);
            }
        }
    }

    private Border MakeEventChip(CalendarEvent ev, double topMargin, bool singleDay,
        CornerRadius? radius = null, Thickness? margin = null, bool showTitle = true)
    {
        var border = new Border
        {
            Background        = PastelBrush(ev.Color),
            CornerRadius      = radius ?? new CornerRadius(3),
            Margin            = margin ?? new Thickness(1, topMargin, 1, 0),
            Height            = LaneHeight - 2,
            VerticalAlignment = VerticalAlignment.Top,
            ClipToBounds      = true,
            Cursor            = Cursors.Hand,
            ToolTip           = $"{(ev.IsAllDay ? "종일" : ev.StartTime.ToString(@"hh\:mm"))}  {ev.Title}"
        };
        border.Child = new TextBlock
        {
            Text                = showTitle ? ev.Title : "",
            FontSize            = 9,
            Foreground          = Brushes.White,
            TextTrimming        = TextTrimming.CharacterEllipsis,
            VerticalAlignment   = VerticalAlignment.Center,
            Margin              = new Thickness(4, 0, 2, 0)
        };
        return border;
    }

    private static SolidColorBrush PastelBrush(string hex)
    {
        try
        {
            var c = (Color)System.Windows.Media.ColorConverter.ConvertFromString(hex);
            return new SolidColorBrush(Color.FromArgb(185, c.R, c.G, c.B));
        }
        catch { return new SolidColorBrush(Color.FromArgb(185, 0x4A, 0x90, 0xD9)); }
    }

    private void AttachContextMenu(Border cell, DateTime date, List<CalendarEvent> evts)
    {
        var cm = new ContextMenu();
        foreach (var ev in evts)
        {
            var capEv     = ev;
            var timeLabel = ev.IsAllDay ? "종일" : ev.StartTime.ToString(@"hh\:mm");
            var mi        = new MenuItem { Header = $"{timeLabel}  {ev.Title}" };
            mi.Click += (_, _) => OpenEditEventDialog(capEv, date);
            cm.Items.Add(mi);
        }
        if (evts.Count > 0) cm.Items.Add(new Separator());
        var addMi = new MenuItem { Header = "일정 추가" };
        addMi.Click += (_, _) => OpenAddEventDialog(date);
        cm.Items.Add(addMi);
        cell.ContextMenu = cm;
    }

    private void AttachEventBarContextMenu(Border bar, CalendarEvent ev, DateTime date)
    {
        var cm = new ContextMenu();
        var editMi = new MenuItem { Header = $"편집: {ev.Title}" };
        editMi.Click += (_, _) => OpenEditEventDialog(ev, date);
        cm.Items.Add(editMi);
        var delMi = new MenuItem { Header = $"삭제: {ev.Title}" };
        delMi.Click += (_, _) =>
        {
            if (MessageBox.Show($"'{ev.Title}' 일정을 삭제하시겠습니까?",
                "일정 삭제", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
            {
                var found = CalEvents.FirstOrDefault(e => e.Id == ev.Id);
                if (found != null) { CalEvents.Remove(found); CalendarEventStore.Save(CalEvents); RebuildCalendar(); }
            }
        };
        cm.Items.Add(delMi);
        bar.ContextMenu = cm;
    }

    private List<CalendarEvent> GetEventsForDate(DateTime date)
    {
        var result = new List<CalendarEvent>();
        foreach (var ev in CalEvents)
        {
            if (ev.Date.Date > date.Date) continue;
            if (ev.Recurrence != RecurrenceType.None)
            {
                bool matches = ev.Recurrence switch
                {
                    RecurrenceType.Daily   => true,
                    RecurrenceType.Weekly  => ev.Date.DayOfWeek == date.DayOfWeek,
                    RecurrenceType.Monthly => ev.Date.Day == date.Day,
                    RecurrenceType.Yearly  => ev.Date.Month == date.Month && ev.Date.Day == date.Day,
                    _                      => false
                };
                if (matches) result.Add(ev);
            }
            else
            {
                var endDate = ev.EndDate?.Date ?? ev.Date.Date;
                if (date.Date <= endDate) result.Add(ev);
            }
        }
        return result;
    }

    private List<CalendarEvent> GetSingleDayEventsForDate(DateTime date)
    {
        var result = new List<CalendarEvent>();
        foreach (var ev in CalEvents)
        {
            if (ev.Date.Date > date.Date) continue;
            if (ev.Recurrence != RecurrenceType.None)
            {
                bool matches = ev.Recurrence switch
                {
                    RecurrenceType.Daily   => true,
                    RecurrenceType.Weekly  => ev.Date.DayOfWeek == date.DayOfWeek,
                    RecurrenceType.Monthly => ev.Date.Day == date.Day,
                    RecurrenceType.Yearly  => ev.Date.Month == date.Month && ev.Date.Day == date.Day,
                    _                      => false
                };
                if (matches) result.Add(ev);
            }
            else if (!ev.IsMultiDay && ev.Date.Date == date.Date)
            {
                result.Add(ev);
            }
        }
        return result;
    }

    private void OpenAddEventDialog(DateTime date)
    {
        var dlg = new AddCalendarEventDialog(date, this);
        if (dlg.ShowDialog() == true && dlg.Result != null)
        {
            CalEvents.Add(dlg.Result);
            CalendarEventStore.Save(CalEvents);
            RebuildCalendar();
        }
    }

    private void OpenEditEventDialog(CalendarEvent existing, DateTime displayDate)
    {
        var dlg = new AddCalendarEventDialog(existing, this);
        if (dlg.ShowDialog() != true) return;
        if (dlg.Deleted)
        {
            var original = CalEvents.FirstOrDefault(e => e.Id == existing.Id);
            if (original != null) CalEvents.Remove(original);
        }
        else if (dlg.Result != null)
        {
            int idx = CalEvents.FindIndex(e => e.Id == existing.Id);
            if (idx >= 0) CalEvents[idx] = dlg.Result;
            else          CalEvents.Add(dlg.Result);
        }
        CalendarEventStore.Save(CalEvents);
        RebuildCalendar();
    }

    private void CalPrev_Click(object sender, RoutedEventArgs e)
    {
        _calMonth = _calMonth.AddMonths(-1);
        RebuildCalendar();
    }

    private void CalNext_Click(object sender, RoutedEventArgs e)
    {
        _calMonth = _calMonth.AddMonths(1);
        RebuildCalendar();
    }

    // ─────────────────────────────────────────────────────────────────────

    public void SwitchToCalendarTab()
        => SettingsTabControl.SelectedIndex = 4;

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
        {
            ((ObservableCollection<AlarmItem>)AlarmList.ItemsSource!).Add(dlg.Result);
            OnSettingsChanged?.Invoke();
        }
    }

    private void EditAlarm_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is AlarmItem alarm)
        {
            if (new AddAlarmDialog(alarm) { Owner = Owner ?? this }.ShowDialog() == true)
                OnSettingsChanged?.Invoke();
        }
    }

    private void DeleteAlarm_Click(object sender, RoutedEventArgs e)
    {
        if (((Button)sender).DataContext is AlarmItem alarm)
        {
            ((ObservableCollection<AlarmItem>)AlarmList.ItemsSource!).Remove(alarm);
            OnSettingsChanged?.Invoke();
        }
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

    private void ScreensaverConfig_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new ScreensaverConfigWindow { Owner = this };
        dlg.ShowDialog();
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
        BuildColorSwatchButtons(ColorSwatches, c =>
        {
            _currentDigitColor = c;
            UpdateCustomColorButtonPreview(_digitCustomColorBtn, c);
            OnDigitColorChanged?.Invoke(c);
        });

        _digitCustomColorBtn = CreateCustomColorButton(PickDigitColor);
        ColorSwatches.Children.Add(_digitCustomColorBtn);
        UpdateCustomColorButtonPreview(_digitCustomColorBtn, _currentDigitColor);
    }

    private void PickDigitColor()
    {
        if (!TryPickColor(_currentDigitColor, out var picked)) return;
        _currentDigitColor = picked;
        UpdateCustomColorButtonPreview(_digitCustomColorBtn, picked);
        OnDigitColorChanged?.Invoke(picked);
    }

    private void BuildAmPmColorSwatches()
    {
        foreach (var (label, color) in DigitColors)
        {
            var btn = CreatePresetColorButton(label, color);
            var captured = color;
            btn.Click += (_, _) => SelectAmPmColor(captured);
            _amPmColorButtons.Add(btn);
            AmPmColorSwatches.Children.Add(btn);
        }

        _amPmCustomColorBtn = CreateCustomColorButton(PickAmPmColor);
        _amPmColorButtons.Add(_amPmCustomColorBtn);
        AmPmColorSwatches.Children.Add(_amPmCustomColorBtn);
        UpdateAmPmCustomButtonPreview();
        UpdateAmPmColorSelection(_currentAmPmColor);
    }

    private void SelectAmPmColor(Color color)
    {
        _currentAmPmColor = color;
        if (!IsPresetColor(color))
            _lastCustomAmPmColor = color;
        UpdateAmPmCustomButtonPreview();
        UpdateAmPmColorSelection(color);
        OnAmPmColorChanged?.Invoke(color);
    }

    private void UpdateAmPmCustomButtonPreview()
    {
        if (_amPmCustomColorBtn is null) return;
        _amPmCustomColorBtn.Background = new SolidColorBrush(_lastCustomAmPmColor);
        _amPmCustomColorBtn.Foreground = IsLight(_lastCustomAmPmColor) ? Brushes.Black : Brushes.White;
    }

    private void PickAmPmColor()
    {
        if (!TryPickColor(_currentAmPmColor, out var picked)) return;
        SelectAmPmColor(picked);
    }

    private void UpdateAmPmColorSelection(Color selected)
    {
        foreach (var btn in _amPmColorButtons)
        {
            bool isSelected = btn == _amPmCustomColorBtn
                ? !IsPresetColor(selected)
                : btn.Tag is Color c && ColorsMatch(c, selected);

            if (btn == _amPmCustomColorBtn)
                btn.BorderThickness = new Thickness(isSelected ? 2 : 1);
            else
                btn.BorderThickness = new Thickness(isSelected ? 2 : 0);

            if (isSelected)
                btn.BorderBrush = Brushes.White;
            else if (btn == _amPmCustomColorBtn)
                btn.SetResourceReference(Border.BorderBrushProperty, "BorderBrush");
            else
                btn.ClearValue(Border.BorderBrushProperty);
        }
    }

    private Button CreateCustomColorButton(Action pickColor)
    {
        var btn = new Button
        {
            Width           = 72,
            Height          = 36,
            Content         = "사용자 정의",
            FontSize        = 11,
            BorderThickness = new Thickness(1),
            Margin          = new Thickness(0, 0, 5, 5),
            Style           = (Style)FindResource("CustomColorPickerButtonStyle")
        };
        btn.SetResourceReference(Border.BorderBrushProperty, "BorderBrush");
        btn.Click += (_, _) => pickColor();
        return btn;
    }

    private static bool TryPickColor(Color current, out Color picked)
    {
        picked = current;
        using var dlg = new System.Windows.Forms.ColorDialog
        {
            FullOpen = true,
            Color = System.Drawing.Color.FromArgb(current.R, current.G, current.B)
        };
        if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return false;
        picked = Color.FromRgb(dlg.Color.R, dlg.Color.G, dlg.Color.B);
        return true;
    }

    private static void UpdateCustomColorButtonPreview(Button? btn, Color color)
    {
        if (btn is null) return;

        if (IsPresetColor(color))
        {
            btn.ClearValue(Control.BackgroundProperty);
            btn.ClearValue(Control.ForegroundProperty);
            btn.SetResourceReference(Control.BackgroundProperty, "ButtonBackgroundBrush");
            btn.SetResourceReference(Control.ForegroundProperty, "ButtonForegroundBrush");
        }
        else
        {
            btn.Background = new SolidColorBrush(color);
            btn.Foreground = IsLight(color) ? Brushes.Black : Brushes.White;
        }
    }

    private static bool IsPresetColor(Color color)
        => DigitColors.Any(p => ColorsMatch(p.Color, color));

    private static bool ColorsMatch(Color a, Color b)
        => a.R == b.R && a.G == b.G && a.B == b.B;

    private static Button CreatePresetColorButton(string label, Color color) => new()
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

    private static void BuildColorSwatchButtons(WrapPanel panel, Action<Color>? onColorChanged)
    {
        foreach (var (label, color) in DigitColors)
        {
            var btn = CreatePresetColorButton(label, color);
            btn.Click += (s, _) => { if (s is Button b && b.Tag is Color c) onColorChanged?.Invoke(c); };
            panel.Children.Add(btn);
        }
    }

    private static bool IsLight(Color c)
        => (c.R * 299 + c.G * 587 + c.B * 114) / 1000 > 128;

    // ── Settings sync (called from MainWindow) ────────────────────────────

    public void ApplySettings(bool use24h, bool worldUse24h, int brightness,
                              string digitalStyle, string analogStyle,
                              string alarmSoundId, int alarmVolume,
                              bool alwaysOnTop, Color digitColor, Color amPmColor)
    {
        _currentDigitColor = digitColor;
        _currentAmPmColor  = amPmColor;
        if (!IsPresetColor(amPmColor))
            _lastCustomAmPmColor = amPmColor;
        UpdateCustomColorButtonPreview(_digitCustomColorBtn, digitColor);
        UpdateAmPmCustomButtonPreview();
        UpdateAmPmColorSelection(amPmColor);
        Format12h.Checked       -= Format_Checked;
        Format24h.Checked       -= Format_Checked;
        WorldFormat12h.Checked  -= WorldFormat_Checked;
        WorldFormat24h.Checked  -= WorldFormat_Checked;
        AlwaysOnTopToggle.Checked   -= AlwaysOnTop_Changed;
        AlwaysOnTopToggle.Unchecked -= AlwaysOnTop_Changed;
        StartupToggle.Checked   -= Startup_Changed;
        StartupToggle.Unchecked -= Startup_Changed;
        SetClockStyleHandlers(enabled: false);
        (use24h ? Format24h : Format12h).IsChecked                = true;
        (worldUse24h ? WorldFormat24h : WorldFormat12h).IsChecked = true;
        BrightnessSlider.Value  = Math.Clamp(brightness, 0, 100);
        Dispatcher.BeginInvoke(UpdateBrightnessScaleLabels, System.Windows.Threading.DispatcherPriority.Loaded);
        AlwaysOnTopToggle.IsChecked = alwaysOnTop;
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
        AlwaysOnTopToggle.Checked   += AlwaysOnTop_Changed;
        AlwaysOnTopToggle.Unchecked += AlwaysOnTop_Changed;
        StartupToggle.Checked   += Startup_Changed;
        StartupToggle.Unchecked += Startup_Changed;
    }

    private void AlwaysOnTop_Changed(object sender, RoutedEventArgs e)
        => OnAlwaysOnTopChanged?.Invoke(AlwaysOnTopToggle.IsChecked == true);

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
