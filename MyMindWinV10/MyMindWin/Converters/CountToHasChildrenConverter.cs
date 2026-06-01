using System.Globalization;
using System.Windows.Data;

namespace MyMindWin.Converters;

/// <summary>Children.Count &gt; 0 이면 true (폴더 아이콘용).</summary>
public sealed class CountToHasChildrenConverter : IValueConverter
{
    public static readonly CountToHasChildrenConverter Instance = new();

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is int count && count > 0;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
