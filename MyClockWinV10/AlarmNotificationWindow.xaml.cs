using System.Windows;

namespace MyClockWinV10;

public partial class AlarmNotificationWindow : Window
{
    public AlarmNotificationWindow(string time, string label)
    {
        InitializeComponent();
        AlarmTimeText.Text  = time;
        AlarmLabelText.Text = string.IsNullOrWhiteSpace(label) ? "알람" : label;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();
}
