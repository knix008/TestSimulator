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
            shape is NodeShapeKind.Ellipse
                or NodeShapeKind.Diamond
                or NodeShapeKind.Cloud
                or NodeShapeKind.Hexagon
                or NodeShapeKind.SpeechBubble
                or NodeShapeKind.Star
                or NodeShapeKind.Parallelogram;

        public static FrameworkElement? GetNodeVisualRoot(FrameworkElement? root)
        {
            if (root is Grid { Children.Count: > 0 } wrapper &&
                wrapper.Children[0] is FrameworkElement first &&
                first != wrapper)
                return first;
            return root;
        }

        public static UIElement? GetShapeElement(FrameworkElement? root)
        {
            root = GetNodeVisualRoot(root);
            return root is Grid { Children.Count: > 0 } g ? g.Children[0] : null;
        }

        private static UIElement? CreateShapeElement(
            NodeShapeKind shape, Brush fill, Brush stroke, double strokeThickness, double width, double height)
        {
            if (NodeShapeGeometries.IsCustomPathShape(shape))
            {
                return new Path
                {
                    Width = width,
                    Height = height,
                    Data = NodeShapeGeometries.GetGeometry(shape),
                    Fill = fill,
                    Stroke = stroke,
                    StrokeThickness = strokeThickness,
                    StrokeLineJoin = PenLineJoin.Round,
                    Stretch = Stretch.Fill
                };
            }

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
            NodeShapeKind.Cloud => new CornerRadius(height / 3),
            NodeShapeKind.Hexagon => new CornerRadius(4),
            NodeShapeKind.SpeechBubble => new CornerRadius(10),
            NodeShapeKind.Star => new CornerRadius(0),
            NodeShapeKind.Parallelogram => new CornerRadius(0),
            _ => new CornerRadius(Math.Min(height / 2, 18))
        };

        /// <summary>연결선용 앵커 — 대상 방향에 따라 노드의 좌/우/상/하 중앙 모서리.</summary>
        public static Point GetEdgePoint(NodeViewModel node, double targetX, double targetY, double nodeHeight)
        {
            double cx = node.X + node.Width / 2;
            double cy = node.Y + nodeHeight / 2;
            double dx = targetX - cx;
            double dy = targetY - cy;

            double normDx = node.Width > 0 ? Math.Abs(dx) / node.Width : 0;
            double normDy = nodeHeight > 0 ? Math.Abs(dy) / nodeHeight : 0;

            if (normDx >= normDy)
                return dx >= 0
                    ? new Point(node.X + node.Width, cy)
                    : new Point(node.X, cy);
            else
                return dy >= 0
                    ? new Point(cx, node.Y + nodeHeight)
                    : new Point(cx, node.Y);
        }

        /// <summary>연결선용 앵커 — 수평 방향(좌/우)만 허용. 피시본·트리 레이아웃용.</summary>
        public static Point GetEdgePointHorizontal(NodeViewModel node, double targetX, double nodeHeight)
        {
            double cy = node.Y + nodeHeight / 2;
            double cx = node.X + node.Width / 2;
            return targetX >= cx
                ? new Point(node.X + node.Width, cy)
                : new Point(node.X, cy);
        }
    }
}
