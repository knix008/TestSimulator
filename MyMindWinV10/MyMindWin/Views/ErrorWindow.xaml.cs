using System.Windows;

namespace MyMindWin.Views;

public partial class ErrorWindow : Window
{
    public ErrorWindow(string errorMessage, string? title = null)
    {
        InitializeComponent();
        if (!string.IsNullOrWhiteSpace(title))
            Title = title;
        ErrorTextBox.Text = errorMessage;
        ErrorTextBox.CaretIndex = 0;
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(ErrorTextBox.Text);
        CopyButton.Content = "복사됨 ✓";
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();
}
