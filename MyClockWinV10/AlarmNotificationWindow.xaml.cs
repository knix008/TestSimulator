using System;
using System.Windows;

namespace MyClockWinV10;

public partial class AlarmNotificationWindow : Window
{
    private readonly Action? _onDismiss;
    private bool _dismissed;

    public AlarmNotificationWindow(string time, string label, string header = "알람", Action? onDismiss = null)
    {
        InitializeComponent();
        _onDismiss = onDismiss;
        AlarmHeaderText.Text = header;
        AlarmTimeText.Text   = time;
        AlarmLabelText.Text  = string.IsNullOrWhiteSpace(label) ? header : label;

        Loaded += (_, _) => PlaceBottomRight();
    }

    private void PlaceBottomRight()
    {
        var area = SystemParameters.WorkArea;
        const double margin = 16;
        Left = area.Right - ActualWidth - margin;
        Top  = area.Bottom - ActualHeight - margin;
    }

    private void Confirm_Click(object sender, RoutedEventArgs e)
        => Dismiss();

    private void Dismiss()
    {
        if (_dismissed) return;
        _dismissed = true;
        _onDismiss?.Invoke();
        Close();
    }

    protected override void OnClosed(EventArgs e)
    {
        if (!_dismissed)
            _onDismiss?.Invoke();
        base.OnClosed(e);
    }
}
