using System.Windows;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class ResetChoiceDialog : Window
{
    public ResetScope Scope { get; private set; } = ResetScope.IndexDatabaseOnly;

    public ResetChoiceDialog()
    {
        InitializeComponent();
        Title = LocalizationService.T("Settings_ResetChoice_Title");
        MessageText.Text = LocalizationService.T("Settings_ResetChoice_Message");
        IndexOnlyRadio.Content = LocalizationService.T("Settings_ResetChoice_IndexOnly");
        IndexAndSettingsRadio.Content = LocalizationService.T("Settings_ResetChoice_IndexAndSettings");
        ConfirmButton.Content = LocalizationService.T("Settings_ResetChoice_Confirm");
        CancelButton.Content = LocalizationService.T("Settings_ResetChoice_Cancel");
    }

    private void ConfirmButton_Click(object sender, RoutedEventArgs e)
    {
        Scope = IndexAndSettingsRadio.IsChecked == true
            ? ResetScope.IndexDatabaseAndSettings
            : ResetScope.IndexDatabaseOnly;
        DialogResult = true;
        Close();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
