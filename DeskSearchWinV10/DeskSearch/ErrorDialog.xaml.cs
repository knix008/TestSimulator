using System.Windows;

namespace DeskSearch;

public partial class ErrorDialog : Window
{
    private readonly string _details;

    public ErrorDialog(string summary, string details)
    {
        _details = details;
        InitializeComponent();
        ApplyLocalization();
        SummaryText.Text = summary;
        DetailsTextBox.Text = details;
        DetailsTextBox.CaretIndex = 0;
    }

    private void ApplyLocalization()
    {
        Title = Services.LocalizationService.T("ErrorDialog_Title");
        TitleText.Text = Services.LocalizationService.T("ErrorDialog_Title");
        DetailsLabel.Text = Services.LocalizationService.T("ErrorDialog_Details");
        CopyButton.Content = Services.LocalizationService.T("ErrorDialog_Copy");
        CloseButton.Content = Services.LocalizationService.T("ErrorDialog_Close");
        CopyStatusText.Text = Services.LocalizationService.T("ErrorDialog_Copied");
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        System.Windows.Clipboard.SetText(_details);
        CopyStatusText.Visibility = Visibility.Visible;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }
}
