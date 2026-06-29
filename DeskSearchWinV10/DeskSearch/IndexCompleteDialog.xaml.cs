using System.Windows;
using DeskSearch.Services;

namespace DeskSearch;

public partial class IndexCompleteDialog : Window
{
    public IndexCompleteDialog(string message)
    {
        InitializeComponent();
        Title = LocalizationService.T("IndexComplete_Title");
        MessageText.Text = message;
        OkButton.Content = LocalizationService.T("IndexComplete_Ok");
    }

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }
}
