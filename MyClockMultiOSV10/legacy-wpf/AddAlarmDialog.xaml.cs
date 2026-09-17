using System;
using System.Windows;
using System.Windows.Input;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class AddAlarmDialog : Window
{
    public AlarmItem? Result { get; private set; }

    private AlarmItem? _editing;

    // Add mode
    public AddAlarmDialog()
    {
        InitializeComponent();
        PopulateComboBoxes();
        HourCombo.SelectedIndex   = DateTime.Now.Hour;
        MinuteCombo.SelectedIndex = 0;
        SetAllDays(true);
        LabelText.Focus();
    }

    // Edit mode
    public AddAlarmDialog(AlarmItem existing) : this()
    {
        _editing = existing;
        TitleText.Text = "알람 편집";
        OkBtn.Content  = "저장";

        HourCombo.SelectedIndex   = existing.Time.Hours;
        MinuteCombo.SelectedIndex = existing.Time.Minutes;
        LabelText.Text            = existing.Label;

        if (existing.IsRepeat)
        {
            RepeatRadio.IsChecked = true;
            DaySun.IsChecked = (existing.RepeatDays & (1 << 0)) != 0;
            DayMon.IsChecked = (existing.RepeatDays & (1 << 1)) != 0;
            DayTue.IsChecked = (existing.RepeatDays & (1 << 2)) != 0;
            DayWed.IsChecked = (existing.RepeatDays & (1 << 3)) != 0;
            DayThu.IsChecked = (existing.RepeatDays & (1 << 4)) != 0;
            DayFri.IsChecked = (existing.RepeatDays & (1 << 5)) != 0;
            DaySat.IsChecked = (existing.RepeatDays & (1 << 6)) != 0;
        }
    }

    private void PopulateComboBoxes()
    {
        for (int h = 0; h < 24; h++) HourCombo.Items.Add(h.ToString("D2"));
        for (int m = 0; m < 60; m++) MinuteCombo.Items.Add(m.ToString("D2"));
    }

    private void SetAllDays(bool value)
    {
        DaySun.IsChecked = DayMon.IsChecked = DayTue.IsChecked = DayWed.IsChecked =
        DayThu.IsChecked = DayFri.IsChecked = DaySat.IsChecked = value;
    }

    private void OnceRadio_Checked(object sender, RoutedEventArgs e)
    {
        if (RepeatDaysPanel is null) return;
        RepeatDaysPanel.Visibility = Visibility.Collapsed;
    }

    private void RepeatRadio_Checked(object sender, RoutedEventArgs e)
    {
        if (RepeatDaysPanel is null) return;
        RepeatDaysPanel.Visibility = Visibility.Visible;
    }

    private void OK_Click(object sender, RoutedEventArgs e)
    {
        if (HourCombo.SelectedIndex < 0 || MinuteCombo.SelectedIndex < 0) return;

        bool isRepeat   = RepeatRadio.IsChecked == true;
        byte repeatDays = BuildRepeatMask(isRepeat);
        var  time       = new TimeSpan(HourCombo.SelectedIndex, MinuteCombo.SelectedIndex, 0);
        var  label      = LabelText.Text.Trim();

        if (_editing != null)
        {
            _editing.Time       = time;
            _editing.Label      = label;
            _editing.IsRepeat   = isRepeat;
            _editing.RepeatDays = repeatDays;
            _editing.IsEnabled  = true;
            Result = _editing;
        }
        else
        {
            Result = new AlarmItem { Time = time, Label = label, IsRepeat = isRepeat, RepeatDays = repeatDays };
        }
        DialogResult = true;
    }

    private byte BuildRepeatMask(bool isRepeat)
    {
        if (!isRepeat) return 0b1111111;
        byte mask = 0;
        if (DaySun.IsChecked == true) mask |= 1 << 0;
        if (DayMon.IsChecked == true) mask |= 1 << 1;
        if (DayTue.IsChecked == true) mask |= 1 << 2;
        if (DayWed.IsChecked == true) mask |= 1 << 3;
        if (DayThu.IsChecked == true) mask |= 1 << 4;
        if (DayFri.IsChecked == true) mask |= 1 << 5;
        if (DaySat.IsChecked == true) mask |= 1 << 6;
        return mask == 0 ? (byte)0b1111111 : mask;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
            DragMove();
    }
}
