using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using Palisades.Models;
using Palisades.Services;

namespace Palisades;

/// <summary>
/// Names the choices in the settings drop-downs. Bound straight to an enum, WPF would call
/// ToString() and put the member name on screen, which leaves "Kind" and "Modified" in English
/// however the language is set.
/// </summary>
public sealed class EnumLabelConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => Strings.T(value switch
        {
            FenceSort.Manual => "Manual order",
            FenceSort.Name => "Name",
            FenceSort.Kind => "Type",
            FenceSort.Modified => "Date modified",
            UiLanguage.System => "Follow Windows",
            UiLanguage.English => "English",
            UiLanguage.Korean => "Korean",
            _ => value?.ToString() ?? ""
        });

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>Turns the stored "#AARRGGBB" strings into brushes.</summary>
public sealed class HexToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var brush = Brushes.Transparent;
        if (value is string text && text.Length > 0)
        {
            try
            {
                if (ColorConverter.ConvertFromString(text) is Color color)
                {
                    if (parameter is string alphaText && double.TryParse(alphaText, NumberStyles.Float, CultureInfo.InvariantCulture, out var alpha))
                    {
                        color.A = (byte)Math.Clamp(color.A * alpha, 0, 255);
                    }

                    brush = new SolidColorBrush(color);
                    brush.Freeze();
                }
            }
            catch (FormatException)
            {
            }
        }

        return brush;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => value is SolidColorBrush brush ? brush.Color.ToString(CultureInfo.InvariantCulture) : "";
}

/// <summary>Collapses an element when a collection is empty, for the "drop things here" hint.</summary>
public sealed class EmptyToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var count = value switch
        {
            int number => number,
            System.Collections.ICollection collection => collection.Count,
            _ => 0
        };

        var invert = parameter as string == "invert";
        var empty = count == 0;
        return (invert ? !empty : empty) ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public sealed class BooleanToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var flag = value is true;
        if (parameter as string == "invert")
        {
            flag = !flag;
        }

        return flag ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => value is Visibility.Visible;
}
