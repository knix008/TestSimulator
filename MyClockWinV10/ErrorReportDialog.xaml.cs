using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;

namespace MyClockWinV10;

public partial class ErrorReportDialog : Window
{
    private readonly DispatcherTimer _copyStatusTimer = new() { Interval = TimeSpan.FromSeconds(2) };

    public ErrorReportDialog(string summary, string details, Window? owner = null)
    {
        Owner = owner;
        InitializeComponent();

        SummaryText.Text = summary;
        DetailsText.Text = details;
        DetailsText.CaretIndex = 0;
        DetailsText.ScrollToHome();

        _copyStatusTimer.Tick += (_, _) =>
        {
            _copyStatusTimer.Stop();
            CopyStatusText.Visibility = Visibility.Collapsed;
        };
    }

    private void Copy_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(DetailsText.Text);
            CopyStatusText.Text = "클립보드에 복사했습니다.";
            CopyStatusText.Visibility = Visibility.Visible;
            _copyStatusTimer.Stop();
            _copyStatusTimer.Start();
        }
        catch (Exception ex)
        {
            CopyStatusText.Text = $"복사 실패: {ex.Message}";
            CopyStatusText.Visibility = Visibility.Visible;
        }
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
            DragMove();
    }
}
