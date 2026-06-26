using System.Windows;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MigrationConfirmDialog : Window
{
    public MigrationConfirmDialog()
    {
        InitializeComponent();
        Title = LocalizationService.T("Migration_ConfirmTitle");
        MessageText.Text = LocalizationService.T("Migration_ConfirmMessage");
        YesButton.Content = LocalizationService.T("Migration_ConfirmYes");
        NoButton.Content = LocalizationService.T("Migration_ConfirmNo");
    }

    private void YesButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void NoButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
