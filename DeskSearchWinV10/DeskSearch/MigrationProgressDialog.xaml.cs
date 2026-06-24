using System.Windows;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MigrationProgressDialog : Window
{
    public MigrationProgressDialog()
    {
        InitializeComponent();
        Title = LocalizationService.T("Migration_ProgressTitle");
        MessageText.Text = LocalizationService.T("Migration_ProgressMessage");
        ReportProgress(0);
    }

    public void ReportProgress(int percent)
    {
        percent = Math.Clamp(percent, 0, 100);
        ProgressBarControl.Value = percent;
        PercentText.Text = LocalizationService.F("Migration_ProgressPercent", percent);
    }
}
