using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    public partial class MindMapCanvasControl : UserControl
    {
        // ── Branch color palette (light, dark) ───────────────────────────────

        private static readonly (Color light, Color dark)[] BranchColors =
        [
            (Color.FromRgb(0x74, 0xB9, 0xFF), Color.FromRgb(0x00, 0x84, 0xD6)), // Blue
            (Color.FromRgb(0x55, 0xEF, 0xCB), Color.FromRgb(0x00, 0xB8, 0x94)), // Teal
            (Color.FromRgb(0xFF, 0x7F, 0xB5), Color.FromRgb(0xE8, 0x40, 0x83)), // Pink
            (Color.FromRgb(0xFF, 0xD3, 0x6E), Color.FromRgb(0xE6, 0x9B, 0x00)), // Amber
            (Color.FromRgb(0xA2, 0x9B, 0xFE), Color.FromRgb(0x68, 0x5A, 0xE6)), // Purple
            (Color.FromRgb(0x81, 0xEC, 0xEC), Color.FromRgb(0x00, 0xCE, 0xCE)), // Cyan
            (Color.FromRgb(0xFD, 0xA7, 0xDF), Color.FromRgb(0xE8, 0x4E, 0xCF)), // Magenta
            (Color.FromRgb(0xFE, 0xB0, 0x8F), Color.FromRgb(0xE8, 0x74, 0x43)), // Orange
        ];

        private static readonly Color RootLight = Color.FromRgb(0xB2, 0xBE, 0xFF);
        private static readonly Color RootDark  = Color.FromRgb(0x66, 0x7E, 0xEA);

        // ── Node visual cache ─────────────────────────────────────────────────

        private readonly Dictionary<Guid, Border> _nodeElements = [];
        private readonly Dictionary<Guid, Path>   _connectionPaths = [];
        private MainViewModel? _vm;

        // ── Pan/Zoom state ────────────────────────────────────────────────────

        private bool _isPanning;
        private Point _panStart;
        private double _panStartX, _panStartY;

        // ── Edit state ────────────────────────────────────────────────────────

        private NodeViewModel? _editingNode;

        // ── Constants ────────────────────────────────────────────────────────

        private const double NodeMinWidth   = 90;
        private const double NodeHeight     = 36;
        private const double HNodeSpacingX  = 200;
        private const double HNodeSpacingY  = 54;
        private const double RadialRadius0  = 200;
        private const double RadialRadiusDelta = 170;

        // ── Constructor ───────────────────────────────────────────────────────

        public MindMapCanvasControl()
        {
            InitializeComponent();
            SizeChanged += (_, _) => CenterView();
        }

        // ── ViewModel binding ─────────────────────────────────────────────────

        public void SetViewModel(MainViewModel vm)
        {
            if (_vm != null)
            {
                _vm.RequestLayout -= OnRequestLayout;
                _vm.RequestReset  -= OnRequestReset;
                _vm.PropertyChanged -= Vm_PropertyChanged;
            }
            _vm = vm;
            _vm.RequestLayout   += OnRequestLayout;
            _vm.RequestReset    += OnRequestReset;
            _vm.PropertyChanged += Vm_PropertyChanged;

            RebuildCanvas();
        }

        private void Vm_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(MainViewModel.ZoomLevel))
            {
                double z = _vm!.ZoomLevel;
                ScaleXform.ScaleX = z;
                ScaleXform.ScaleY = z;
                ZoomLabel.Text = $"{z:P0}";
            }
            else if (e.PropertyName == nameof(MainViewModel.SelectedNode))
            {
                RefreshSelectionVisuals();
            }
        }

        private void OnRequestLayout(object? sender, EventArgs e) => RebuildCanvas();
        private void OnRequestReset(object? sender, EventArgs e)  { RebuildCanvas(); FitToView(); }

        // ── Full rebuild ──────────────────────────────────────────────────────

        private void RebuildCanvas()
        {
            if (_vm?.RootNode == null) return;

            // Measure all nodes
            foreach (var node in _vm.GetAllNodes())
                node.Width = MeasureTextWidth(node.Text, node.Level == 0 ? 16 : 13) + 28;

            // Run layout
            if (_vm.LayoutType == LayoutType.HorizontalTree)
                LayoutHorizontal(_vm.RootNode, 0, 0, out _);
            else
                LayoutRadial(_vm.RootNode, 0, 0, -Math.PI, Math.PI, RadialRadius0);

            // Rebuild all visuals
            NodeCanvas.Children.Clear();
            ConnectionCanvas.Children.Clear();
            _nodeElements.Clear();
            _connectionPaths.Clear();

            DrawConnections(_vm.RootNode);
            DrawNodes(_vm.RootNode);

            // Re-center after layout (only when we have real dimensions)
            if (ActualWidth > 0 && ActualHeight > 0)
                CenterView();
        }

        // ── Layout: Horizontal Tree ───────────────────────────────────────────

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

            // Center parent in its subtree
            double firstChildCY = node.Children[0].Y + NodeHeight / 2;
            double lastChildCY  = node.Children[^1].Y + NodeHeight / 2;
            node.X = x;
            node.Y = (firstChildCY + lastChildCY) / 2 - NodeHeight / 2;
            subtreeHeight = totalH;
            return totalH;
        }

        // ── Layout: Radial ────────────────────────────────────────────────────

        private void LayoutRadial(NodeViewModel node, double cx, double cy,
                                   double startAngle, double endAngle, double radius)
        {
            node.X = cx - node.Width / 2;
            node.Y = cy - NodeHeight / 2;

            if (!node.IsExpanded || node.Children.Count == 0) return;

            int leafCount = CountLeaves(node);
            double angleStep = (endAngle - startAngle) / Math.Max(leafCount, 1);
            double currentAngle = startAngle;

            foreach (var child in node.Children)
            {
                int childLeaves = CountLeaves(child);
                double childAngleSpan = angleStep * childLeaves;
                double childMidAngle = currentAngle + childAngleSpan / 2;

                double childCX = cx + Math.Cos(childMidAngle) * radius;
                double childCY = cy + Math.Sin(childMidAngle) * radius;

                LayoutRadial(child, childCX, childCY,
                    childMidAngle - childAngleSpan / 2,
                    childMidAngle + childAngleSpan / 2,
                    radius + RadialRadiusDelta * 0.8);

                currentAngle += childAngleSpan;
            }
        }

        private static int CountLeaves(NodeViewModel node)
        {
            if (!node.IsExpanded || node.Children.Count == 0) return 1;
            return node.Children.Sum(CountLeaves);
        }

        // ── Draw Connections ──────────────────────────────────────────────────

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

            var path = new Path
            {
                Stroke = brush,
                StrokeThickness = strokeWidth,
                StrokeLineJoin  = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                Data = BuildConnectionGeometry(parent, child)
            };

            return path;
        }

        private Geometry BuildConnectionGeometry(NodeViewModel parent, NodeViewModel child)
        {
            Point start, end, cp1, cp2;

            if (_vm!.LayoutType == LayoutType.HorizontalTree)
            {
                start = new Point(parent.X + parent.Width, parent.Y + NodeHeight / 2);
                end   = new Point(child.X,                  child.Y  + NodeHeight / 2);
                double midX = (start.X + end.X) / 2;
                cp1 = new Point(midX, start.Y);
                cp2 = new Point(midX, end.Y);
            }
            else
            {
                start = new Point(parent.X + parent.Width / 2, parent.Y + NodeHeight / 2);
                end   = new Point(child.X  + child.Width  / 2, child.Y  + NodeHeight / 2);
                cp1   = new Point((start.X * 2 + end.X) / 3, (start.Y * 2 + end.Y) / 3);
                cp2   = new Point((start.X + end.X * 2) / 3, (start.Y + end.Y * 2) / 3);
            }

            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new BezierSegment(cp1, cp2, end, isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        // ── Draw Nodes ────────────────────────────────────────────────────────

        private void DrawNodes(NodeViewModel node)
        {
            var border = CreateNodeElement(node);
            _nodeElements[node.Model.Id] = border;

            Canvas.SetLeft(border, node.X);
            Canvas.SetTop(border, node.Y);
            NodeCanvas.Children.Add(border);

            if (node.IsExpanded)
                foreach (var child in node.Children)
                    DrawNodes(child);
        }

        private Border CreateNodeElement(NodeViewModel node)
        {
            var (lightColor, darkColor) = node.Level == 0
                ? (RootLight, RootDark)
                : GetBranchColors(node.BranchColorIndex);

            double fontSize   = node.Level == 0 ? 16 : 13;
            double cornerRadius = node.Level == 0 ? 18 : 12;

            // Gradient background
            var gradient = new LinearGradientBrush(
                Color.FromRgb((byte)(darkColor.R + 20), (byte)(darkColor.G + 20), (byte)(darkColor.B + 40)),
                darkColor,
                new Point(0, 0), new Point(1, 1));

            // Drop shadow
            var shadow = new DropShadowEffect
            {
                Color       = Color.FromArgb(120, 0, 0, 0),
                BlurRadius  = 12,
                ShadowDepth = 4,
                Direction   = 270
            };

            var text = new TextBlock
            {
                Text              = node.Text,
                FontFamily        = new FontFamily("Segoe UI"),
                FontSize          = fontSize,
                FontWeight        = node.Level == 0 ? FontWeights.Bold : FontWeights.SemiBold,
                Foreground        = new SolidColorBrush(Colors.White),
                VerticalAlignment = VerticalAlignment.Center,
                TextTrimming      = TextTrimming.CharacterEllipsis,
                MaxWidth          = 200
            };

            var border = new Border
            {
                Width         = node.Width,
                Height        = NodeHeight,
                CornerRadius  = new CornerRadius(cornerRadius),
                Background    = gradient,
                BorderBrush   = new SolidColorBrush(lightColor),
                BorderThickness = node.IsSelected
                    ? new Thickness(2.5)
                    : new Thickness(1),
                Effect        = shadow,
                Padding       = new Thickness(10, 0, 10, 0),
                Child         = text,
                Tag           = node,
                Cursor        = Cursors.Hand
            };

            // Mouse events
            border.MouseLeftButtonDown += Node_MouseLeftButtonDown;
            border.MouseLeftButtonUp   += Node_MouseLeftButtonUp;
            border.MouseEnter          += Node_MouseEnter;
            border.MouseLeave          += Node_MouseLeave;

            // Animate entrance
            var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(250))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
            };
            border.BeginAnimation(OpacityProperty, fadeIn);

            return border;
        }

        // ── Node Mouse Events ─────────────────────────────────────────────────

        private DateTime _lastClickTime = DateTime.MinValue;
        private NodeViewModel? _lastClickedNode;

        private void Node_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is not Border border || border.Tag is not NodeViewModel vm) return;
            e.Handled = true;

            var now = DateTime.Now;
            bool isDoubleClick = (now - _lastClickTime).TotalMilliseconds < 400 && _lastClickedNode == vm;
            _lastClickTime = now;
            _lastClickedNode = vm;

            if (isDoubleClick)
            {
                StartEditing(vm, border);
            }
            else
            {
                _vm!.SelectedNode = vm;
                RefreshSelectionVisuals();
            }
        }

        private void Node_MouseLeftButtonUp(object sender, MouseButtonEventArgs e) => e.Handled = true;

        private void Node_MouseEnter(object sender, MouseEventArgs e)
        {
            if (sender is not Border border) return;
            var scale = new ScaleTransform(1.06, 1.06,
                border.Width / 2, border.Height / 2);
            border.RenderTransform = scale;
            border.RenderTransformOrigin = new Point(0.5, 0.5);
            Panel.SetZIndex(border, 10);
        }

        private void Node_MouseLeave(object sender, MouseEventArgs e)
        {
            if (sender is not Border border) return;
            border.RenderTransform = null;
            Panel.SetZIndex(border, 0);
        }

        private void RefreshSelectionVisuals()
        {
            if (_vm == null) return;
            foreach (var (id, border) in _nodeElements)
            {
                var node = FindNode(id);
                if (node == null) continue;
                border.BorderThickness = node.IsSelected ? new Thickness(2.5) : new Thickness(1);

                var (lightColor, _) = node.Level == 0
                    ? (RootLight, RootDark)
                    : GetBranchColors(node.BranchColorIndex);

                border.BorderBrush = node.IsSelected
                    ? new SolidColorBrush(Colors.White)
                    : new SolidColorBrush(lightColor);
            }
        }

        // ── Inline Edit ───────────────────────────────────────────────────────

        private void StartEditing(NodeViewModel vm, Border border)
        {
            _editingNode = vm;

            // Convert node position to UserControl coordinates
            var nodePos = border.TranslatePoint(new Point(0, 0), this);

            EditBox.Text  = vm.Text;
            EditBox.Width = Math.Max(vm.Width, 120);
            EditBox.Height = NodeHeight;
            EditBox.FontSize = vm.Level == 0 ? 16 : 13;

            Canvas.SetLeft(EditBorder, 0);
            Canvas.SetTop(EditBorder, 0);
            EditBox.Margin = new Thickness(nodePos.X, nodePos.Y, 0, 0);

            EditBorder.Visibility = Visibility.Visible;
            EditBox.SelectAll();
            EditBox.Focus();
        }

        private void CommitEdit()
        {
            if (_editingNode == null) return;
            string newText = EditBox.Text.Trim();
            if (!string.IsNullOrEmpty(newText))
            {
                _editingNode.Text = newText;
                RebuildCanvas();
                CenterViewOnSelected();
            }
            _editingNode = null;
            EditBorder.Visibility = Visibility.Collapsed;
        }

        private void CancelEdit()
        {
            _editingNode = null;
            EditBorder.Visibility = Visibility.Collapsed;
        }

        private void EditBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)  { CommitEdit(); e.Handled = true; }
            if (e.Key == Key.Escape) { CancelEdit(); e.Handled = true; }
        }

        private void EditBox_LostFocus(object sender, RoutedEventArgs e) => CommitEdit();

        // ── Canvas Pan / Zoom ─────────────────────────────────────────────────

        private void RootCanvas_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Middle ||
               (e.ChangedButton == MouseButton.Left && e.OriginalSource == RootCanvas))
            {
                _isPanning = true;
                _panStart = e.GetPosition(this);
                _panStartX = TranslateXform.X;
                _panStartY = TranslateXform.Y;
                RootCanvas.CaptureMouse();
                e.Handled = true;
            }
        }

        private void RootCanvas_MouseMove(object sender, MouseEventArgs e)
        {
            if (!_isPanning) return;
            var pos = e.GetPosition(this);
            TranslateXform.X = _panStartX + (pos.X - _panStart.X);
            TranslateXform.Y = _panStartY + (pos.Y - _panStart.Y);
        }

        private void RootCanvas_MouseUp(object sender, MouseButtonEventArgs e)
        {
            if (_isPanning)
            {
                _isPanning = false;
                RootCanvas.ReleaseMouseCapture();
            }
        }

        private void RootCanvas_MouseWheel(object sender, MouseWheelEventArgs e)
        {
            // e.GetPosition(this): screen-space coords relative to UserControl origin.
            // RenderTransform does NOT affect GetPosition's layout space, so we must
            // use the screen-space position and apply the inverse transform ourselves.
            var ms = e.GetPosition(this);

            double factor  = e.Delta > 0 ? 1.12 : 1.0 / 1.12;
            double oldZoom = ScaleXform.ScaleX;
            double newZoom = Math.Clamp(oldZoom * factor, 0.15, 4.0);

            // Keep the world-point under the mouse stationary:
            //   screen = world * scale + translate
            //   newTranslate = ms * (1 - ratio) + oldTranslate * ratio   (ratio = newZoom/oldZoom)
            double ratio = newZoom / oldZoom;
            TranslateXform.X = ms.X * (1 - ratio) + TranslateXform.X * ratio;
            TranslateXform.Y = ms.Y * (1 - ratio) + TranslateXform.Y * ratio;

            ScaleXform.ScaleX = newZoom;
            ScaleXform.ScaleY = newZoom;

            if (_vm != null) _vm.ZoomLevel = newZoom;
            ZoomLabel.Text = $"{newZoom:P0}";
            e.Handled = true;
        }

        // ── View centering ────────────────────────────────────────────────────

        /// <summary>Centers the whole map on the canvas keeping the current zoom level.</summary>
        public void CenterView()
        {
            if (_vm?.RootNode == null || ActualWidth == 0 || ActualHeight == 0) return;

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double mapCX = (minX + maxX) / 2;
            double mapCY = (minY + maxY) / 2;
            double zoom  = ScaleXform.ScaleX;

            TranslateXform.X = ActualWidth  / 2 - mapCX * zoom;
            TranslateXform.Y = ActualHeight / 2 - mapCY * zoom;
        }

        /// <summary>Fits all visible nodes into view and centers the map.</summary>
        public void FitToView()
        {
            if (_vm?.RootNode == null || ActualWidth == 0 || ActualHeight == 0) return;

            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            const double padding = 60;
            double mapW = maxX - minX + padding * 2;
            double mapH = maxY - minY + padding * 2;

            double fitZoom = Math.Min(ActualWidth / mapW, ActualHeight / mapH);
            fitZoom = Math.Clamp(fitZoom, 0.15, 2.0);

            ScaleXform.ScaleX = fitZoom;
            ScaleXform.ScaleY = fitZoom;
            if (_vm != null) _vm.ZoomLevel = fitZoom;
            ZoomLabel.Text = $"{fitZoom:P0}";

            double mapCX = (minX + maxX) / 2;
            double mapCY = (minY + maxY) / 2;
            TranslateXform.X = ActualWidth  / 2 - mapCX * fitZoom;
            TranslateXform.Y = ActualHeight / 2 - mapCY * fitZoom;
        }

        private (double minX, double minY, double maxX, double maxY) GetBoundingBox()
        {
            double minX = double.MaxValue, minY = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue;

            foreach (var node in _vm!.RootNode!.GetVisibleDescendants())
            {
                if (node.X < minX) minX = node.X;
                if (node.Y < minY) minY = node.Y;
                if (node.X + node.Width  > maxX) maxX = node.X + node.Width;
                if (node.Y + NodeHeight  > maxY) maxY = node.Y + NodeHeight;
            }
            return (minX, minY, maxX, maxY);
        }

        private void CenterViewOnSelected()
        {
            if (_vm?.SelectedNode == null) return;
            var node = _vm.SelectedNode;
            double cx = node.X + node.Width  / 2;
            double cy = node.Y + node.Height / 2;

            var animX = new DoubleAnimation(
                ActualWidth  / 2 - cx * ScaleXform.ScaleX,
                TimeSpan.FromMilliseconds(350))
            { EasingFunction = new QuarticEase { EasingMode = EasingMode.EaseInOut } };
            var animY = new DoubleAnimation(
                ActualHeight / 2 - cy * ScaleXform.ScaleY,
                TimeSpan.FromMilliseconds(350))
            { EasingFunction = new QuarticEase { EasingMode = EasingMode.EaseInOut } };

            TranslateXform.BeginAnimation(TranslateTransform.XProperty, animX);
            TranslateXform.BeginAnimation(TranslateTransform.YProperty, animY);
        }

        // ── Key shortcuts ─────────────────────────────────────────────────────

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

        // ── Helpers ───────────────────────────────────────────────────────────

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
