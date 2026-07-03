using System.Windows;

namespace PDFEditor.App.Dialogs;

public partial class ErrorDialogWindow : Window
{
    public ErrorDialogWindow(string title, string details)
    {
        InitializeComponent();
        Title = title;
        TitleTextBlock.Text = title;
        DetailsTextBox.Text = details;
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrEmpty(DetailsTextBox.Text))
        {
            Clipboard.SetText(DetailsTextBox.Text);
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
