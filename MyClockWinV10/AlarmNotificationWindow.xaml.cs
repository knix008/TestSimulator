using System;
using System.Windows;

namespace MyClockWinV10;

public partial class AlarmNotificationWindow : Window
{
    private readonly Action? _onDismiss;

    public AlarmNotificationWindow(string time, string label, string header = "알람", Action? onDismiss = null)
    {
        InitializeComponent();
        _onDismiss = onDismiss;
        AlarmHeaderText.Text = header;
        AlarmTimeText.Text   = time;
        AlarmLabelText.Text  = string.IsNullOrWhiteSpace(label) ? header : label;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    protected override void OnClosed(EventArgs e)
    {
        _onDismiss?.Invoke();
        base.OnClosed(e);
    }
}
