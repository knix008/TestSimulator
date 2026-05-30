using System;
using System.Windows;
using MyClockWinV10.Models;

namespace MyClockWinV10;

public partial class AddAlarmDialog : Window
{
    public AlarmItem? Result { get; private set; }

    public AddAlarmDialog()
    {
        InitializeComponent();
        for (int h = 0; h < 24; h++) HourCombo.Items.Add(h.ToString("D2"));
        for (int m = 0; m < 60; m++) MinuteCombo.Items.Add(m.ToString("D2"));
        HourCombo.SelectedIndex   = DateTime.Now.Hour;
        MinuteCombo.SelectedIndex = 0;
        LabelText.Focus();
    }

    private void OK_Click(object sender, RoutedEventArgs e)
    {
        if (HourCombo.SelectedIndex < 0 || MinuteCombo.SelectedIndex < 0) return;
        Result = new AlarmItem
        {
            Time  = new TimeSpan(HourCombo.SelectedIndex, MinuteCombo.SelectedIndex, 0),
            Label = LabelText.Text.Trim()
        };
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
