using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    internal static class NodeShapeHelper
    {
        public static FrameworkElement CreateNodeVisual(
            NodeViewModel node,
            Brush fill,
            Brush borderBrush,
            double borderThickness,
            UIElement textContent,
            double width,
            double height)
        {
            var root = new Grid
            {
                Width = width,
                Height = height,
                Tag = node,
                Cursor = System.Windows.Input.Cursors.SizeAll
            };

            var shape = CreateShapeElement(node.Shape, fill, borderBrush, borderThickness, width, height);
            if (shape != null)
                root.Children.Add(shape);

            if (textContent is FrameworkElement fe)
            {
                fe.IsHitTestVisible = false;
                root.Children.Add(fe);
            }

            var outline = new Border
            {
                Width = width,
                Height = height,
                Background = Brushes.Transparent,
                BorderBrush = borderBrush,
                BorderThickness = new Thickness(borderThickness),
                CornerRadius = GetOutlineCornerRadius(node.Shape, height),
                IsHitTestVisible = false
            };
            if (UsesShapeStroke(node.Shape))
                outline.Visibility = Visibility.Collapsed;
            root.Children.Add(outline);

            return root;
        }

        public static bool UsesShapeStroke(NodeShapeKind shape) =>
            shape is NodeShapeKind.Ellipse or NodeShapeKind.Diamond;

        public static UIElement? GetShapeElement(FrameworkElement? root) =>
            root is Grid { Children.Count: > 0 } g ? g.Children[0] : null;

        private static UIElement? CreateShapeElement(
            NodeShapeKind shape, Brush fill, Brush stroke, double strokeThickness, double width, double height)
        {
            return shape switch
            {
                NodeShapeKind.Rectangle => new Rectangle
                {
                    Width = width, Height = height, Fill = fill, RadiusX = 0, RadiusY = 0
                },
                NodeShapeKind.Pill => new Border
                {
                    Width = width, Height = height, Background = fill,
                    CornerRadius = new CornerRadius(height / 2)
                },
                NodeShapeKind.Ellipse => new Ellipse
                {
                    Width = width, Height = height, Fill = fill,
                    Stroke = stroke, StrokeThickness = strokeThickness
                },
                NodeShapeKind.Diamond => new Polygon
                {
                    Fill = fill,
                    Stroke = stroke, StrokeThickness = strokeThickness,
                    Points = new PointCollection
                    {
                        new(width / 2, 0),
                        new(width, height / 2),
                        new(width / 2, height),
                        new(0, height / 2)
                    }
                },
                _ => new Border
                {
                    Width = width, Height = height, Background = fill,
                    CornerRadius = new CornerRadius(Math.Min(height / 2, 18))
                }
            };
        }

        private static CornerRadius GetOutlineCornerRadius(NodeShapeKind shape, double height) => shape switch
        {
            NodeShapeKind.Rectangle => new CornerRadius(0),
            NodeShapeKind.Pill => new CornerRadius(height / 2),
            NodeShapeKind.Ellipse => new CornerRadius(height / 2),
            NodeShapeKind.Diamond => new CornerRadius(0),
            _ => new CornerRadius(Math.Min(height / 2, 18))
        };

        public static Point GetEdgePoint(NodeViewModel node, double targetX, double targetY, double nodeHeight)
        {
            double cx = node.X + node.Width / 2;
            double cy = node.Y + nodeHeight / 2;
            double dx = targetX - cx;
            double dy = targetY - cy;

            if (Math.Abs(dx) < 1e-6 && Math.Abs(dy) < 1e-6)
                return new Point(cx, cy);

            return node.Shape switch
            {
                NodeShapeKind.Ellipse => EllipseEdge(cx, cy, node.Width / 2, nodeHeight / 2, dx, dy),
                NodeShapeKind.Diamond => DiamondEdge(cx, cy, node.Width / 2, nodeHeight / 2, dx, dy),
                _ => RectEdge(cx, cy, node.Width / 2, nodeHeight / 2, dx, dy)
            };
        }

        private static Point RectEdge(double cx, double cy, double halfW, double halfH, double dx, double dy)
        {
            halfW = Math.Max(halfW, 1);
            halfH = Math.Max(halfH, 1);
            double scale = 1.0 / Math.Max(Math.Abs(dx) / halfW, Math.Abs(dy) / halfH);
            return new Point(cx + dx * scale, cy + dy * scale);
        }

        private static Point EllipseEdge(double cx, double cy, double rx, double ry, double dx, double dy)
        {
            rx = Math.Max(rx, 1);
            ry = Math.Max(ry, 1);
            double t = Math.Sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
            if (t < 1e-9) return new Point(cx, cy);
            return new Point(cx + dx / t, cy + dy / t);
        }

        private static Point DiamondEdge(double cx, double cy, double halfW, double halfH, double dx, double dy)
        {
            halfW = Math.Max(halfW, 1);
            halfH = Math.Max(halfH, 1);
            double t = Math.Abs(dx) / halfW + Math.Abs(dy) / halfH;
            if (t < 1e-9) return new Point(cx, cy);
            return new Point(cx + dx / t, cy + dy / t);
        }
    }
}
