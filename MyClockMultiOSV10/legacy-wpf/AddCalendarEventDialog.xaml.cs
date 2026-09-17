using System;
using System.Globalization;
using System.Windows;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class AddCalendarEventDialog : Window
{
    private static readonly string[] ColorOptions =
    [
        "#4A90D9", "#E05C5C", "#4CAF50", "#F5A623",
        "#9B59B6", "#1ABC9C", "#E67E22", "#EC407A",
    ];

    private static readonly (string Label, int? Minutes)[] ReminderOptions =
    [
        ("알람 없음",  null),
        ("정시",       0),
        ("5분 전",     5),
        ("10분 전",    10),
        ("15분 전",    15),
        ("30분 전",    30),
        ("1시간 전",   60),
        ("2시간 전",   120),
        ("1일 전",     1440),
    ];

    private static readonly (string Label, RecurrenceType Value)[] RecurrenceOptions =
    [
        ("없음",  RecurrenceType.None),
        ("매일",  RecurrenceType.Daily),
        ("매주",  RecurrenceType.Weekly),
        ("매월",  RecurrenceType.Monthly),
        ("매년",  RecurrenceType.Yearly),
    ];

    public CalendarEvent?  Result  { get; private set; }
    public bool            Deleted { get; private set; }

    private DateTime             _date;
    private readonly CalendarEvent? _existing;
    private int _startH, _startM, _endH, _endM;

    public AddCalendarEventDialog(DateTime date, Window owner)
        : this(date, null, owner) { }

    public AddCalendarEventDialog(CalendarEvent existing, Window owner)
        : this(existing.Date, existing, owner) { }

    private AddCalendarEventDialog(DateTime date, CalendarEvent? existing, Window owner)
    {
        InitializeComponent();
        Owner     = owner;
        _date     = date.Date;
        _existing = existing;

        Title = existing == null ? "일정 추가" : "일정 편집";

        StartDatePicker.SelectedDate = _date;
        LunarLabel.Text = LunarString(_date);

        foreach (var (label, _) in ReminderOptions)
            ReminderCombo.Items.Add(label);
        foreach (var (label, _) in RecurrenceOptions)
            RecurrenceCombo.Items.Add(label);

        if (existing != null)
        {
            TitleBox.Text         = existing.Title;
            DescBox.Text          = existing.Description;
            DeleteBtn.Visibility  = Visibility.Visible;
            AllDayCheck.IsChecked = existing.IsAllDay;

            _startH = (int)existing.StartTime.TotalHours;
            _startM = existing.StartTime.Minutes;
            _endH   = (int)existing.EndTime.TotalHours;
            _endM   = existing.EndTime.Minutes;

            var endD = existing.EndDate?.Date ?? _date;
            EndDatePicker.SelectedDate = endD;
            EndLunarLabel.Text = LunarString(endD);

            ReminderCombo.SelectedIndex   = IndexOfReminder(existing.ReminderMinutes);
            RecurrenceCombo.SelectedIndex = IndexOfRecurrence(existing.Recurrence);
        }
        else
        {
            var now  = DateTime.Now;
            var next = now.Minute == 0 ? now : now.AddMinutes(60 - now.Minute);
            _startH = next.Hour;
            _startM = 0;
            _endH   = (_startH + 1) % 24;
            _endM   = 0;

            EndDatePicker.SelectedDate = _date;
            EndLunarLabel.Text = LunarString(_date);

            ReminderCombo.SelectedIndex   = IndexOfReminder(15);
            RecurrenceCombo.SelectedIndex = 0;
        }

        EndDatePicker.DisplayDateStart = _date;
        RefreshTimeDisplay();
        SelectColorSwatch(existing?.Color ?? ColorOptions[0]);

        TitleBox.Focus();
        TitleBox.SelectAll();
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private void SelectColorSwatch(string hex)
    {
        foreach (System.Windows.Controls.RadioButton rb in ColorPanel.Children)
        {
            if (rb.Tag as string == hex) { rb.IsChecked = true; return; }
        }
        if (ColorPanel.Children.Count > 0)
            ((System.Windows.Controls.RadioButton)ColorPanel.Children[0]).IsChecked = true;
    }

    private string GetSelectedColor()
    {
        foreach (System.Windows.Controls.RadioButton rb in ColorPanel.Children)
            if (rb.IsChecked == true) return rb.Tag as string ?? ColorOptions[0];
        return ColorOptions[0];
    }

    private void RefreshTimeDisplay()
    {
        StartHourText.Text   = _startH.ToString("D2");
        StartMinuteText.Text = _startM.ToString("D2");
        EndHourText.Text     = _endH.ToString("D2");
        EndMinuteText.Text   = _endM.ToString("D2");
    }

    private static int IndexOfReminder(int? minutes)
    {
        for (int i = 0; i < ReminderOptions.Length; i++)
            if (ReminderOptions[i].Minutes == minutes) return i;
        return 0;
    }

    private static int IndexOfRecurrence(RecurrenceType r)
    {
        for (int i = 0; i < RecurrenceOptions.Length; i++)
            if (RecurrenceOptions[i].Value == r) return i;
        return 0;
    }

    private static string LunarString(DateTime date)
    {
        try
        {
            var lunar     = new ChineseLunisolarCalendar();
            int year      = lunar.GetYear(date);
            int month     = lunar.GetMonth(date);
            int day       = lunar.GetDayOfMonth(date);
            int leapMonth = lunar.GetLeapMonth(year);
            if (leapMonth > 0 && month >= leapMonth) month--;
            return $"음력 {month}월 {day}일";
        }
        catch { return ""; }
    }

    // ── date pickers ──────────────────────────────────────────────────────

    private void StartDatePicker_Changed(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        _date = StartDatePicker.SelectedDate?.Date ?? _date;
        LunarLabel.Text = LunarString(_date);
        if (EndDatePicker == null) return;
        EndDatePicker.DisplayDateStart = _date;
        if (EndDatePicker.SelectedDate.HasValue && EndDatePicker.SelectedDate.Value.Date < _date)
            EndDatePicker.SelectedDate = _date;
    }

    private void EndDatePicker_Changed(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        var endD = EndDatePicker.SelectedDate?.Date ?? _date;
        EndLunarLabel.Text = LunarString(endD);
    }

    // ── all-day toggle ────────────────────────────────────────────────────

    private void AllDay_Changed(object sender, RoutedEventArgs e)
    {
        if (StartTimePanel == null) return;
        bool allDay = AllDayCheck.IsChecked == true;
        StartTimePanel.Visibility = allDay ? Visibility.Collapsed : Visibility.Visible;
        EndTimePanel.Visibility   = allDay ? Visibility.Collapsed : Visibility.Visible;
    }

    // ── 시작 시간 스피너 ───────────────────────────────────────────────────
    private void StartHourUp_Click(object sender, RoutedEventArgs e)
        { _startH = (_startH + 1) % 24; RefreshTimeDisplay(); }
    private void StartHourDown_Click(object sender, RoutedEventArgs e)
        { _startH = (_startH + 23) % 24; RefreshTimeDisplay(); }
    private void StartMinuteUp_Click(object sender, RoutedEventArgs e)
        { _startM = (_startM + 1) % 60; RefreshTimeDisplay(); }
    private void StartMinuteDown_Click(object sender, RoutedEventArgs e)
        { _startM = (_startM + 59) % 60; RefreshTimeDisplay(); }

    // ── 종료 시간 스피너 ───────────────────────────────────────────────────
    private void EndHourUp_Click(object sender, RoutedEventArgs e)
        { _endH = (_endH + 1) % 24; RefreshTimeDisplay(); }
    private void EndHourDown_Click(object sender, RoutedEventArgs e)
        { _endH = (_endH + 23) % 24; RefreshTimeDisplay(); }
    private void EndMinuteUp_Click(object sender, RoutedEventArgs e)
        { _endM = (_endM + 1) % 60; RefreshTimeDisplay(); }
    private void EndMinuteDown_Click(object sender, RoutedEventArgs e)
        { _endM = (_endM + 59) % 60; RefreshTimeDisplay(); }

    // ── 직접 입력 공통 핸들러 ─────────────────────────────────────────────
    private void TimeField_GotFocus(object sender, RoutedEventArgs e)
        => ((System.Windows.Controls.TextBox)sender).SelectAll();

    private void TimeField_LostFocus(object sender, RoutedEventArgs e)
    {
        var box = (System.Windows.Controls.TextBox)sender;
        if (!int.TryParse(box.Text, out int v)) { RefreshTimeDisplay(); return; }
        if      (box == StartHourText)   _startH = Math.Clamp(v, 0, 23);
        else if (box == StartMinuteText) _startM = Math.Clamp(v, 0, 59);
        else if (box == EndHourText)     _endH   = Math.Clamp(v, 0, 23);
        else if (box == EndMinuteText)   _endM   = Math.Clamp(v, 0, 59);
        RefreshTimeDisplay();
    }

    // ── save / delete / cancel ────────────────────────────────────────────

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (int.TryParse(StartHourText.Text,   out int sh)) _startH = Math.Clamp(sh, 0, 23);
        if (int.TryParse(StartMinuteText.Text, out int sm)) _startM = Math.Clamp(sm, 0, 59);
        if (int.TryParse(EndHourText.Text,     out int eh)) _endH   = Math.Clamp(eh, 0, 23);
        if (int.TryParse(EndMinuteText.Text,   out int em)) _endM   = Math.Clamp(em, 0, 59);

        if (string.IsNullOrWhiteSpace(TitleBox.Text))
        {
            MessageBox.Show("제목을 입력해 주세요.", "일정", MessageBoxButton.OK, MessageBoxImage.Warning);
            TitleBox.Focus();
            return;
        }

        bool     isAllDay  = AllDayCheck.IsChecked == true;
        TimeSpan start     = new(_startH, _startM, 0);
        TimeSpan end       = new(_endH,   _endM,   0);

        int?           reminder   = ReminderOptions[Math.Max(0, ReminderCombo.SelectedIndex)].Minutes;
        RecurrenceType recurrence = RecurrenceOptions[Math.Max(0, RecurrenceCombo.SelectedIndex)].Value;

        DateTime endDate = EndDatePicker.SelectedDate?.Date ?? _date;
        if (endDate < _date) endDate = _date;

        Result = new CalendarEvent
        {
            Id              = _existing?.Id ?? Guid.NewGuid(),
            Title           = TitleBox.Text.Trim(),
            Date            = _date,
            StartTime       = isAllDay ? TimeSpan.Zero : start,
            EndTime         = isAllDay ? TimeSpan.Zero : end,
            IsAllDay        = isAllDay,
            Description     = DescBox.Text.Trim(),
            ReminderMinutes = reminder,
            Recurrence      = recurrence,
            EndDate         = endDate,
            Color           = GetSelectedColor(),
        };

        DialogResult = true;
    }

    private void Delete_Click(object sender, RoutedEventArgs e)
    {
        var confirm = MessageBox.Show(
            $"'{_existing?.Title}' 일정을 삭제하시겠습니까?",
            "일정 삭제", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (confirm == MessageBoxResult.Yes)
        {
            Deleted      = true;
            DialogResult = true;
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
        => DialogResult = false;
}
