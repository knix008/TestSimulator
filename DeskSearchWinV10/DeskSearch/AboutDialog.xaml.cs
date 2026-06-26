using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Media.Imaging;
using DeskSearch.Helpers;
using DeskSearch.Services;

namespace DeskSearch;

public partial class AboutDialog : Window
{
    public AboutDialog()
    {
        InitializeComponent();
        Title = LocalizationService.T("About_Title");
        ProductNameText.Text = LocalizationService.T("About_ProductName");
        VersionText.Text = LocalizationService.F("About_Version", GetProductVersion());
        DescriptionText.Text = LocalizationService.T("About_Description");
        AuthorText.Text = LocalizationService.T("About_Author");
        OkButton.Content = LocalizationService.T("About_Ok");

        TrySetWindowIcon();
        TryLoadAppImage();
        WindowTaskbarHelper.ExcludeFromTaskbar(this);
    }

    private void TrySetWindowIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (!File.Exists(iconPath))
            return;

        Icon = BitmapFrame.Create(new Uri(iconPath, UriKind.Absolute));
    }

    private void TryLoadAppImage()
    {
        var pngPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.png");
        if (!File.Exists(pngPath))
        {
            AppIconImage.Visibility = Visibility.Collapsed;
            return;
        }

        var image = new BitmapImage();
        image.BeginInit();
        image.UriSource = new Uri(pngPath, UriKind.Absolute);
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.EndInit();
        image.Freeze();
        AppIconImage.Source = image;
    }

    private static string GetProductVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        return version is null ? "1.0.0" : $"{version.Major}.{version.Minor}.{version.Build}";
    }

    private void OkButton_Click(object sender, RoutedEventArgs e) => Close();
}
