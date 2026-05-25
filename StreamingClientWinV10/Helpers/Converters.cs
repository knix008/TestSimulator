using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace StreamingClientWinV10.Helpers
{
    [ValueConversion(typeof(bool), typeof(Visibility))]
    public class InverseBoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value is true ? Visibility.Collapsed : Visibility.Visible;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => value is Visibility.Collapsed;
    }

    // Shows placeholder brush when BitmapImage is null
    [ValueConversion(typeof(BitmapImage), typeof(Brush))]
    public class NullImageBrushConverter : IValueConverter
    {
        private static readonly Brush Placeholder = new SolidColorBrush(Color.FromRgb(0x1E, 0x40, 0x7C));

        public object? Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value as BitmapImage != null ? null : Placeholder;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotSupportedException();
    }

    // Converts double seconds to TimeSpan
    [ValueConversion(typeof(double), typeof(TimeSpan))]
    public class DoubleToTimeSpanConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
            => value is double d ? TimeSpan.FromSeconds(d) : TimeSpan.Zero;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => value is TimeSpan ts ? ts.TotalSeconds : 0.0;
    }

    // Formats seconds into "m:ss" or "h:mm:ss"
    [ValueConversion(typeof(double), typeof(string))]
    public class SecondsToTimeStringConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            double seconds = value is double d ? d : 0;
            var ts = TimeSpan.FromSeconds(seconds);
            return ts.TotalHours >= 1
                ? $"{(int)ts.TotalHours}:{ts.Minutes:D2}:{ts.Seconds:D2}"
                : $"{ts.Minutes}:{ts.Seconds:D2}";
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotSupportedException();
    }
}
