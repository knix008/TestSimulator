using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace MyMindWin.Controls
{
    internal static class AttachmentBadgeHelper
    {
        private static readonly Brush IconBrush;

        static AttachmentBadgeHelper()
        {
            IconBrush = new SolidColorBrush(Colors.White);
            IconBrush.Freeze();
        }

        public static UIElement CreateNoteIcon() =>
            LineIcon("M 4,3 L 12,3 L 12,12 L 4,12 Z M 6,6 L 10,6 M 6,9 L 10,9", 1.15);

        public static UIElement CreateImageIcon() =>
            LineIcon("M 3,10 L 6,7 L 8,9 L 11,5 L 13,7 L 13,12 L 3,12 Z M 5,5 A 1,1 0 1 0 5,7 A 1,1 0 1 0 5,5", 1.1);

        public static void ApplyExpandedState(Border badge, bool expanded)
        {
            badge.Opacity = expanded ? 1.0 : 0.92;
            badge.BorderThickness = new Thickness(expanded ? 2 : 1);
        }

        private static UIElement LineIcon(string geometry, double thickness) => new Path
        {
            Data = Geometry.Parse(geometry),
            Stroke = IconBrush,
            StrokeThickness = thickness,
            StrokeLineJoin = PenLineJoin.Round,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round,
            Fill = Brushes.Transparent,
            Width = 11,
            Height = 11,
            Stretch = Stretch.Uniform,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
    }
}
