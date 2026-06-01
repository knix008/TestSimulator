using System;
using System.Globalization;
using System.Windows.Data;
using MyMindWin.Controls;
using MyMindWin.Models;

namespace MyMindWin.Converters
{
    public sealed class ConnectionLineIconConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is ConnectionLineType type)
                return ConnectionLineIconHelper.CreateIcon(type);
            return ConnectionLineIconHelper.CreateIcon(ConnectionLineType.Bezier);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
            => throw new NotSupportedException();
    }
}
