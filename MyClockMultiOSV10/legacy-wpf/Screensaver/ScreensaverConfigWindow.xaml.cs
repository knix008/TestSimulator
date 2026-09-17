using System.Windows;
using MyClockWinV10.Models;

namespace MyClockWinV10.Screensaver;

public partial class ScreensaverConfigWindow : Window
{
    private readonly ScreensaverSettings _settings;

    public ScreensaverConfigWindow()
    {
        InitializeComponent();
        _settings = ScreensaverSettingsManager.Load();
        DigitalRadio.IsChecked = _settings.IsDigital;
        AnalogRadio.IsChecked  = !_settings.IsDigital;
        SizeSlider.Value       = _settings.ClockSizePercent;
        UseAppSettingsCheck.IsChecked = _settings.UseAppSettings;
        UpdateSizeLabel();
    }

    private void SizeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        => UpdateSizeLabel();

    private void UpdateSizeLabel()
        => SizeLabel.Text = $"{(int)SizeSlider.Value} %";

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        _settings.IsDigital        = DigitalRadio.IsChecked == true;
        _settings.ClockSizePercent = (int)SizeSlider.Value;
        _settings.UseAppSettings   = UseAppSettingsCheck.IsChecked == true;
        ScreensaverSettingsManager.Save(_settings);
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => Close();
}
