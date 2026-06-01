using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using Microsoft.Win32;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    public partial class MindMapCanvasControl : UserControl
    {
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
        private NodeViewModel? _notePanelNode;
        private NodeViewModel? _imagePanelNode;
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
        private const double RadialLinkGap    = 10; // 부모·자식 중심 간 최소 간격 (가장자리 기준)
        private const double RadialSiblingGap = 10; // 같은 링에서 형제 노드 호 간 최소 간격
        private const double FishboneRibStub   = 32; // 척추(spine)에서 1단계 카테고리 노드까지
        private const double FishboneSpineGap  = 20; // 척추를 따라 카테고리 간 간격
        private const double FishboneSpineTail = 48; // 척추 끝에서 루트(머리)까지
        private const double FishbonePackMargin = 8;  // 가지 간 겹침 방지 여백
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
                _vm.RequestNodeColorRefresh -= OnRequestNodeColorRefresh;
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
            _vm.RequestNodeColorRefresh += OnRequestNodeColorRefresh;
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
                if (_notePanelNode != null && _notePanelNode != _vm?.SelectedNode)
                    CloseNotePanel();
                if (_imagePanelNode != null && _imagePanelNode != _vm?.SelectedNode)
                    CloseImagePanel();
                RefreshSelectionVisuals();
            }
        }

        public void OpenNoteForNode(NodeViewModel node) => OpenNotePanel(node);

        public void OpenImageForNode(NodeViewModel node)
        {
            if (node.HasImage)
                OpenImagePanel(node);
            else
                PickImageForNode(node);
        }

        private void OnRequestLayout(object? sender, EventArgs e) => RebuildCanvas();

        private void OnRequestNodeShapeRefresh(object? sender, NodeViewModel node) => ReplaceNodeVisual(node);

        private void OnRequestNodeColorRefresh(object? sender, NodeViewModel node)
        {
            foreach (var desc in node.GetAllDescendants())
                ReplaceNodeVisual(desc);

            RebuildAllConnections();
        }

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

            CloseNotePanel();
            CloseImagePanel();

            if (_vm.LayoutType != _lastLayoutType)
            {
                _userPositioned = false;
                ClearManualPositionsOnAllNodes();
                _lastLayoutType = _vm.LayoutType;
            }

            _userPositioned = _vm.GetAllNodes().Any(n => n.HasManualPosition);

            if (!_userPositioned)
                ApplyAutomaticLayoutPositions();
            else
            {
                foreach (var node in _vm.GetAllNodes())
                    node.Width = MeasureTextWidth(node.Text, node.Level == 0 ? 16 : 13) + 28;

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
                subtreeHeight = GetLayoutBlockHeight(node) + HNodeSpacingY;
                return subtreeHeight;
            }

            double totalH = 0;
            double childX = x + node.Width + HNodeSpacingX;
            foreach (var child in node.Children)
                totalH += LayoutHorizontal(child, childX, yStart + totalH, out _);

            double firstChildCY = node.Children[0].Y + GetLayoutBlockHeight(node.Children[0]) / 2;
            double lastChildCY  = node.Children[^1].Y + GetLayoutBlockHeight(node.Children[^1]) / 2;
            node.X = x;
            node.Y = (firstChildCY + lastChildCY) / 2 - GetLayoutBlockHeight(node) / 2;
            subtreeHeight = totalH;
            return totalH;
        }

        private void LayoutRadial(NodeViewModel root)
        {
            double cx = ContentPadding + 80;
            double cy = ContentPadding + 80;
            LayoutRadialNode(root, cx, cy, 0, Math.PI * 2);
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

        /// <summary>
        /// 피쉬본(어골) 레이아웃: 루트가 오른쪽(머리), 1단계 자식은 척추에 위·아래로 교대 배치,
        /// 하위 노드는 각 가지를 따라 왼쪽으로 뻗습니다. 가지 경계 상자가 겹치지 않도록 패킹합니다.
        /// </summary>
        private void LayoutFishbone(NodeViewModel root)
        {
            double spineY = ContentPadding + 120;
            double spineLeft = ContentPadding + 40;

            if (!root.IsExpanded || root.Children.Count == 0)
            {
                root.X = spineLeft + 200;
                root.Y = spineY - NodeHeight / 2;
                return;
            }

            var placedBounds = new List<(double minX, double minY, double maxX, double maxY)>();
            double spineEnd = 0;

            for (int i = 0; i < root.Children.Count; i++)
            {
                var child = root.Children[i];
                bool upper = i % 2 == 0;
                PrepareFishboneRib(child, upper);

                var (minX, minY, maxX, maxY) = GetSubtreeBounds(child);
                double perp = maxY - minY;
                double attachRight = child.X + child.Width;

                double spineAttach = spineEnd > 0 ? spineEnd + FishboneSpineGap : 0;
                const int maxAttempts = 400;

                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    double spineX = spineLeft + spineAttach;
                    double dx = spineX - attachRight;
                    double dyWorld = upper
                        ? spineY - FishboneRibStub - (child.Y + NodeHeight)
                        : spineY + FishboneRibStub - child.Y;

                    double wMinX = minX + dx;
                    double wMinY = minY + dyWorld;
                    double wMaxX = maxX + dx;
                    double wMaxY = maxY + dyWorld;

                    if (!BoundsOverlapAny(placedBounds, wMinX, wMinY, wMaxX, wMaxY))
                    {
                        ShiftSubtree(child, dx, dyWorld);
                        placedBounds.Add((wMinX, wMinY, wMaxX, wMaxY));
                        spineEnd = Math.Max(spineEnd, spineAttach + perp + FishboneSpineGap);
                        break;
                    }

                    spineAttach += 6;
                }

                if (placedBounds.Count <= i)
                {
                    double spineX = spineLeft + spineAttach;
                    double dx = spineX - attachRight;
                    double dyWorld = upper
                        ? spineY - FishboneRibStub - (child.Y + NodeHeight)
                        : spineY + FishboneRibStub - child.Y;
                    ShiftSubtree(child, dx, dyWorld);
                    var (wMinX, wMinY, wMaxX, wMaxY) = GetSubtreeBounds(child);
                    placedBounds.Add((wMinX, wMinY, wMaxX, wMaxY));
                    spineEnd = Math.Max(spineEnd, spineAttach + perp + FishboneSpineGap);
                }
            }

            root.X = spineLeft + spineEnd + FishboneSpineTail;
            root.Y = spineY - NodeHeight / 2;
        }

        private void PrepareFishboneRib(NodeViewModel child, bool upper)
        {
            LayoutHorizontal(child, 0, 0, out _);
            MirrorSubtreeX(child);

            var (_, minY, _, maxY) = GetSubtreeBounds(child);
            double dyLocal = upper ? -maxY + NodeHeight : -minY;
            ShiftSubtree(child, 0, dyLocal);
        }

        private static bool BoundsOverlapAny(
            List<(double minX, double minY, double maxX, double maxY)> placed,
            double minX, double minY, double maxX, double maxY)
        {
            double m = FishbonePackMargin;
            foreach (var (pMinX, pMinY, pMaxX, pMaxY) in placed)
            {
                if (minX - m < pMaxX && maxX + m > pMinX &&
                    minY - m < pMaxY && maxY + m > pMinY)
                    return true;
            }

            return false;
        }

        private void ApplyLayoutFlip(bool flipHorizontal, bool flipVertical)
        {
            if (_vm?.RootNode == null) return;

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double cx = (minX + maxX) / 2;
            double cy = (minY + maxY) / 2;

            foreach (var node in _vm.GetAllNodes())
            {
                if (flipHorizontal)
                    node.X = 2 * cx - node.X - node.Width;
                if (flipVertical)
                    node.Y = 2 * cy - node.Y - NodeHeight;
            }
        }

        private static void MirrorSubtreeX(NodeViewModel node)
        {
            node.X = -node.X - node.Width;
            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
                MirrorSubtreeX(child);
        }

        private (double minX, double minY, double maxX, double maxY) GetSubtreeBounds(NodeViewModel node)
        {
            double minX = node.X;
            double minY = node.Y;
            double maxX = node.X + node.Width;
            double maxY = GetNodeExtentBottom(node);

            if (!node.IsExpanded) return (minX, minY, maxX, maxY);

            foreach (var child in node.Children)
            {
                var (cMinX, cMinY, cMaxX, cMaxY) = GetSubtreeBounds(child);
                minX = Math.Min(minX, cMinX);
                minY = Math.Min(minY, cMinY);
                maxX = Math.Max(maxX, cMaxX);
                maxY = Math.Max(maxY, cMaxY);
            }

            return (minX, minY, maxX, maxY);
        }

        private void LayoutRadialNode(NodeViewModel node, double cx, double cy,
                                      double startAngle, double endAngle)
        {
            node.X = cx - node.Width / 2;
            node.Y = cy - NodeHeight / 2;

            if (!node.IsExpanded || node.Children.Count == 0) return;

            double totalAngle = endAngle - startAngle;
            int leafCount = CountLeaves(node);
            double angleStep = totalAngle / Math.Max(leafCount, 1);
            double childRadius = ComputeChildOrbitRadius(node, node.Children, totalAngle, angleStep);

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
                    childMidAngle + childAngleSpan / 2);

                currentAngle += childAngleSpan;
            }
        }

        private double GetNodeBoundRadius(NodeViewModel node)
        {
            double h = GetLayoutBlockHeight(node);
            return Math.Sqrt(node.Width * node.Width + h * h) / 2;
        }

        /// <summary>같은 링에서 노드가 겹치지 않도록 하는 최소 호(arc) 각도.</summary>
        private double MinAngleForNode(NodeViewModel node, double orbitRadius)
        {
            double arcLength = Math.Max(node.Width, GetLayoutBlockHeight(node)) + RadialSiblingGap;
            return arcLength / Math.Max(orbitRadius, 1);
        }

        /// <summary>부모 중심에서 자식 링까지 최소 반경(방향·호 각도 모두 만족).</summary>
        private double ComputeChildOrbitRadius(
            NodeViewModel parent,
            IList<NodeViewModel> children,
            double totalAngle,
            double angleStep)
        {
            double parentBound = GetNodeBoundRadius(parent);
            double maxChildBound = children.Max(GetNodeBoundRadius);
            double childRadius = parentBound + maxChildBound + RadialLinkGap;

            for (int iter = 0; iter < 24; iter++)
            {
                double requiredAngle = 0;
                foreach (var child in children)
                {
                    int childLeaves = CountLeaves(child);
                    requiredAngle += Math.Max(angleStep * childLeaves, MinAngleForNode(child, childRadius));
                }

                if (requiredAngle <= totalAngle)
                    return childRadius;

                childRadius *= Math.Sqrt(requiredAngle / totalAngle);
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
            var path = new Path();
            ApplyConnectionVisual(path, parent, child);
            return path;
        }

        private void ApplyConnectionVisual(Path path, NodeViewModel parent, NodeViewModel child)
        {
            var (lightColor, _) = NodeColorHelper.GetNodeColors(child);
            var brush = new SolidColorBrush(lightColor) { Opacity = 0.7 };
            double baseThickness = _vm?.ConnectionLineThickness ?? 1.8;
            var centerGeometry = BuildConnectionGeometry(parent, child);

            if (_vm?.ConnectionLineTaper == true)
            {
                double startWidth = ConnectionLineTaperHelper.ThicknessAtLevel(parent.Level, baseThickness);
                double endWidth = ConnectionLineTaperHelper.ThicknessAtLevel(child.Level, baseThickness);
                var ribbon = ConnectionLineTaperHelper.BuildTaperedRibbon(centerGeometry, startWidth, endWidth);

                if (!ribbon.Bounds.IsEmpty && ribbon.Figures.Count > 0)
                {
                    path.Fill = brush;
                    path.Stroke = null;
                    path.StrokeThickness = 0;
                    path.Data = ribbon;
                    return;
                }
            }

            path.Fill = null;
            path.Stroke = brush;
            path.StrokeThickness = baseThickness;
            path.StrokeLineJoin = PenLineJoin.Round;
            path.StrokeStartLineCap = PenLineCap.Round;
            path.StrokeEndLineCap = PenLineCap.Round;
            path.Data = centerGeometry;
        }

        private Geometry BuildConnectionGeometry(NodeViewModel parent, NodeViewModel child)
        {
            var (start, end) = GetConnectionEndpoints(parent, child);
            return _vm!.ConnectionLineType switch
            {
                ConnectionLineType.Linear => BuildStraightGeometry(start, end),
                ConnectionLineType.SharpLinear => BuildSharpLinearGeometry(parent, child, start, end),
                ConnectionLineType.SharpBezier => BuildSharpBezierGeometry(parent, child, start, end),
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

            GetConnectionAxes(parent, child, out double axisX, out double axisY, out double perpX, out double perpY);
            return _vm.LayoutType == LayoutType.Radial
                ? BuildRadialCurveGeometry(start, end, axisX, axisY, perpX, perpY)
                : BuildAxisCurveGeometry(start, end, axisX, axisY);
        }

        /// <summary>FreeMind Sharp Bezier — 꺾임(elbow) 근처 제어점을 둔 3차 베지어.</summary>
        private Geometry BuildSharpBezierGeometry(NodeViewModel parent, NodeViewModel child, Point start, Point end)
        {
            if (_vm!.LayoutType == LayoutType.HorizontalTree)
            {
                double midX = (start.X + end.X) / 2;
                return BuildCubicBezierGeometry(
                    start, end,
                    new Point(midX, start.Y),
                    new Point(midX, end.Y));
            }

            if (Math.Abs(end.X - start.X) >= Math.Abs(end.Y - start.Y))
            {
                double midX = (start.X + end.X) / 2;
                return BuildCubicBezierGeometry(
                    start, end,
                    new Point(midX, start.Y),
                    new Point(midX, end.Y));
            }

            double midY = (start.Y + end.Y) / 2;
            return BuildCubicBezierGeometry(
                start, end,
                new Point(start.X, midY),
                new Point(end.X, midY));
        }

        /// <summary>트리 레이아웃 곡선: 연결 축(X) 방향 arm 3차 베지어.</summary>
        private static Geometry BuildTreeCurveGeometry(Point start, Point end)
        {
            return BuildAxisCurveGeometry(start, end, 1, 0);
        }

        /// <summary>곡선: 트리와 동일 — 연결 축 방향 arm 베지어.</summary>
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

        /// <summary>방사형 곡선: 축 arm + 접선 S-bulge (일직선 배치에서도 곡선이 보이도록).</summary>
        private static Geometry BuildRadialCurveGeometry(
            Point start, Point end, double axisX, double axisY, double perpX, double perpY)
        {
            double axial = (end.X - start.X) * axisX + (end.Y - start.Y) * axisY;
            double arm = Math.Clamp(Math.Abs(axial) * 0.42, ConnectionArmMin, ConnectionArmMax);
            double bulge = Math.Clamp(Math.Abs(axial) * 0.22, 12, 44);

            double cross = (end.X - start.X) * perpX + (end.Y - start.Y) * perpY;
            double side = Math.Abs(cross) > 1
                ? Math.Sign(cross)
                : Math.Abs(end.Y - start.Y) > 1 ? Math.Sign(end.Y - start.Y) : 1;

            return BuildCubicBezierGeometry(
                start,
                end,
                new Point(
                    start.X + axisX * arm + perpX * bulge * side,
                    start.Y + axisY * arm + perpY * bulge * side),
                new Point(
                    end.X - axisX * arm - perpX * bulge * side,
                    end.Y - axisY * arm - perpY * bulge * side));
        }

        private void GetConnectionAxes(
            NodeViewModel parent, NodeViewModel child,
            out double axisX, out double axisY, out double perpX, out double perpY)
            => GetRadialAxes(parent, child, out axisX, out axisY, out perpX, out perpY);

        /// <summary>연결 축(부모→자식)과 수직 접선을 구합니다.</summary>
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

        /// <summary>FreeMind Sharp Linear — 직각(꺾인) 연결.</summary>
        private Geometry BuildSharpLinearGeometry(
            NodeViewModel parent, NodeViewModel child, Point start, Point end)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            if (_vm!.LayoutType == LayoutType.HorizontalTree)
            {
                double midX = (start.X + end.X) / 2;
                fig.Segments.Add(new LineSegment(new Point(midX, start.Y), isStroked: true));
                fig.Segments.Add(new LineSegment(new Point(midX, end.Y), isStroked: true));
                fig.Segments.Add(new LineSegment(end, isStroked: true));
            }
            else if (_vm.LayoutType == LayoutType.Fishbone && parent.Level == 0)
            {
                double spineY = (start.Y + end.Y) / 2;
                fig.Segments.Add(new LineSegment(new Point(start.X, spineY), isStroked: true));
                fig.Segments.Add(new LineSegment(new Point(end.X, spineY), isStroked: true));
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
            var (lightColor, darkColor) = NodeColorHelper.GetNodeColors(node);

            double fontSize = node.Level == 0 ? 16 : 13;

            var gradient = NodeColorPalette.CreateNodeFillBrush(lightColor, darkColor);
            var (borderBrush, borderThickness) = NodeBorderHelper.GetBorder(node);

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

            var nodeVisual = NodeShapeHelper.CreateNodeVisual(
                node, gradient, borderBrush, borderThickness,
                text, node.Width, NodeHeight);

            // DropShadowEffect + LayoutTransform(확대) 조합은 WPF에서 색 반전/깨짐을 유발할 수 있음
            RenderOptions.SetBitmapScalingMode(nodeVisual, BitmapScalingMode.HighQuality);
            RenderOptions.SetEdgeMode(nodeVisual, EdgeMode.Aliased);

            var wrapper = new Grid
            {
                Width = node.Width,
                Height = NodeHeight,
                Tag = node
            };
            wrapper.Children.Add(nodeVisual);

            if (node.HasNote)
                wrapper.Children.Add(CreateNoteBadge(node));

            if (node.HasImage)
                wrapper.Children.Add(CreateImageBadge(node));

            wrapper.MouseLeftButtonDown  += Node_MouseLeftButtonDown;
            wrapper.MouseRightButtonDown += Node_MouseRightButtonDown;
            wrapper.MouseMove            += Node_MouseMove;
            wrapper.MouseLeftButtonUp    += Node_MouseLeftButtonUp;
            wrapper.MouseEnter           += Node_MouseEnter;
            wrapper.MouseLeave           += Node_MouseLeave;

            wrapper.Opacity = 1;

            return wrapper;
        }

        private Border CreateNoteBadge(NodeViewModel node)
        {
            var badge = new Border
            {
                Tag = "NoteBadge",
                Width = 18,
                Height = 18,
                CornerRadius = new CornerRadius(9),
                Background = new SolidColorBrush(Color.FromRgb(0xFF, 0xB7, 0x4D)),
                BorderBrush = new SolidColorBrush(Colors.White),
                BorderThickness = new Thickness(1),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, -7, -7, 0),
                Cursor = Cursors.Hand,
                ToolTip = node.IsNoteExpanded ? "노트 접기" : "노트 펼치기",
                Child = new TextBlock
                {
                    Text = node.IsNoteExpanded ? "−" : "+",
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 13,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, -1, 0, 0)
                }
            };

            badge.PreviewMouseLeftButtonDown += (_, e) =>
            {
                e.Handled = true;
                ToggleNotePanel(node);
            };

            return badge;
        }

        private Border CreateImageBadge(NodeViewModel node)
        {
            var badge = new Border
            {
                Tag = "ImageBadge",
                Width = 18,
                Height = 18,
                CornerRadius = new CornerRadius(9),
                Background = new SolidColorBrush(Color.FromRgb(0x64, 0xB5, 0xF6)),
                BorderBrush = new SolidColorBrush(Colors.White),
                BorderThickness = new Thickness(1),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(-7, -7, 0, 0),
                Cursor = Cursors.Hand,
                ToolTip = node.IsImageExpanded ? "그림 접기" : "그림 펼치기",
                Child = new TextBlock
                {
                    Text = node.IsImageExpanded ? "−" : "+",
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 13,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, -1, 0, 0)
                }
            };

            badge.PreviewMouseLeftButtonDown += (_, e) =>
            {
                e.Handled = true;
                ToggleImagePanel(node);
            };

            return badge;
        }

        private void ToggleNotePanel(NodeViewModel node)
        {
            if (_notePanelNode == node && node.IsNoteExpanded)
                CloseNotePanel();
            else
                OpenNotePanel(node);
        }

        private void OpenNotePanel(NodeViewModel node)
        {
            if (_editingNode != null)
                CancelEdit();

            if (_notePanelNode != null && _notePanelNode != node)
                CloseNotePanel();

            _vm!.SelectedNode = node;
            _notePanelNode = node;
            node.IsNoteExpanded = true;

            NoteBox.Text = node.Note;
            NoteBorder.Visibility = Visibility.Visible;
            UpdateOverlayHitTest();
            UpdateNoteBadge(node);
            AfterOverlayOpened(node, keepReflowOnClose: false);

            NoteBox.Focus();
            NoteBox.CaretIndex = NoteBox.Text.Length;
        }

        private void CloseNotePanel()
        {
            if (_notePanelNode == null) return;

            var node = _notePanelNode;
            bool hadNote = node.HasNote;
            node.Note = NoteBox.Text.Trim();
            bool noteAdded = !hadNote && node.HasNote;
            bool noteRemoved = hadNote && !node.HasNote;

            node.IsNoteExpanded = false;
            _notePanelNode = null;

            NoteBorder.Visibility = Visibility.Collapsed;
            UpdateOverlayHitTest();
            RestoreExpandReflowSnapshot();

            if (noteAdded || noteRemoved)
            {
                RelayoutAfterAttachmentChange(node);
                ReplaceNodeVisual(node);
            }
            else
                UpdateNoteBadge(node);

            if (_imagePanelNode == node)
                PositionNodeOverlays(node);
        }

        private void PositionNodeOverlays(NodeViewModel node)
        {
            if (!_nodeElements.TryGetValue(node.Model.Id, out var border))
                return;

            double w = border.ActualWidth > 0 ? border.ActualWidth : border.Width;
            var transform = border.TransformToVisual(this);
            var topLeft = transform.Transform(new Point(0, 0));
            var bottomLeft = transform.Transform(new Point(0, NodeHeight));

            double nodeWidth = Math.Max(w, 80);
            double overlayWidth = Math.Min(320, Math.Max(160, nodeWidth));
            double y = bottomLeft.Y + 6;

            if (_notePanelNode == node && NoteBorder.Visibility == Visibility.Visible)
            {
                NoteBorder.Width = Math.Min(300, overlayWidth);
                Canvas.SetLeft(NoteBorder, topLeft.X);
                Canvas.SetTop(NoteBorder, y);
                NoteBorder.UpdateLayout();
                y += NoteBorder.ActualHeight + 6;
            }

            if (_imagePanelNode == node && ImageBorder.Visibility == Visibility.Visible)
            {
                ImageBorder.Width = overlayWidth;
                Canvas.SetLeft(ImageBorder, topLeft.X);
                Canvas.SetTop(ImageBorder, y);
            }
        }

        private void ToggleImagePanel(NodeViewModel node)
        {
            if (_imagePanelNode == node && node.IsImageExpanded)
                CloseImagePanel();
            else
                OpenImagePanel(node);
        }

        private void OpenImagePanel(NodeViewModel node, bool keepReflowOnClose = false)
        {
            if (_editingNode != null)
                CancelEdit();

            if (!node.HasImage)
            {
                PickImageForNode(node);
                return;
            }

            if (_imagePanelNode != null && _imagePanelNode != node)
                CloseImagePanel();

            _vm!.SelectedNode = node;
            _imagePanelNode = node;
            node.IsImageExpanded = true;

            NodeImageDisplay.Source = NodeImageHelper.CreateBitmap(node.ImageData);
            ImageBorder.Visibility = Visibility.Visible;
            UpdateOverlayHitTest();
            UpdateImageBadge(node);
            AfterOverlayOpened(node, keepReflowOnClose);
        }

        private void CloseImagePanel()
        {
            if (_imagePanelNode == null) return;

            var node = _imagePanelNode;
            node.IsImageExpanded = false;
            _imagePanelNode = null;

            ImageBorder.Visibility = Visibility.Collapsed;
            NodeImageDisplay.Source = null;
            UpdateOverlayHitTest();
            RestoreExpandReflowSnapshot();

            if (node.HasImage)
                UpdateImageBadge(node);

            if (_notePanelNode == node)
                PositionNodeOverlays(node);
        }

        private void PickImageForNode(NodeViewModel node)
        {
            var dlg = new OpenFileDialog
            {
                Title = "노드에 넣을 그림 선택",
                Filter = "이미지|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp|모든 파일|*.*"
            };

            if (dlg.ShowDialog() != true)
                return;

            if (!NodeImageHelper.TryReadImageFile(dlg.FileName, out var base64, out var mime, out var error))
            {
                MessageBox.Show(error, "그림을 불러올 수 없습니다", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            bool hadImage = node.HasImage;
            node.ImageData = base64;
            node.ImageMime = mime;
            _vm!.SelectedNode = node;

            if (!hadImage)
                ReplaceNodeVisual(node);
            else
                UpdateImageBadge(node);

            RelayoutAfterAttachmentChange(node);
            OpenImagePanel(node, keepReflowOnClose: true);
        }

        public void RemoveImageFromNode(NodeViewModel node)
        {
            if (!node.HasImage) return;

            if (_imagePanelNode == node)
                CloseImagePanel();

            node.ImageData = string.Empty;
            node.ImageMime = string.Empty;
            node.IsImageExpanded = false;
            ReplaceNodeVisual(node);
            RelayoutAfterAttachmentChange(node);
        }

        private void UpdateImageBadge(NodeViewModel node)
        {
            if (!_nodeElements.TryGetValue(node.Model.Id, out var wrapper) || wrapper is not Grid grid)
                return;

            Border? badge = null;
            foreach (var child in grid.Children)
            {
                if (child is Border b && Equals(b.Tag, "ImageBadge"))
                {
                    badge = b;
                    break;
                }
            }

            if (!node.HasImage)
            {
                if (badge != null)
                    grid.Children.Remove(badge);
                return;
            }

            if (badge == null)
            {
                grid.Children.Add(CreateImageBadge(node));
                return;
            }

            badge.ToolTip = node.IsImageExpanded ? "그림 접기" : "그림 펼치기";
            if (badge.Child is TextBlock tb)
                tb.Text = node.IsImageExpanded ? "−" : "+";
        }

        private void UpdateNoteBadge(NodeViewModel node)
        {
            if (!_nodeElements.TryGetValue(node.Model.Id, out var wrapper) || wrapper is not Grid grid)
                return;

            Border? badge = null;
            foreach (var child in grid.Children)
            {
                if (child is Border b && Equals(b.Tag, "NoteBadge"))
                {
                    badge = b;
                    break;
                }
            }

            if (!node.HasNote)
            {
                if (badge != null)
                    grid.Children.Remove(badge);
                return;
            }

            if (badge == null)
            {
                grid.Children.Add(CreateNoteBadge(node));
                return;
            }

            badge.ToolTip = node.IsNoteExpanded ? "노트 접기" : "노트 펼치기";
            if (badge.Child is TextBlock tb)
                tb.Text = node.IsNoteExpanded ? "−" : "+";
        }

        private void UpdateOverlayHitTest()
        {
            EditOverlay.IsHitTestVisible =
                EditBorder.Visibility == Visibility.Visible ||
                NoteBorder.Visibility == Visibility.Visible ||
                ImageBorder.Visibility == Visibility.Visible;
        }

        private void ImageChangeButton_Click(object sender, RoutedEventArgs e)
        {
            if (_imagePanelNode != null)
                PickImageForNode(_imagePanelNode);
        }

        private void ImageRemoveButton_Click(object sender, RoutedEventArgs e)
        {
            if (_imagePanelNode != null)
                RemoveImageFromNode(_imagePanelNode);
        }

        private void ImageCloseButton_Click(object sender, RoutedEventArgs e) => CloseImagePanel();

        private void NoteBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                CloseNotePanel();
                e.Handled = true;
            }
            else if (e.Key == Key.Enter && Keyboard.Modifiers == ModifierKeys.Control)
            {
                CloseNotePanel();
                e.Handled = true;
            }
        }

        private void NoteBox_LostFocus(object sender, RoutedEventArgs e)
        {
            Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Background, () =>
            {
                if (NoteBorder.Visibility != Visibility.Visible)
                    return;
                if (NoteBox.IsKeyboardFocusWithin)
                    return;
                if (Keyboard.FocusedElement is DependencyObject focused &&
                    IsDescendantOf(focused, NoteBorder))
                    return;
                CloseNotePanel();
            });
        }

        private static bool IsDescendantOf(DependencyObject? child, DependencyObject parent)
        {
            while (child != null)
            {
                if (child == parent) return true;
                child = VisualTreeHelper.GetParent(child);
            }
            return false;
        }

        private static Border? GetNodeOutline(FrameworkElement? root)
        {
            root = NodeShapeHelper.GetNodeVisualRoot(root);
            return root is Grid { Children.Count: > 0 } g ? g.Children[^1] as Border : null;
        }

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
                ApplyConnectionVisual(pathToParent, node.Parent, node);

            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
            {
                if (_connectionPaths.TryGetValue(child.Model.Id, out var path))
                    ApplyConnectionVisual(path, node, child);
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
                },
                OpenNotePanel,
                OpenImageForNode,
                RemoveImageFromNode);
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

            if (_notePanelNode != null || _imagePanelNode != null)
            {
                var overlayNode = _imagePanelNode ?? _notePanelNode;
                if (overlayNode != null)
                    PositionNodeOverlays(overlayNode);
            }
        }

        private void RefreshAllConnections(NodeViewModel node)
        {
            if (!node.IsExpanded) return;
            foreach (var child in node.Children)
            {
                if (_connectionPaths.TryGetValue(child.Model.Id, out var path))
                    ApplyConnectionVisual(path, node, child);
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

                var (brush, thickness) = NodeBorderHelper.GetBorder(node);

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
            var shape = NodeShapeHelper.GetShapeElement(NodeShapeHelper.GetNodeVisualRoot(root));
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
            CloseNotePanel();
            CloseImagePanel();
            _editingNode = vm;
            _editingNodeVisual = border;
            border.Opacity = 0;

            EditBox.Text = vm.Text;
            EditBox.FontSize = vm.Level == 0 ? 16 : 13;
            PositionEditOverlay(border);

            EditBorder.Visibility = Visibility.Visible;
            UpdateOverlayHitTest();
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
            UpdateOverlayHitTest();
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
                CloseNotePanel();
                CloseImagePanel();
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
                double bottom = GetNodeExtentBottom(node);
                if (bottom > maxY) maxY = bottom;
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
            if (_vm == null || EditBorder.Visibility == Visibility.Visible ||
                NoteBorder.Visibility == Visibility.Visible) return;

            if (ImageBorder.Visibility == Visibility.Visible)
            {
                if (e.Key == Key.Escape)
                {
                    CloseImagePanel();
                    e.Handled = true;
                }
                return;
            }

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
                case Key.F3 when _vm.SelectedNode != null:
                    OpenNotePanel(_vm.SelectedNode);
                    e.Handled = true; break;
                case Key.F4 when _vm.SelectedNode != null:
                    OpenImageForNode(_vm.SelectedNode);
                    e.Handled = true; break;
            }
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
