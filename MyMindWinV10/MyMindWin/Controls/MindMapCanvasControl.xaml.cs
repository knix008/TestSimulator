using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    public partial class MindMapCanvasControl : UserControl
    {
        private static readonly (Color light, Color dark)[] BranchColors =
        [
            (Color.FromRgb(0x74, 0xB9, 0xFF), Color.FromRgb(0x00, 0x84, 0xD6)),
            (Color.FromRgb(0x55, 0xEF, 0xCB), Color.FromRgb(0x00, 0xB8, 0x94)),
            (Color.FromRgb(0xFF, 0x7F, 0xB5), Color.FromRgb(0xE8, 0x40, 0x83)),
            (Color.FromRgb(0xFF, 0xD3, 0x6E), Color.FromRgb(0xE6, 0x9B, 0x00)),
            (Color.FromRgb(0xA2, 0x9B, 0xFE), Color.FromRgb(0x68, 0x5A, 0xE6)),
            (Color.FromRgb(0x81, 0xEC, 0xEC), Color.FromRgb(0x00, 0xCE, 0xCE)),
            (Color.FromRgb(0xFD, 0xA7, 0xDF), Color.FromRgb(0xE8, 0x4E, 0xCF)),
            (Color.FromRgb(0xFE, 0xB0, 0x8F), Color.FromRgb(0xE8, 0x74, 0x43)),
        ];

        private static readonly Color RootLight = Color.FromRgb(0xB2, 0xBE, 0xFF);
        private static readonly Color RootDark  = Color.FromRgb(0x66, 0x7E, 0xEA);

        private readonly Dictionary<Guid, FrameworkElement> _nodeElements = [];
        private readonly Dictionary<Guid, Path>   _connectionPaths = [];
        private MainViewModel? _vm;

        private bool _isPanning;
        private Point _panStart;
        private double _panStartScrollX, _panStartScrollY;
        private bool _suppressZoomSync;
        private bool _userPositioned;
        private bool _pendingFitAfterLoad;
        private LayoutType _lastLayoutType;

        private NodeViewModel? _editingNode;
        private FrameworkElement? _editingNodeVisual;
        private NodeViewModel? _dragNode;
        private Point _dragLastWorldPos;
        private bool _isDraggingNode;
        private const double DragThreshold = 4;

        private double _contentOriginX;
        private double _contentOriginY;
        private double _contentWidth = 800;
        private double _contentHeight = 600;

        private const double NodeMinWidth   = 90;
        private const double NodeHeight     = 36;
        private const double HNodeSpacingX  = 72;   // 부모-자식 가로 간격 (연결선 길이)
        private const double HNodeSpacingY  = 38;   // 형제 노드 세로 간격
        private const double RadialRadius0  = 72;   // 루트→1단계 자식 거리 (중심 간)
        private const double RadialRadiusDelta = 48;
        private const double RadialNodeGap  = 16;   // 같은 링에서 노드 사이 최소 간격
        private const double ConnectionArmMin = 20; // 베지어 제어 arm 최소
        private const double ConnectionArmMax = 56; // 베지어 제어 arm 최대
        private const double ContentPadding = 80;

        public MindMapCanvasControl()
        {
            InitializeComponent();
            if (IsInDesignMode())
                return;

            SizeChanged += (_, _) => SyncContentExtent();
            Loaded += (_, _) => SyncContentExtent();
        }

        private void SyncContentExtent()
        {
            if (_vm?.RootNode == null) return;

            double oldOriginX = _contentOriginX;
            double oldOriginY = _contentOriginY;
            UpdateContentExtent();
            if (Math.Abs(oldOriginX - _contentOriginX) > 0.01 ||
                Math.Abs(oldOriginY - _contentOriginY) > 0.01)
            {
                RefreshAllVisuals();
            }
        }

        private bool IsInDesignMode() =>
            DesignerProperties.GetIsInDesignMode(this);

        public void SetViewModel(MainViewModel vm)
        {
            if (_vm != null)
            {
                _vm.RequestLayout -= OnRequestLayout;
                _vm.RequestAutoLayout -= OnRequestAutoLayout;
                _vm.RequestFitView -= OnRequestFitView;
                _vm.RequestNodeShapeRefresh -= OnRequestNodeShapeRefresh;
                _vm.RequestConnectionRefresh -= OnRequestConnectionRefresh;
                _vm.PropertyChanged -= Vm_PropertyChanged;
            }
            _vm = vm;
            _lastLayoutType = vm.LayoutType;
            _pendingFitAfterLoad = vm.GetAllNodes().Any(n => n.HasManualPosition);
            _vm.RequestLayout     += OnRequestLayout;
            _vm.RequestAutoLayout += OnRequestAutoLayout;
            _vm.RequestFitView    += OnRequestFitView;
            _vm.RequestNodeShapeRefresh += OnRequestNodeShapeRefresh;
            _vm.RequestConnectionRefresh += OnRequestConnectionRefresh;
            _vm.PropertyChanged += Vm_PropertyChanged;

            RebuildCanvas();
        }

        private void Vm_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(MainViewModel.ZoomLevel))
            {
                if (_suppressZoomSync) return;
                ApplyZoomAtViewportCenter(_vm!.ZoomLevel);
            }
            else if (e.PropertyName == nameof(MainViewModel.SelectedNode))
            {
                RefreshSelectionVisuals();
            }
        }

        private void OnRequestLayout(object? sender, EventArgs e) => RebuildCanvas();

        private void OnRequestNodeShapeRefresh(object? sender, NodeViewModel node) => ReplaceNodeVisual(node);

        private void OnRequestConnectionRefresh(object? sender, EventArgs e)
        {
            if (_vm?.RootNode == null) return;
            RebuildAllConnections();
        }

        private void OnRequestAutoLayout(object? sender, EventArgs e)
        {
            _userPositioned = false;
            ClearManualPositionsOnAllNodes();
            _lastLayoutType = _vm!.LayoutType;
            RebuildCanvas();
            FitToView();
        }

        private void OnRequestFitView(object? sender, EventArgs e) => FitToView();

        private void RebuildCanvas()
        {
            if (_vm?.RootNode == null) return;

            if (_vm.LayoutType != _lastLayoutType)
            {
                _userPositioned = false;
                ClearManualPositionsOnAllNodes();
                _lastLayoutType = _vm.LayoutType;
            }

            foreach (var node in _vm.GetAllNodes())
                node.Width = MeasureTextWidth(node.Text, node.Level == 0 ? 16 : 13) + 28;

            _userPositioned = _vm.GetAllNodes().Any(n => n.HasManualPosition);

            if (!_userPositioned)
            {
                if (_vm.LayoutType == LayoutType.HorizontalTree)
                    LayoutHorizontal(_vm.RootNode, ContentPadding, ContentPadding, out _);
                else
                {
                    LayoutRadial(_vm.RootNode);
                    AlignRadialRootToTreeCenter(_vm.RootNode);
                }

                foreach (var node in _vm.GetAllNodes())
                    node.SyncToModel();
            }
            else
            {
                foreach (var node in _vm.GetAllNodes())
                {
                    if (node.Parent != null && !node.HasManualPosition)
                        PlaceNewNodeNearParent(node);
                    else
                        node.SyncToModel();
                }
            }

            NodeCanvas.Children.Clear();
            ConnectionCanvas.Children.Clear();
            _nodeElements.Clear();
            _connectionPaths.Clear();

            UpdateContentExtent();

            DrawConnections(_vm.RootNode);
            DrawNodes(_vm.RootNode);

            if (ActualWidth > 0 && ActualHeight > 0 && !_isPanning)
            {
                if (_pendingFitAfterLoad)
                {
                    FitToView();
                    _pendingFitAfterLoad = false;
                }
                else if (!_userPositioned)
                    CenterView();
            }
        }

        private void ClearManualPositionsOnAllNodes()
        {
            if (_vm == null) return;
            foreach (var node in _vm.GetAllNodes())
            {
                node.HasManualPosition = false;
                node.Model.X = null;
                node.Model.Y = null;
            }
        }

        private static void PlaceNewNodeNearParent(NodeViewModel node)
        {
            var parent = node.Parent!;
            int index = parent.Children.IndexOf(node);
            node.X = parent.X + parent.Width + HNodeSpacingX;
            node.Y = parent.Y + index * (NodeHeight + HNodeSpacingY * 0.5);
            node.HasManualPosition = true;
            node.SyncToModel();
        }

        private double LayoutHorizontal(NodeViewModel node, double x, double yStart, out double subtreeHeight)
        {
            if (!node.IsExpanded || node.Children.Count == 0)
            {
                node.X = x;
                node.Y = yStart;
                subtreeHeight = NodeHeight + HNodeSpacingY;
                return subtreeHeight;
            }

            double totalH = 0;
            double childX = x + node.Width + HNodeSpacingX;
            foreach (var child in node.Children)
                totalH += LayoutHorizontal(child, childX, yStart + totalH, out _);

            double firstChildCY = node.Children[0].Y + NodeHeight / 2;
            double lastChildCY  = node.Children[^1].Y + NodeHeight / 2;
            node.X = x;
            node.Y = (firstChildCY + lastChildCY) / 2 - NodeHeight / 2;
            subtreeHeight = totalH;
            return totalH;
        }

        private void LayoutRadial(NodeViewModel root)
        {
            double cx = ContentPadding + 80;
            double cy = ContentPadding + 80;
            LayoutRadialNode(root, cx, cy, 0, Math.PI * 2, RadialRadius0);
        }

        /// <summary>방사형 트리에서 루트 노드가 전체 노드 영역의 중심에 오도록 이동합니다.</summary>
        private void AlignRadialRootToTreeCenter(NodeViewModel root)
        {
            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double targetCx = (minX + maxX) / 2;
            double targetCy = (minY + maxY) / 2;
            double rootCx = root.X + root.Width / 2;
            double rootCy = root.Y + NodeHeight / 2;
            ShiftSubtree(root, targetCx - rootCx, targetCy - rootCy);
        }

        private static void ShiftSubtree(NodeViewModel node, double dx, double dy)
        {
            node.X += dx;
            node.Y += dy;
            node.SyncToModel();
            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
                ShiftSubtree(child, dx, dy);
        }

        private void LayoutRadialNode(NodeViewModel node, double cx, double cy,
                                      double startAngle, double endAngle, double radius)
        {
            node.X = cx - node.Width / 2;
            node.Y = cy - NodeHeight / 2;

            if (!node.IsExpanded || node.Children.Count == 0) return;

            double totalAngle = endAngle - startAngle;
            int leafCount = CountLeaves(node);
            double angleStep = totalAngle / Math.Max(leafCount, 1);
            double childRadius = ExpandRadiusForChildren(node.Children, radius, totalAngle, angleStep);

            var spans = new List<double>(node.Children.Count);
            foreach (var child in node.Children)
            {
                int childLeaves = CountLeaves(child);
                double proportional = angleStep * childLeaves;
                double minimum = MinAngleForNode(child, childRadius);
                spans.Add(Math.Max(proportional, minimum));
            }

            double usedAngle = spans.Sum();
            double currentAngle = usedAngle < totalAngle
                ? startAngle + (totalAngle - usedAngle) / 2
                : startAngle;

            for (int i = 0; i < node.Children.Count; i++)
            {
                var child = node.Children[i];
                double childAngleSpan = spans[i];
                double childMidAngle = currentAngle + childAngleSpan / 2;

                double childCX = cx + Math.Cos(childMidAngle) * childRadius;
                double childCY = cy + Math.Sin(childMidAngle) * childRadius;

                LayoutRadialNode(child, childCX, childCY,
                    childMidAngle - childAngleSpan / 2,
                    childMidAngle + childAngleSpan / 2,
                    childRadius);

                currentAngle += childAngleSpan;
            }
        }

        /// <summary>노드 너비에 맞는 최소 호(arc) 각도. 반경이 클수록 같은 각도로 더 넓은 간격.</summary>
        private static double MinAngleForNode(NodeViewModel node, double radius)
            => (node.Width + RadialNodeGap) / Math.Max(radius, 1);

        /// <summary>자식 노드가 겹치지 않도록 반경을 키웁니다.</summary>
        private static double ExpandRadiusForChildren(
            IList<NodeViewModel> children, double radius, double totalAngle, double angleStep)
        {
            double childRadius = radius + RadialRadiusDelta;
            for (int iter = 0; iter < 24; iter++)
            {
                double required = 0;
                foreach (var child in children)
                {
                    int childLeaves = CountLeaves(child);
                    required += Math.Max(angleStep * childLeaves, MinAngleForNode(child, childRadius));
                }

                if (required <= totalAngle)
                    return childRadius;

                childRadius *= Math.Sqrt(required / totalAngle);
            }

            return childRadius;
        }

        private static int CountLeaves(NodeViewModel node)
        {
            if (!node.IsExpanded || node.Children.Count == 0) return 1;
            return node.Children.Sum(CountLeaves);
        }

        private void UpdateContentExtent()
        {
            if (IsInDesignMode() || _vm?.RootNode == null)
            {
                ApplyDefaultContentExtent();
                return;
            }

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue)
            {
                _contentOriginX = 0;
                _contentOriginY = 0;
                _contentWidth = 800;
                _contentHeight = 600;
            }
            else
            {
                _contentOriginX = minX - ContentPadding;
                _contentOriginY = minY - ContentPadding;
                _contentWidth  = Math.Max(400, maxX - minX + ContentPadding * 2);
                _contentHeight = Math.Max(300, maxY - minY + ContentPadding * 2);
            }

            if (RootCanvas != null)
            {
                RootCanvas.Width  = _contentWidth;
                RootCanvas.Height = _contentHeight;
            }
        }

        private void ApplyDefaultContentExtent()
        {
            _contentOriginX = 0;
            _contentOriginY = 0;
            _contentWidth = 800;
            _contentHeight = 600;
            if (RootCanvas == null) return;
            RootCanvas.Width = _contentWidth;
            RootCanvas.Height = _contentHeight;
        }

        private double MapX(double worldX) => worldX - _contentOriginX;
        private double MapY(double worldY) => worldY - _contentOriginY;

        private void DrawConnections(NodeViewModel node)
        {
            if (!node.IsExpanded) return;

            foreach (var child in node.Children)
            {
                var path = CreateConnection(node, child);
                _connectionPaths[child.Model.Id] = path;
                ConnectionCanvas.Children.Add(path);
                DrawConnections(child);
            }
        }

        private Path CreateConnection(NodeViewModel parent, NodeViewModel child)
        {
            var (lightColor, _) = GetBranchColors(child.BranchColorIndex);
            var brush = new SolidColorBrush(lightColor) { Opacity = 0.7 };
            double strokeWidth = child.Level <= 1 ? 2.5 : 1.8;

            return new Path
            {
                Stroke = brush,
                StrokeThickness = strokeWidth,
                StrokeLineJoin  = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                Data = BuildConnectionGeometry(parent, child)
            };
        }

        private Geometry BuildConnectionGeometry(NodeViewModel parent, NodeViewModel child)
        {
            var (start, end) = GetConnectionEndpoints(parent, child);
            return _vm!.ConnectionLineType switch
            {
                ConnectionLineType.Straight => BuildStraightGeometry(start, end),
                ConnectionLineType.Orthogonal => BuildOrthogonalGeometry(start, end),
                ConnectionLineType.Arc => BuildArcGeometry(parent, child, start, end),
                _ => BuildBezierGeometry(parent, child, start, end),
            };
        }

        private (Point start, Point end) GetConnectionEndpoints(NodeViewModel parent, NodeViewModel child)
        {
            double pCx = parent.X + parent.Width / 2;
            double pCy = parent.Y + NodeHeight / 2;
            double cCx = child.X + child.Width / 2;
            double cCy = child.Y + NodeHeight / 2;

            var startWorld = NodeShapeHelper.GetEdgePoint(parent, cCx, cCy, NodeHeight);
            var endWorld = NodeShapeHelper.GetEdgePoint(child, pCx, pCy, NodeHeight);
            return (
                new Point(MapX(startWorld.X), MapY(startWorld.Y)),
                new Point(MapX(endWorld.X), MapY(endWorld.Y)));
        }

        private static Geometry BuildStraightGeometry(Point start, Point end)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new LineSegment(end, isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        private Geometry BuildBezierGeometry(NodeViewModel parent, NodeViewModel child, Point start, Point end)
        {
            if (_vm!.LayoutType == LayoutType.HorizontalTree)
                return BuildTreeCurveGeometry(start, end);

            GetRadialAxes(parent, child, out double axisX, out double axisY, out _, out _);
            return BuildAxisCurveGeometry(start, end, axisX, axisY);
        }

        private Geometry BuildArcGeometry(NodeViewModel parent, NodeViewModel child, Point start, Point end)
        {
            if (_vm!.LayoutType == LayoutType.HorizontalTree)
                return BuildTreeArcGeometry(start, end);

            GetRadialAxes(parent, child, out double axisX, out double axisY, out double perpX, out double perpY);
            return BuildAxisArcGeometry(start, end, axisX, axisY, perpX, perpY);
        }

        /// <summary>트리 레이아웃 곡선: 연결 축(X) 방향 arm 3차 베지어.</summary>
        private static Geometry BuildTreeCurveGeometry(Point start, Point end)
        {
            return BuildAxisCurveGeometry(start, end, 1, 0);
        }

        /// <summary>트리 레이아웃 원호: 중간점에서 연결 수직(Y) bulge 2차 베지어.</summary>
        private static Geometry BuildTreeArcGeometry(Point start, Point end)
        {
            return BuildAxisArcGeometry(start, end, 1, 0, 0, 1);
        }

        /// <summary>곡선: 트리와 동일 — 연결 축 방향 arm 베지어 (방사형은 부모→자식 축).</summary>
        private static Geometry BuildAxisCurveGeometry(
            Point start, Point end, double axisX, double axisY)
        {
            double axial = (end.X - start.X) * axisX + (end.Y - start.Y) * axisY;
            double arm = Math.Clamp(Math.Abs(axial) * 0.42, ConnectionArmMin, ConnectionArmMax);
            return BuildCubicBezierGeometry(
                start,
                end,
                new Point(start.X + axisX * arm, start.Y + axisY * arm),
                new Point(end.X - axisX * arm, end.Y - axisY * arm));
        }

        /// <summary>원호: 트리와 동일 — 중간점에서 연결 수직 bulge 2차 베지어 (방사형은 접선 방향).</summary>
        private static Geometry BuildAxisArcGeometry(
            Point start, Point end, double axisX, double axisY, double perpX, double perpY)
        {
            var mid = new Point((start.X + end.X) / 2, (start.Y + end.Y) / 2);
            double axial = Math.Abs((end.X - start.X) * axisX + (end.Y - start.Y) * axisY);
            double bulge = Math.Clamp(axial * 0.15, 8, 40);

            double cross = (end.X - start.X) * perpX + (end.Y - start.Y) * perpY;
            if (Math.Abs(cross) > 1)
                bulge *= Math.Sign(cross);
            else if (Math.Abs(end.Y - start.Y) > 1)
                bulge *= Math.Sign(end.Y - start.Y);

            return BuildQuadraticBezierGeometry(
                start,
                end,
                new Point(mid.X - perpX * bulge, mid.Y - perpY * bulge));
        }

        /// <summary>방사형 연결 축(부모→자식)과 수직 접선을 구합니다.</summary>
        private void GetRadialAxes(
            NodeViewModel parent, NodeViewModel child,
            out double axisX, out double axisY, out double perpX, out double perpY)
        {
            var parentCenter = new Point(
                MapX(parent.X + parent.Width / 2),
                MapY(parent.Y + NodeHeight / 2));
            var childCenter = new Point(
                MapX(child.X + child.Width / 2),
                MapY(child.Y + NodeHeight / 2));

            axisX = childCenter.X - parentCenter.X;
            axisY = childCenter.Y - parentCenter.Y;
            double len = Math.Sqrt(axisX * axisX + axisY * axisY);
            if (len < 1)
            {
                axisX = 1;
                axisY = 0;
            }
            else
            {
                axisX /= len;
                axisY /= len;
            }

            perpX = -axisY;
            perpY = axisX;
        }

        private void RebuildAllConnections()
        {
            if (_vm?.RootNode == null) return;

            ConnectionCanvas.Children.Clear();
            _connectionPaths.Clear();
            DrawConnections(_vm.RootNode);
        }

        private static Geometry BuildCubicBezierGeometry(Point start, Point end, Point cp1, Point cp2)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new BezierSegment(cp1, cp2, end, isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        private static Geometry BuildQuadraticBezierGeometry(Point start, Point end, Point control)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new QuadraticBezierSegment(control, end, isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        private Geometry BuildOrthogonalGeometry(Point start, Point end)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            if (_vm!.LayoutType == LayoutType.HorizontalTree)
            {
                double midX = (start.X + end.X) / 2;
                fig.Segments.Add(new LineSegment(new Point(midX, start.Y), isStroked: true));
                fig.Segments.Add(new LineSegment(new Point(midX, end.Y), isStroked: true));
                fig.Segments.Add(new LineSegment(end, isStroked: true));
            }
            else
            {
                double dx = end.X - start.X;
                double dy = end.Y - start.Y;
                if (Math.Abs(dx) >= Math.Abs(dy))
                {
                    fig.Segments.Add(new LineSegment(new Point(end.X, start.Y), isStroked: true));
                    fig.Segments.Add(new LineSegment(end, isStroked: true));
                }
                else
                {
                    fig.Segments.Add(new LineSegment(new Point(start.X, end.Y), isStroked: true));
                    fig.Segments.Add(new LineSegment(end, isStroked: true));
                }
            }

            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        private void DrawNodes(NodeViewModel node)
        {
            var border = CreateNodeElement(node);
            _nodeElements[node.Model.Id] = border;

            Canvas.SetLeft(border, MapX(node.X));
            Canvas.SetTop(border, MapY(node.Y));
            NodeCanvas.Children.Add(border);

            if (node.IsExpanded)
                foreach (var child in node.Children)
                    DrawNodes(child);
        }

        private FrameworkElement CreateNodeElement(NodeViewModel node)
        {
            var (lightColor, darkColor) = node.Level == 0
                ? (RootLight, RootDark)
                : GetBranchColors(node.BranchColorIndex);

            double fontSize = node.Level == 0 ? 16 : 13;

            var gradient = new LinearGradientBrush(
                Color.FromRgb((byte)(darkColor.R + 20), (byte)(darkColor.G + 20), (byte)(darkColor.B + 40)),
                darkColor,
                new Point(0, 0), new Point(1, 1));

            var text = new TextBlock
            {
                Text              = node.Text,
                FontFamily        = new FontFamily("Segoe UI"),
                FontSize          = fontSize,
                FontWeight        = node.Level == 0 ? FontWeights.Bold : FontWeights.SemiBold,
                Foreground        = new SolidColorBrush(Colors.White),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment   = VerticalAlignment.Center,
                TextAlignment       = TextAlignment.Center,
                TextTrimming        = TextTrimming.CharacterEllipsis,
                MaxWidth            = node.Width - 16,
                Padding             = new Thickness(8, 0, 8, 0)
            };

            double borderThickness = node.IsSelected ? 2.5 : 1.0;
            var element = NodeShapeHelper.CreateNodeVisual(
                node, gradient, new SolidColorBrush(lightColor), borderThickness,
                text, node.Width, NodeHeight);

            element.Effect = new DropShadowEffect
            {
                Color       = Color.FromArgb(120, 0, 0, 0),
                BlurRadius  = 12,
                ShadowDepth = 4,
                Direction   = 270
            };

            element.MouseLeftButtonDown  += Node_MouseLeftButtonDown;
            element.MouseRightButtonDown += Node_MouseRightButtonDown;
            element.MouseMove            += Node_MouseMove;
            element.MouseLeftButtonUp    += Node_MouseLeftButtonUp;
            element.MouseEnter           += Node_MouseEnter;
            element.MouseLeave           += Node_MouseLeave;

            var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(250))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
            };
            element.BeginAnimation(OpacityProperty, fadeIn);

            return element;
        }

        private static Border? GetNodeOutline(FrameworkElement? root) =>
            root is Grid { Children.Count: > 0 } g ? g.Children[^1] as Border : null;

        private void ReplaceNodeVisual(NodeViewModel node)
        {
            if (!_nodeElements.TryGetValue(node.Model.Id, out var oldElement))
                return;

            double left = Canvas.GetLeft(oldElement);
            double top = Canvas.GetTop(oldElement);
            int zIndex = Panel.GetZIndex(oldElement);
            var transform = oldElement.RenderTransform;

            var newElement = CreateNodeElement(node);
            Canvas.SetLeft(newElement, left);
            Canvas.SetTop(newElement, top);
            Panel.SetZIndex(newElement, zIndex);
            newElement.RenderTransform = transform;
            newElement.Opacity = _editingNode == node ? 0 : 1;

            int index = NodeCanvas.Children.IndexOf(oldElement);
            NodeCanvas.Children.Remove(oldElement);
            if (index >= 0)
                NodeCanvas.Children.Insert(index, newElement);
            else
                NodeCanvas.Children.Add(newElement);

            _nodeElements[node.Model.Id] = newElement;
            if (_editingNodeVisual == oldElement)
                _editingNodeVisual = newElement;

            RefreshConnectionsForNode(node);
            RefreshSelectionVisuals();
        }

        private void RefreshConnectionsForNode(NodeViewModel node)
        {
            if (node.Parent != null &&
                _connectionPaths.TryGetValue(node.Model.Id, out var pathToParent))
                pathToParent.Data = BuildConnectionGeometry(node.Parent, node);

            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
            {
                if (_connectionPaths.TryGetValue(child.Model.Id, out var path))
                    path.Data = BuildConnectionGeometry(node, child);
            }
        }

        private DateTime _lastClickTime = DateTime.MinValue;
        private NodeViewModel? _lastClickedNode;

        private void Node_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is not FrameworkElement border || border.Tag is not NodeViewModel vm) return;
            e.Handled = true;

            var now = DateTime.Now;
            bool isDoubleClick = (now - _lastClickTime).TotalMilliseconds < 400 && _lastClickedNode == vm;
            _lastClickTime = now;
            _lastClickedNode = vm;

            if (isDoubleClick)
            {
                StartEditing(vm, border);
                return;
            }

            _dragNode = vm;
            _isDraggingNode = false;
            _dragLastWorldPos = GetMouseWorldPosition(e);
            border.CaptureMouse();

            _vm!.SelectedNode = vm;
            RefreshSelectionVisuals();
        }

        private void Node_MouseRightButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is not FrameworkElement border || border.Tag is not NodeViewModel vm || _vm == null)
                return;

            e.Handled = true;
            _vm.SelectedNode = vm;
            RefreshSelectionVisuals();
            CommandManager.InvalidateRequerySuggested();

            var menu = NodeContextMenuHelper.Build(
                vm,
                _vm,
                this,
                this,
                node =>
                {
                    if (_nodeElements.TryGetValue(node.Model.Id, out var border))
                        StartEditing(node, border);
                });
            menu.PlacementTarget = border;
            menu.IsOpen = true;
        }

        private void Node_MouseMove(object sender, MouseEventArgs e)
        {
            if (_dragNode == null || sender is not FrameworkElement border || e.LeftButton != MouseButtonState.Pressed)
                return;

            var worldPos = GetMouseWorldPosition(e);
            double dx = worldPos.X - _dragLastWorldPos.X;
            double dy = worldPos.Y - _dragLastWorldPos.Y;

            if (!_isDraggingNode)
            {
                if (Math.Abs(dx) < DragThreshold && Math.Abs(dy) < DragThreshold)
                    return;
                _isDraggingNode = true;
                _userPositioned = true;
                border.Opacity = 0.92;
            }

            _dragLastWorldPos = worldPos;
            MoveNodeSubtree(_dragNode, dx, dy);
            RefreshAllVisuals();
            e.Handled = true;
        }

        private void Node_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (sender is FrameworkElement border)
            {
                border.ReleaseMouseCapture();
                border.Opacity = 1.0;
            }

            if (_isDraggingNode)
            {
                UpdateContentExtent();
                RefreshAllVisuals();
                e.Handled = true;
            }

            _dragNode = null;
            _isDraggingNode = false;
        }

        private static void MoveNodeSubtree(NodeViewModel node, double dx, double dy)
        {
            node.X += dx;
            node.Y += dy;
            node.HasManualPosition = true;
            node.SyncToModel();
            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
                MoveNodeSubtree(child, dx, dy);
        }

        private Point GetMouseWorldPosition(MouseEventArgs e)
        {
            var canvasPos = e.GetPosition(NodeCanvas);
            return new Point(canvasPos.X + _contentOriginX, canvasPos.Y + _contentOriginY);
        }

        private void RefreshAllVisuals()
        {
            if (_vm?.RootNode == null) return;

            foreach (var node in _vm.GetAllNodes())
            {
                if (_nodeElements.TryGetValue(node.Model.Id, out var border))
                {
                    Canvas.SetLeft(border, MapX(node.X));
                    Canvas.SetTop(border, MapY(node.Y));
                }
            }

            RefreshAllConnections(_vm.RootNode);
        }

        private void RefreshAllConnections(NodeViewModel node)
        {
            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
            {
                if (_connectionPaths.TryGetValue(child.Model.Id, out var path))
                    path.Data = BuildConnectionGeometry(node, child);
                RefreshAllConnections(child);
            }
        }

        private void Node_MouseEnter(object sender, MouseEventArgs e)
        {
            if (sender is not FrameworkElement border) return;
            border.RenderTransform = new ScaleTransform(1.06, 1.06, border.Width / 2, border.Height / 2);
            border.RenderTransformOrigin = new Point(0.5, 0.5);
            Panel.SetZIndex(border, 10);
        }

        private void Node_MouseLeave(object sender, MouseEventArgs e)
        {
            if (sender is not FrameworkElement border) return;
            border.RenderTransform = null;
            Panel.SetZIndex(border, 0);
        }

        private void RefreshSelectionVisuals()
        {
            if (_vm == null) return;
            foreach (var (id, element) in _nodeElements)
            {
                var node = FindNode(id);
                if (node == null) continue;

                double thickness = node.IsSelected ? 2.5 : 1.0;
                var (lightColor, _) = node.Level == 0
                    ? (RootLight, RootDark)
                    : GetBranchColors(node.BranchColorIndex);

                var brush = node.IsSelected
                    ? new SolidColorBrush(Colors.White)
                    : new SolidColorBrush(lightColor);

                var outline = GetNodeOutline(element);
                if (outline != null && outline.Visibility == Visibility.Visible)
                {
                    outline.BorderThickness = new Thickness(thickness);
                    outline.BorderBrush = brush;
                }

                ApplyShapeStroke(element, brush, thickness);
            }
        }

        private static void ApplyShapeStroke(FrameworkElement root, Brush brush, double thickness)
        {
            var shape = NodeShapeHelper.GetShapeElement(root);
            switch (shape)
            {
                case Shape s:
                    s.Stroke = brush;
                    s.StrokeThickness = thickness;
                    break;
                case Border b:
                    b.BorderBrush = brush;
                    b.BorderThickness = new Thickness(thickness);
                    break;
            }
        }

        private void StartEditing(NodeViewModel vm, FrameworkElement border)
        {
            _editingNode = vm;
            _editingNodeVisual = border;
            border.Opacity = 0;

            EditBox.Text = vm.Text;
            EditBox.FontSize = vm.Level == 0 ? 16 : 13;
            PositionEditOverlay(border);

            EditOverlay.IsHitTestVisible = true;
            EditBorder.Visibility = Visibility.Visible;
            EditBox.SelectAll();
            EditBox.Focus();
        }

        private void PositionEditOverlay(FrameworkElement border)
        {
            double w = border.ActualWidth  > 0 ? border.ActualWidth  : border.Width;
            double h = border.ActualHeight > 0 ? border.ActualHeight : border.Height;

            var transform = border.TransformToVisual(this);
            var topLeft = transform.Transform(new Point(0, 0));
            var bottomRight = transform.Transform(new Point(w, h));

            double width  = Math.Max(bottomRight.X - topLeft.X, 80);
            double height = Math.Max(bottomRight.Y - topLeft.Y, 24);

            Canvas.SetLeft(EditBorder, topLeft.X);
            Canvas.SetTop(EditBorder, topLeft.Y);
            EditBorder.Width  = width;
            EditBorder.Height = height;
        }

        private void EndEditingSession()
        {
            if (_editingNodeVisual != null)
                _editingNodeVisual.Opacity = 1;

            _editingNode = null;
            _editingNodeVisual = null;
            EditBorder.Visibility = Visibility.Collapsed;
            EditOverlay.IsHitTestVisible = false;
        }

        private void CommitEdit()
        {
            if (_editingNode == null) return;
            string newText = EditBox.Text.Trim();
            var node = _editingNode;
            EndEditingSession();
            if (!string.IsNullOrEmpty(newText))
            {
                node.Text = newText;
                RebuildCanvas();
                CenterViewOnSelected();
            }
        }

        private void CancelEdit() => EndEditingSession();

        private void EditBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)  { CommitEdit(); e.Handled = true; }
            if (e.Key == Key.Escape) { CancelEdit(); e.Handled = true; }
        }

        private void EditBox_LostFocus(object sender, RoutedEventArgs e) => CommitEdit();

        // ── Pan (scroll) / Ctrl+Wheel zoom ────────────────────────────────────

        private void CanvasScroller_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (Keyboard.Modifiers != ModifierKeys.Control)
                return;

            e.Handled = true;
            double factor  = e.Delta > 0 ? 1.12 : 1.0 / 1.12;
            double oldZoom = ScaleXform.ScaleX;
            double newZoom = Math.Clamp(oldZoom * factor, 0.15, 4.0);
            ZoomAtPoint(e.GetPosition(CanvasScroller), oldZoom, newZoom);
        }

        private void ZoomAtPoint(Point scrollerPoint, double oldZoom, double newZoom)
        {
            double ratio = newZoom / oldZoom;
            CanvasScroller.ScrollToHorizontalOffset(
                (CanvasScroller.HorizontalOffset + scrollerPoint.X) * ratio - scrollerPoint.X);
            CanvasScroller.ScrollToVerticalOffset(
                (CanvasScroller.VerticalOffset + scrollerPoint.Y) * ratio - scrollerPoint.Y);

            ScaleXform.ScaleX = newZoom;
            ScaleXform.ScaleY = newZoom;

            _suppressZoomSync = true;
            if (_vm != null) _vm.ZoomLevel = newZoom;
            _suppressZoomSync = false;
            ZoomLabel.Text = $"{newZoom:P0}";
        }

        private void ApplyZoomAtViewportCenter(double newZoom)
        {
            newZoom = Math.Clamp(newZoom, 0.15, 4.0);
            var center = new Point(CanvasScroller.ViewportWidth / 2, CanvasScroller.ViewportHeight / 2);
            ZoomAtPoint(center, ScaleXform.ScaleX, newZoom);
        }

        private void RootCanvas_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left && e.OriginalSource == RootCanvas)
            {
                _vm!.SelectedNode = null;
                RefreshSelectionVisuals();
            }
        }

        private void CanvasScroller_PreviewMouseDown(object sender, MouseButtonEventArgs e)
        {
            bool panLeft = e.ChangedButton == MouseButton.Left && !IsNodeHit(e.OriginalSource as DependencyObject);
            if (e.ChangedButton == MouseButton.Middle || panLeft)
            {
                _isPanning = true;
                _panStart = e.GetPosition(CanvasScroller);
                _panStartScrollX = CanvasScroller.HorizontalOffset;
                _panStartScrollY = CanvasScroller.VerticalOffset;
                CanvasScroller.CaptureMouse();
                if (panLeft) e.Handled = true;
            }
        }

        private static bool IsNodeHit(DependencyObject? source)
        {
            while (source != null)
            {
                if (source is FrameworkElement { Tag: NodeViewModel }) return true;
                source = VisualTreeHelper.GetParent(source);
            }
            return false;
        }

        private void CanvasScroller_PreviewMouseMove(object sender, MouseEventArgs e)
        {
            if (!_isPanning) return;
            var pos = e.GetPosition(CanvasScroller);
            CanvasScroller.ScrollToHorizontalOffset(_panStartScrollX - (pos.X - _panStart.X));
            CanvasScroller.ScrollToVerticalOffset(_panStartScrollY - (pos.Y - _panStart.Y));
        }

        private void CanvasScroller_PreviewMouseUp(object sender, MouseButtonEventArgs e)
        {
            if (!_isPanning) return;
            _isPanning = false;
            CanvasScroller.ReleaseMouseCapture();
        }

        public void RebuildFromViewModel() => RebuildCanvas();

        public void CenterView()
        {
            if (_vm?.RootNode == null || CanvasScroller.ViewportWidth <= 0) return;

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double mapCX = MapX((minX + maxX) / 2);
            double mapCY = MapY((minY + maxY) / 2);
            double zoom  = ScaleXform.ScaleX;

            CanvasScroller.ScrollToHorizontalOffset(mapCX * zoom - CanvasScroller.ViewportWidth  / 2);
            CanvasScroller.ScrollToVerticalOffset(mapCY * zoom - CanvasScroller.ViewportHeight / 2);
        }

        public void FitToView()
        {
            if (_vm?.RootNode == null || CanvasScroller.ViewportWidth <= 0) return;

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double mapW = maxX - minX + ContentPadding;
            double mapH = maxY - minY + ContentPadding;

            double fitZoom = Math.Min(
                CanvasScroller.ViewportWidth  / mapW,
                CanvasScroller.ViewportHeight / mapH);
            fitZoom = Math.Clamp(fitZoom, 0.15, 2.0);

            _suppressZoomSync = true;
            ScaleXform.ScaleX = fitZoom;
            ScaleXform.ScaleY = fitZoom;
            if (_vm != null) _vm.ZoomLevel = fitZoom;
            _suppressZoomSync = false;
            ZoomLabel.Text = $"{fitZoom:P0}";

            double mapCX = MapX((minX + maxX) / 2);
            double mapCY = MapY((minY + maxY) / 2);
            CanvasScroller.ScrollToHorizontalOffset(mapCX * fitZoom - CanvasScroller.ViewportWidth  / 2);
            CanvasScroller.ScrollToVerticalOffset(mapCY * fitZoom - CanvasScroller.ViewportHeight / 2);
        }

        private (double minX, double minY, double maxX, double maxY) GetBoundingBox()
        {
            if (IsInDesignMode() || _vm?.RootNode == null)
                return (double.MaxValue, double.MaxValue, double.MinValue, double.MinValue);

            double minX = double.MaxValue, minY = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue;

            foreach (var node in _vm.RootNode.GetVisibleDescendants())
            {
                if (node.X < minX) minX = node.X;
                if (node.Y < minY) minY = node.Y;
                if (node.X + node.Width > maxX) maxX = node.X + node.Width;
                if (node.Y + NodeHeight > maxY) maxY = node.Y + NodeHeight;
            }
            return (minX, minY, maxX, maxY);
        }

        private void CenterViewOnSelected()
        {
            if (_vm?.SelectedNode == null) return;
            var node = _vm.SelectedNode;
            double cx = MapX(node.X + node.Width / 2);
            double cy = MapY(node.Y + NodeHeight / 2);
            double zoom = ScaleXform.ScaleX;

            ScrollToAnimated(
                cx * zoom - CanvasScroller.ViewportWidth / 2,
                cy * zoom - CanvasScroller.ViewportHeight / 2);
        }

        private void ScrollToAnimated(double targetX, double targetY)
        {
            double startX = CanvasScroller.HorizontalOffset;
            double startY = CanvasScroller.VerticalOffset;
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(16)
            };
            var start = DateTime.Now;
            timer.Tick += (_, _) =>
            {
                double t = Math.Min(1.0, (DateTime.Now - start).TotalMilliseconds / 350);
                double eased = t * t * (3 - 2 * t);
                CanvasScroller.ScrollToHorizontalOffset(startX + (targetX - startX) * eased);
                CanvasScroller.ScrollToVerticalOffset(startY + (targetY - startY) * eased);
                if (t >= 1.0) timer.Stop();
            };
            timer.Start();
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (_vm == null || EditBorder.Visibility == Visibility.Visible) return;

            switch (e.Key)
            {
                case Key.Tab when e.KeyboardDevice.Modifiers == ModifierKeys.None:
                    _vm.AddChildCommand.Execute(null);   e.Handled = true; break;
                case Key.Enter when e.KeyboardDevice.Modifiers == ModifierKeys.None:
                    _vm.AddSiblingCommand.Execute(null); e.Handled = true; break;
                case Key.Delete:
                    _vm.DeleteNodeCommand.Execute(null); e.Handled = true; break;
                case Key.Space:
                    _vm.ToggleExpandCommand.Execute(null); e.Handled = true; break;
                case Key.F2 when _vm.SelectedNode != null:
                    if (_nodeElements.TryGetValue(_vm.SelectedNode.Model.Id, out var b))
                        StartEditing(_vm.SelectedNode, b);
                    e.Handled = true; break;
            }
        }

        private static (Color light, Color dark) GetBranchColors(int index)
        {
            if (index < 0) return (RootLight, RootDark);
            return BranchColors[Math.Abs(index) % BranchColors.Length];
        }

        private double MeasureTextWidth(string text, double fontSize)
        {
            var ft = new FormattedText(
                text,
                CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal,
                    FontWeights.SemiBold, FontStretches.Normal),
                fontSize,
                Brushes.White,
                VisualTreeHelper.GetDpi(this).PixelsPerDip);
            return Math.Max(NodeMinWidth, ft.Width);
        }

        private NodeViewModel? FindNode(Guid id)
            => _vm?.GetAllNodes().FirstOrDefault(n => n.Model.Id == id);
    }
}
