using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MyMindWin.Models;

namespace MyMindWin.Controls
{
    public static class ConnectionLineIconHelper
    {
        private static readonly Brush IconStroke = new SolidColorBrush(Color.FromRgb(0x74, 0xB9, 0xFF));

        public static Geometry LinearGeometry { get; } =
            Geometry.Parse("M 1,13 L 15,3");

        public static Geometry BezierGeometry { get; } =
            Geometry.Parse("M 1,13 C 5,13 11,3 15,3");

        public static Geometry SharpLinearGeometry { get; } =
            Geometry.Parse("M 1,13 L 1,7 L 15,7 L 15,3");

        public static Geometry SharpBezierGeometry { get; } =
            Geometry.Parse("M 1,13 C 6,13 6,7 8,7 C 10,7 10,3 15,3");

        public static Geometry GetGeometry(ConnectionLineType type) => type switch
        {
            ConnectionLineType.Linear => LinearGeometry,
            ConnectionLineType.SharpLinear => SharpLinearGeometry,
            ConnectionLineType.SharpBezier => SharpBezierGeometry,
            _ => BezierGeometry
        };

        public static UIElement CreateIcon(ConnectionLineType type, double size = 24)
        {
            var path = new Path
            {
                Data = GetGeometry(type),
                Stroke = IconStroke,
                StrokeThickness = 1.6,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Fill = Brushes.Transparent,
                Stretch = Stretch.Uniform
            };

            return new Viewbox
            {
                Width = size,
                Height = size,
                Child = path,
                Margin = new Thickness(0, 1, 0, 0)
            };
        }
    }
}
