using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using Microsoft.Win32;
using MyMindWin.Diagnostics;
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
        private bool _isRubberBanding;
        private Point _rubberBandStart;
        private Rectangle? _rubberBandRect;
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

        private bool _isRebuildingCanvas;
        private bool _suppressExtentSync;
        private bool _layoutRebuildPending;
        private bool _rebuildQueuedDuringRebuild;
        private bool _rebuildDeferredForContextMenu;
        private bool _rebuildQueuedWhilePending;
        private bool _structuralRebuildPending;
        private bool _applyFitAfterRebuild;
        private int _layoutRebuildGeneration;
        private Guid? _pendingContextMenuNodeId;
        private ContextMenu? _activeContextMenu;
        private Path? _fishboneSpinePath;
        private readonly List<Path> _fishboneSubSpinePaths = [];

        /// <summary>캔버스 레이아웃 재구성이 예약되었거나 진행 중입니다.</summary>
        public bool IsCanvasLayoutBusy => _isRebuildingCanvas || _layoutRebuildPending;

        /// <summary>캔버스 자동 레이아웃·재구성이 끝났을 때 발생합니다.</summary>
        public event EventHandler? CanvasLayoutCompleted;

        private const double NodeMinWidth   = 90;
        private const double NodeHeight     = 36;
        private const double HNodeSpacingX  = 44;   // 부모-자식 가로 간격 (연결선 길이)
        private const double HNodeSpacingY  = 14;   // 형제 노드 세로 간격
        private const double RadialLinkGap    = 6;  // 부모·자식 중심 간 최소 간격 (가장자리 기준)
        private const double RadialSiblingGap = 6;  // 같은 링에서 형제 노드 호 간 최소 간격
        private const double FishboneRibStub   = 44; // 척추(spine)에서 1단계 카테고리 노드까지
        private const double FishboneSpineGap  = 24; // 척추를 따라 카테고리 간 간격
        private const double FishboneSpineTail = 48; // 척추 끝에서 루트(머리)까지
        private const double FishbonePackMargin = 12;  // 가지 간 겹침 방지 여백
        private const double FishboneSpineClearance = 16; // 주 척추 Y 주변 노드 금지 반경
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
            if (_vm?.RootNode == null || _isRebuildingCanvas || _suppressExtentSync)
                return;

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
                if (!IsCanvasLayoutBusy)
                    RefreshSelectionVisuals();
            }
        }

        private void CloseActiveContextMenu()
        {
            if (_activeContextMenu == null) return;
            try
            {
                _activeContextMenu.IsOpen = false;
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "컨텍스트 메뉴 닫기");
            }
            finally
            {
                _activeContextMenu = null;
            }
        }

        private void ShowNodeContextMenu(NodeViewModel vm)
        {
            try
            {
                if (_vm == null) return;

                if (IsCanvasLayoutBusy)
                {
                    _pendingContextMenuNodeId = vm.Model.Id;
                    return;
                }

                if (!TryGetLiveNodeVisual(vm, out var border))
                    return;

                _vm.SelectedNode = vm;
                CloseActiveContextMenu();

                var menu = NodeContextMenuHelper.Build(
                    vm,
                    _vm,
                    this,
                    this,
                    node =>
                    {
                        if (_nodeElements.TryGetValue(node.Model.Id, out var el))
                            StartEditing(node, el);
                    },
                    OpenNotePanel,
                    OpenImageForNode,
                    RemoveImageFromNode);

                menu.Closed += OnActiveContextMenuClosed;
                _activeContextMenu = menu;
                menu.PlacementTarget = border;
                menu.Placement = PlacementMode.MousePoint;

                RefreshSelectionVisuals();
                CommandManager.InvalidateRequerySuggested();
                menu.IsOpen = true;
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "캔버스 노드 우클릭 메뉴");
            }
        }

        private void OnActiveContextMenuClosed(object? sender, RoutedEventArgs e)
        {
            try
            {
                if (sender is ContextMenu menu)
                    menu.Closed -= OnActiveContextMenuClosed;

                if (ReferenceEquals(_activeContextMenu, sender))
                    _activeContextMenu = null;

                if (_rebuildDeferredForContextMenu)
                {
                    _rebuildDeferredForContextMenu = false;
                    ScheduleRebuildCanvas();
                }
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "컨텍스트 메뉴 Closed");
            }
        }

        private bool TryGetLiveNodeVisual(NodeViewModel vm, out FrameworkElement border)
        {
            border = null!;
            if (!_nodeElements.TryGetValue(vm.Model.Id, out var element))
                return false;

            if (element.Parent == null || !element.IsLoaded)
                return false;

            border = element;
            return true;
        }

        public void OpenNoteForNode(NodeViewModel node) => OpenNotePanel(node);

        public void OpenImageForNode(NodeViewModel node)
        {
            if (node.HasImage)
                OpenImagePanel(node);
            else
                PickImageForNode(node);
        }

        private void OnRequestLayout(object? sender, EventArgs e)
        {
            CloseActiveContextMenu();
            _structuralRebuildPending = true;
            _layoutRebuildGeneration++;
            _layoutRebuildPending = false;
            RequestCanvasRebuild(preferImmediate: true);
        }

        /// <summary>UI 스레드에서 캔버스 재구성을 한 번만 예약합니다 (재진입·중복 호출 방지).</summary>
        public void ScheduleRebuildCanvas() => RequestCanvasRebuild(preferImmediate: false);

        private void RequestCanvasRebuild(bool preferImmediate)
        {
            if (_vm?.RootNode == null)
                return;

            if (_activeContextMenu?.IsOpen == true)
            {
                _rebuildDeferredForContextMenu = true;
                return;
            }

            if (_isRebuildingCanvas)
            {
                _rebuildQueuedDuringRebuild = true;
                return;
            }

            if (_layoutRebuildPending)
            {
                _rebuildQueuedWhilePending = true;
                return;
            }

            if (preferImmediate && Dispatcher.CheckAccess())
            {
                RunRebuildCanvasOnce();
                return;
            }

            int generation = ++_layoutRebuildGeneration;
            _layoutRebuildPending = true;
            Dispatcher.BeginInvoke(() =>
            {
                if (generation != _layoutRebuildGeneration)
                    return;

                _layoutRebuildPending = false;
                RunRebuildCanvasOnce();
            }, System.Windows.Threading.DispatcherPriority.Normal);
        }

        private void RunRebuildCanvasOnce()
        {
            var rerunImmediate = false;
            var rerunPreferStructural = false;

            try
            {
                RebuildCanvas();
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "캔버스 재구성");
            }
            finally
            {
                if (_rebuildQueuedWhilePending)
                {
                    _rebuildQueuedWhilePending = false;
                    rerunImmediate = true;
                }
                else if (_rebuildQueuedDuringRebuild)
                {
                    _rebuildQueuedDuringRebuild = false;
                    rerunPreferStructural = _structuralRebuildPending;
                }
                else if (_structuralRebuildPending &&
                         !_rebuildQueuedDuringRebuild &&
                         !_rebuildQueuedWhilePending &&
                         !_layoutRebuildPending)
                {
                    _structuralRebuildPending = false;
                }
            }

            if (rerunImmediate)
                RequestCanvasRebuild(preferImmediate: true);
            else if (rerunPreferStructural)
                RequestCanvasRebuild(preferImmediate: _structuralRebuildPending);
        }

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
            _applyFitAfterRebuild = true;
            try
            {
                RebuildCanvas();
                FitToView();
            }
            finally
            {
                _applyFitAfterRebuild = false;
            }
        }

        private void OnRequestFitView(object? sender, EventArgs e) => FitToView();

        private void RebuildCanvas()
        {
            if (_vm?.RootNode == null || _isRebuildingCanvas)
                return;

            _isRebuildingCanvas = true;
            _suppressExtentSync = true;
            try
            {
                CloseActiveContextMenu();
                CloseNotePanel(skipSideEffects: true);
                CloseImagePanel(skipSideEffects: true);

                if (_vm.LayoutType != _lastLayoutType)
                {
                    _userPositioned = false;
                    ClearManualPositionsOnAllNodes();
                    _lastLayoutType = _vm.LayoutType;
                }

                if (_structuralRebuildPending)
                {
                    _userPositioned = false;
                    ClearManualPositionsOnAllNodes();
                }

                PrepareForAutomaticLayout();
                if (!UsesGlobalAutoLayout && !_userPositioned)
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

                ClearCanvasVisuals();

                UpdateContentExtent();

                if (_vm.LayoutType == LayoutType.Fishbone)
                {
                    DrawFishboneSpine(_vm.RootNode);
                    DrawFishboneSubSpines(_vm.RootNode);
                }
                DrawConnections(_vm.RootNode);
                DrawNodes(_vm.RootNode);

                if (ActualWidth > 0 && ActualHeight > 0 && !_isPanning)
                {
                    if (_pendingFitAfterLoad)
                    {
                        FitToView();
                        _pendingFitAfterLoad = false;
                    }
                    else if (!_userPositioned && !_applyFitAfterRebuild)
                        SetViewToDefaultZoom();
                }
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, $"캔버스 재구성 ({_vm?.LayoutType})");
                try { ClearCanvasVisuals(); } catch { /* ignored */ }
            }
            finally
            {
                _suppressExtentSync = false;
                _isRebuildingCanvas = false;

                if (_pendingContextMenuNodeId is Guid pendingId)
                {
                    _pendingContextMenuNodeId = null;
                    var pendingNode = FindNode(pendingId);
                    if (pendingNode != null)
                    {
                        Dispatcher.BeginInvoke(
                            () => ShowNodeContextMenu(pendingNode),
                            System.Windows.Threading.DispatcherPriority.ApplicationIdle);
                    }
                }

                CanvasLayoutCompleted?.Invoke(this, EventArgs.Empty);
            }
        }

        private void ClearCanvasVisuals()
        {
            NodeCanvas.Children.Clear();
            ConnectionCanvas.Children.Clear();
            _nodeElements.Clear();
            _connectionPaths.Clear();
            _fishboneSpinePath = null;
            _fishboneSubSpinePaths.Clear();
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
            node.Y = index > 0
                ? parent.Children[index - 1].Y + NodeHeight + HNodeSpacingY
                : parent.Y;
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

            PlaceFishboneChildrenOnSpine(root, spineY, spineLeft, layoutRibContents: true);
            root.Y = spineY - NodeHeight / 2;
            AlignFishboneDiagram(root, spineY);
        }

        /// <summary>피쉬본 전체를 여백·척추 기준으로 정렬합니다.</summary>
        private void AlignFishboneDiagram(NodeViewModel root, double spineY)
        {
            var (minX, minY, maxX, maxY) = GetBoundingBox();
            if (minX == double.MaxValue) return;

            double dx = ContentPadding - minX;
            if (dx > 0.5)
                ShiftSubtree(root, dx, 0);

            (minX, minY, maxX, maxY) = GetBoundingBox();
            double upperSpace = spineY - minY;
            double lowerSpace = maxY - spineY;
            double dy = (lowerSpace - upperSpace) / 2;
            if (Math.Abs(dy) > 0.5)
                ShiftSubtree(root, 0, dy);
        }

        /// <summary>가지(카테고리) 노드와 그 하위를 재귀적으로 fishbone 형태로 배치합니다.</summary>
        private void LayoutFishboneRibContents(NodeViewModel node)
        {
            if (!node.IsExpanded || node.Children.Count == 0)
            {
                node.X = 0;
                node.Y = 0;
                return;
            }

            foreach (var child in node.Children)
                LayoutFishboneRibContents(child);

            PlaceFishboneChildrenOnSpine(node, spineY: 0, mainSpineLeft: null, layoutRibContents: false);
        }

        /// <summary>
        /// head의 직계 자식을 척추(sub-spine)에 fishbone 형태로 배치합니다.
        /// 메인·하위 모든 depth에서 동일한 규칙(위/아래 교대, rib stub, spine gap/tail)을 사용합니다.
        /// </summary>
        /// <param name="mainSpineLeft">루트 척추 X. null이면 하위 가지(로컬 좌표).</param>
        /// <param name="layoutRibContents">true면 각 자식 가지 내부 fishbone을 먼저 구성 (루트 1단계).</param>
        private void PlaceFishboneChildrenOnSpine(
            NodeViewModel head,
            double spineY,
            double? mainSpineLeft,
            bool layoutRibContents)
        {
            if (!head.IsExpanded || head.Children.Count == 0)
            {
                head.X = mainSpineLeft ?? 0;
                head.Y = spineY - NodeHeight / 2;
                return;
            }

            // 상하 가지는 서로 겹칠 수 없으므로(척추를 기준으로 반대편), 방향별로 별도 관리합니다.
            var upperBounds = new List<(double minX, double minY, double maxX, double maxY)>();
            var lowerBounds = new List<(double minX, double minY, double maxX, double maxY)>();
            bool isMainSpine = mainSpineLeft.HasValue;

            // 하위 가지: head(카테고리)는 부모 척추 부착점에 고정, sub-spine만 왼쪽으로 뻗음
            if (!isMainSpine)
            {
                head.X = -head.Width;
                head.Y = spineY - NodeHeight / 2;
            }

            // 위/아래 가지를 각자 독립된 척추 커서로 추적합니다.
            // 동일 spineAttach에 상하 한 쌍을 배치할 수 있어 균형잡힌 어골 형태가 됩니다.
            double spineEndUpper = 0;
            double spineEndLower = 0;

            for (int i = 0; i < head.Children.Count; i++)
            {
                var child = head.Children[i];
                bool upper = i % 2 == 0;
                child.FishboneRibUpper = upper;

                if (layoutRibContents)
                    LayoutFishboneRibContents(child);
                AlignFishboneRibForSpinePlacement(child, upper);

                double attachRight = child.X + child.Width;
                double spineAttach = upper ? spineEndUpper : spineEndLower;
                var myBounds = upper ? upperBounds : lowerBounds;

                const int maxAttempts = 120;
                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    double spineX = isMainSpine
                        ? mainSpineLeft!.Value + spineAttach
                        : head.X - spineAttach;
                    double dx = spineX - attachRight;

                    // dyWorld = spineY 는 AlignFishboneRibForSpinePlacement 가 이미 로컬에서
                    // 서브트리 범위를 반영한 stub 을 적용했으므로, 척추 Y를 더하는 것으로 충분합니다.
                    var (wMinX, wMinY, wMaxX, wMaxY) = GetFishboneRibPackBounds(child, dx, spineY);

                    // 같은 방향(상↔상, 하↔하)끼리만 겹침 검사합니다. 반대편은 척추 덕분에 항상 분리됩니다.
                    bool overlaps = BoundsOverlapAny(myBounds, wMinX, wMinY, wMaxX, wMaxY);
                    if (!overlaps || attempt == maxAttempts - 1)
                    {
                        ShiftSubtree(child, dx, spineY);
                        myBounds.Add(GetFishboneRibPackBounds(child, 0, 0));
                        if (upper) spineEndUpper = spineAttach + FishboneSpineGap;
                        else       spineEndLower = spineAttach + FishboneSpineGap;
                        break;
                    }

                    spineAttach += 16;
                }
            }

            PackFishboneRibSiblings(head, spineY);

            double spineEnd = Math.Max(spineEndUpper, spineEndLower);

            if (isMainSpine)
            {
                head.X = mainSpineLeft!.Value + spineEnd + FishboneSpineTail;
                head.Y = spineY - NodeHeight / 2;
            }
        }

        /// <summary>가지 패킹용 경계 — 펼친 손자 서브트리 전체를 포함해 겹침을 방지합니다.</summary>
        private (double minX, double minY, double maxX, double maxY) GetFishboneRibPackBounds(
            NodeViewModel ribRoot, double dx, double dy)
        {
            var (minX, minY, maxX, maxY) = GetSubtreeBounds(ribRoot);
            return (minX + dx, minY + dy, maxX + dx, maxY + dy);
        }

        /// <summary>같은 척추의 형제 가지끼리 서브트리 겹침을 세로로 분리합니다.</summary>
        private void PackFishboneRibSiblings(NodeViewModel head, double spineY)
        {
            if (head.Children.Count < 2) return;

            var uppers = new List<NodeViewModel>();
            var lowers = new List<NodeViewModel>();
            for (int i = 0; i < head.Children.Count; i++)
            {
                if (i % 2 == 0) uppers.Add(head.Children[i]);
                else lowers.Add(head.Children[i]);
            }

            // 위쪽 가지: 척추에 가까운 순 → 바깥쪽으로 쌓기
            uppers.Sort((a, b) => GetSubtreeBounds(b).maxY.CompareTo(GetSubtreeBounds(a).maxY));
            for (int k = 1; k < uppers.Count; k++)
            {
                var prev = uppers[k - 1];
                var curr = uppers[k];
                var (_, pMinY, _, _) = GetSubtreeBounds(prev);
                var (_, cMinY, _, cMaxY) = GetSubtreeBounds(curr);
                double limit = pMinY - FishbonePackMargin;
                if (cMaxY > limit)
                    ShiftSubtree(curr, 0, limit - cMaxY);
            }

            // 아래쪽 가지: 척추에 가까운 순 → 바깥쪽으로 쌓기
            lowers.Sort((a, b) => GetSubtreeBounds(a).minY.CompareTo(GetSubtreeBounds(b).minY));
            for (int k = 1; k < lowers.Count; k++)
            {
                var prev = lowers[k - 1];
                var curr = lowers[k];
                var (_, _, _, pMaxY) = GetSubtreeBounds(prev);
                var (_, cMinY, _, _) = GetSubtreeBounds(curr);
                double limit = pMaxY + FishbonePackMargin;
                if (cMinY < limit)
                    ShiftSubtree(curr, 0, limit - cMinY);
            }

            // 위·아래 가지 교차 겹침 및 잔여 겹침 분리
            const int maxIterations = 24;
            for (int iter = 0; iter < maxIterations; iter++)
            {
                bool moved = false;
                for (int i = 0; i < head.Children.Count; i++)
                {
                    for (int j = i + 1; j < head.Children.Count; j++)
                    {
                        if (PushApartFishboneSubtrees(head.Children[i], head.Children[j], i, j))
                            moved = true;
                    }
                }

                if (!moved) break;
            }

            foreach (var child in head.Children)
            {
                bool upper = head.Children.IndexOf(child) % 2 == 0;
                EnsureRibClearOfMainSpine(child, upper, spineY, FishboneSpineClearance);
            }
        }

        private bool PushApartFishboneSubtrees(NodeViewModel a, NodeViewModel b, int indexA, int indexB)
        {
            var (aMinX, aMinY, aMaxX, aMaxY) = GetSubtreeBounds(a);
            var (bMinX, bMinY, bMaxX, bMaxY) = GetSubtreeBounds(b);
            double m = FishbonePackMargin;
            if (aMinX - m >= bMaxX + m || bMinX - m >= aMaxX + m ||
                aMinY - m >= bMaxY + m || bMinY - m >= aMaxY + m)
                return false;

            bool aUpper = indexA % 2 == 0;
            bool bUpper = indexB % 2 == 0;

            if (aUpper && bUpper)
            {
                // 더 바깥(위) 가지를 위로
                var outer = indexA < indexB ? b : a;
                var inner = indexA < indexB ? a : b;
                var (_, iMinY, _, _) = GetSubtreeBounds(inner);
                var (_, _, _, oMaxY) = GetSubtreeBounds(outer);
                if (oMaxY > iMinY - m)
                {
                    ShiftSubtree(outer, 0, iMinY - m - oMaxY);
                    return true;
                }
            }
            else if (!aUpper && !bUpper)
            {
                var outer = indexA < indexB ? b : a;
                var inner = indexA < indexB ? a : b;
                var (_, _, _, iMaxY) = GetSubtreeBounds(inner);
                var (_, oMinY, _, _) = GetSubtreeBounds(outer);
                if (oMinY < iMaxY + m)
                {
                    ShiftSubtree(outer, 0, iMaxY + m - oMinY);
                    return true;
                }
            }
            else
            {
                var upperNode = aUpper ? a : b;
                var lowerNode = aUpper ? b : a;
                var (_, uMinY, _, uMaxY) = GetSubtreeBounds(upperNode);
                var (_, lMinY, _, lMaxY) = GetSubtreeBounds(lowerNode);
                if (uMaxY <= lMinY - m) return false;

                double overlap = uMaxY - (lMinY - m);
                ShiftSubtree(upperNode, 0, -overlap * 0.55);
                ShiftSubtree(lowerNode, 0, overlap * 0.45);
                return true;
            }

            return false;
        }

        /// <summary>가지 부착점(카테고리 노드 오른쪽)과 위/아래 방향을 척추 부착에 맞게 정렬합니다.</summary>
        private void AlignFishboneRibForSpinePlacement(NodeViewModel ribRoot, bool upper)
        {
            double attachRight = ribRoot.X + ribRoot.Width;
            if (Math.Abs(attachRight) > 0.01)
                ShiftSubtree(ribRoot, -attachRight, 0);

            // stub 계산: max(Width/2, 서브트리가 척추 쪽으로 뻗은 최대 범위 + clearance)
            // 서브트리 범위를 반영하면 손자 노드가 척추선과 겹치지 않습니다.
            double stub;
            if (upper)
            {
                // maxY = 서브트리에서 가장 아래(척추 방향)까지 내려온 바닥 Y (로컬 좌표)
                var (_, _, _, maxY) = GetSubtreeBoundsStatic(ribRoot);
                stub = Math.Max(ribRoot.Width / 2, maxY - NodeHeight / 2 + FishboneSpineClearance);
            }
            else
            {
                // minY = 서브트리에서 가장 위(척추 방향)까지 올라온 꼭대기 Y (로컬 좌표)
                var (_, minY, _, _) = GetSubtreeBoundsStatic(ribRoot);
                stub = Math.Max(ribRoot.Width / 2, -minY - NodeHeight / 2 + FishboneSpineClearance);
            }

            double dyLocal = upper
                ? -(ribRoot.Y + NodeHeight) - stub
                : -ribRoot.Y + stub;
            ShiftSubtree(ribRoot, 0, dyLocal);
        }

        /// <summary>가지 전체가 주 척추선과 겹치지 않도록 한쪽으로 밀어냅니다.</summary>
        private static void EnsureRibClearOfMainSpine(
            NodeViewModel ribRoot, bool upper, double spineY, double clearance)
        {
            var (_, minY, _, maxY) = GetSubtreeBoundsStatic(ribRoot);
            if (upper)
            {
                double limit = spineY - clearance;
                if (maxY > limit)
                    ShiftSubtree(ribRoot, 0, limit - maxY);
            }
            else
            {
                double limit = spineY + clearance;
                if (minY < limit)
                    ShiftSubtree(ribRoot, 0, limit - minY);
            }
        }

        private static bool RibViolatesMainSpineClearance(
            double minY, double maxY, double spineY, double clearance, bool upper)
        {
            if (upper)
                return maxY > spineY - clearance;
            return minY < spineY + clearance;
        }

        private static (double minX, double minY, double maxX, double maxY) GetSubtreeBoundsStatic(NodeViewModel node)
        {
            // Instance method wrapper for use in static helpers during layout (no overlay state).
            double minX = node.X;
            double minY = node.Y;
            double maxX = node.X + node.Width;
            double maxY = node.Y + NodeHeight;

            if (!node.IsExpanded)
                return (minX, minY, maxX, maxY);

            foreach (var child in node.Children)
            {
                var (cMinX, cMinY, cMaxX, cMaxY) = GetSubtreeBoundsStatic(child);
                minX = Math.Min(minX, cMinX);
                minY = Math.Min(minY, cMinY);
                maxX = Math.Max(maxX, cMaxX);
                maxY = Math.Max(maxY, cMaxY);
            }

            return (minX, minY, maxX, maxY);
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
            if (children.Count == 0)
                return GetNodeBoundRadius(parent) + RadialLinkGap;

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

            ApplyScrollExtentSize();
        }

        /// <summary>줌·콘텐츠 크기 변경 후 ScrollViewer의 Extent(스크롤 범위)를 다시 계산합니다.</summary>
        private void ApplyScrollExtentSize()
        {
            if (ScrollExtentHost == null)
                return;

            ScrollExtentHost.InvalidateMeasure();
            CanvasScroller.InvalidateMeasure();
            CanvasScroller.UpdateLayout();
        }

        private void ScrollToClamped(double offsetX, double offsetY, bool refreshExtent = true)
        {
            if (refreshExtent)
                ApplyScrollExtentSize();

            double maxX = Math.Max(0, CanvasScroller.ExtentWidth - CanvasScroller.ViewportWidth);
            double maxY = Math.Max(0, CanvasScroller.ExtentHeight - CanvasScroller.ViewportHeight);
            CanvasScroller.ScrollToHorizontalOffset(Math.Clamp(offsetX, 0, maxX));
            CanvasScroller.ScrollToVerticalOffset(Math.Clamp(offsetY, 0, maxY));
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
            ApplyScrollExtentSize();
        }

        private double MapX(double worldX) => worldX - _contentOriginX;
        private double MapY(double worldY) => worldY - _contentOriginY;

        /// <summary>피쉬본 주 척추 Y (루트 노드 중심선, 레이아웃·정렬 후 갱신).</summary>
        private double GetFishboneSpineY()
            => _vm?.RootNode != null
                ? _vm.RootNode.Y + NodeHeight / 2
                : ContentPadding + 120;

        private bool IsFishboneHorizontallyMirrored()
            => _vm?.LayoutFlipHorizontal == true;

        /// <summary>가지 노드가 척추(sub-spine)에 붙는 X. 좌우 반전 시 왼쪽 가장자리, 기본은 오른쪽 가장자리.</summary>
        private double GetFishboneRibAttachX(NodeViewModel rib)
            => IsFishboneHorizontallyMirrored() ? rib.X : rib.X + rib.Width;

        /// <summary>주 척추 수평 구간 (segLeft → segRight).</summary>
        private void GetFishboneMainSpineSegment(NodeViewModel root, out double segLeft, out double segRight)
        {
            if (!root.IsExpanded || root.Children.Count == 0)
            {
                segLeft = ContentPadding + 40;
                segRight = IsFishboneHorizontallyMirrored() ? root.X + root.Width : root.X;
                return;
            }

            if (IsFishboneHorizontallyMirrored())
            {
                segLeft = root.X + root.Width;
                segRight = root.Children.Max(c => GetFishboneRibAttachX(c));
            }
            else
            {
                segLeft = root.Children.Min(c => GetFishboneRibAttachX(c));
                segRight = root.X;
            }
        }

        /// <summary>sub-spine 수평 구간 (segLeft → segRight).</summary>
        private void GetFishboneSubSpineSegment(NodeViewModel node, out double segLeft, out double segRight)
        {
            if (IsFishboneHorizontallyMirrored())
            {
                segLeft = GetFishboneRibAttachX(node);
                segRight = node.Children.Max(c => GetFishboneRibAttachX(c));
            }
            else
            {
                segLeft = node.Children.Min(c => GetFishboneRibAttachX(c));
                segRight = GetFishboneRibAttachX(node);
            }
        }

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
                // Root-level connections start noticeably thicker for "growing from root" effect
                if (parent.Level == 0)
                    startWidth *= 1.8;
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

            // Fishbone: all connections use straight geometry
            // Level 0→1: diagonal rib; Level >0→child: vertical connector from sub-spine junction
            if (_vm?.LayoutType == LayoutType.Fishbone)
                return BuildStraightGeometry(start, end);

            return _vm!.ConnectionLineType switch
            {
                ConnectionLineType.Linear => BuildStraightGeometry(start, end),
                ConnectionLineType.SharpLinear => BuildSharpLinearGeometry(parent, child, start, end),
                ConnectionLineType.SharpBezier => BuildSharpBezierGeometry(parent, child, start, end),
                _ => BuildBezierGeometry(parent, child, start, end),
            };
        }

        /// <summary>피쉬본 대각 rib: 척추 부착점 → 카테고리 노드 상/하 가장자리 (위·아래 가지 방향 고정).</summary>
        private (Point start, Point end) GetFishboneRibWorldEndpoints(NodeViewModel parent, NodeViewModel child)
        {
            double spineY = parent.Level == 0 ? GetFishboneSpineY() : parent.Y + NodeHeight / 2;
            double spineX = GetFishboneRibAttachX(child);
            bool upper = child.FishboneRibUpper ?? (parent.Children.IndexOf(child) % 2 == 0);
            double cx = child.X + child.Width / 2;
            var start = new Point(spineX, spineY);
            var end = upper
                ? new Point(cx, child.Y + NodeHeight)
                : new Point(cx, child.Y);
            return (start, end);
        }

        private (Point start, Point end) GetConnectionEndpoints(NodeViewModel parent, NodeViewModel child)
        {
            if (_vm?.LayoutType == LayoutType.Fishbone)
            {
                var (ribStart, ribEnd) = GetFishboneRibWorldEndpoints(parent, child);
                return (
                    new Point(MapX(ribStart.X), MapY(ribStart.Y)),
                    new Point(MapX(ribEnd.X), MapY(ribEnd.Y)));
            }

            double pCx = parent.X + parent.Width / 2;
            double pCy = parent.Y + NodeHeight / 2;
            double cCx = child.X + child.Width / 2;
            double cCy = child.Y + NodeHeight / 2;

            Point startWorld, endWorld2;
            if (_vm?.LayoutType == LayoutType.Radial)
            {
                startWorld = NodeShapeHelper.GetEdgePoint(parent, cCx, cCy, NodeHeight);
                endWorld2  = NodeShapeHelper.GetEdgePoint(child,  pCx, pCy, NodeHeight);
            }
            else
            {
                startWorld = NodeShapeHelper.GetEdgePointHorizontal(parent, cCx, NodeHeight);
                endWorld2  = NodeShapeHelper.GetEdgePointHorizontal(child,  pCx, NodeHeight);
            }
            return (
                new Point(MapX(startWorld.X), MapY(startWorld.Y)),
                new Point(MapX(endWorld2.X), MapY(endWorld2.Y)));
        }

        private static Geometry BuildStraightGeometry(Point start, Point end)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new LineSegment(end, isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            return geom;
        }

        /// <summary>피쉬본 비루트 연결: 부모에서 수평으로 뻗은 선(Line 1) + 자식까지 수직으로 내린 선(Line 2).</summary>
        private static Geometry BuildFishboneElbowGeometry(Point start, Point end)
        {
            var fig = new PathFigure { StartPoint = start, IsFilled = false };
            fig.Segments.Add(new LineSegment(new Point(end.X, start.Y), isStroked: true));
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
            _fishboneSpinePath = null;
            _fishboneSubSpinePaths.Clear();
            _connectionPaths.Clear();
            if (_vm.LayoutType == LayoutType.Fishbone)
            {
                DrawFishboneSpine(_vm.RootNode);
                DrawFishboneSubSpines(_vm.RootNode);
            }
            DrawConnections(_vm.RootNode);
        }

        private void DrawFishboneSpine(NodeViewModel root)
        {
            double spineY = GetFishboneSpineY();
            GetFishboneMainSpineSegment(root, out double spineLeft, out double spineRight);

            if (spineRight <= spineLeft) return;

            var fig = new PathFigure
            {
                StartPoint = new Point(MapX(spineLeft), MapY(spineY)),
                IsFilled = false
            };
            fig.Segments.Add(new LineSegment(new Point(MapX(spineRight), MapY(spineY)), isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);

            double baseThickness = _vm?.ConnectionLineThickness ?? 1.8;
            var (lightColor, _) = NodeColorHelper.GetNodeColors(root);
            var brush = new SolidColorBrush(lightColor) { Opacity = 0.8 };

            _fishboneSpinePath = new Path
            {
                Data = geom,
                Stroke = brush,
                StrokeThickness = baseThickness * 2.0,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round
            };

            ConnectionCanvas.Children.Add(_fishboneSpinePath);
        }

        private void RefreshFishboneSpine()
        {
            if (_fishboneSpinePath == null || _vm?.RootNode == null) return;

            double spineY = GetFishboneSpineY();
            GetFishboneMainSpineSegment(_vm.RootNode, out double spineLeft, out double spineRight);

            if (spineRight <= spineLeft) return;

            var fig = new PathFigure
            {
                StartPoint = new Point(MapX(spineLeft), MapY(spineY)),
                IsFilled = false
            };
            fig.Segments.Add(new LineSegment(new Point(MapX(spineRight), MapY(spineY)), isStroked: true));
            var geom = new PathGeometry();
            geom.Figures.Add(fig);
            _fishboneSpinePath.Data = geom;
        }

        private void DrawFishboneSubSpines(NodeViewModel root)
        {
            _fishboneSubSpinePaths.Clear();
            foreach (var child in root.Children)
                DrawFishboneNodeSubSpinesRecursive(child);
        }

        private void DrawFishboneNodeSubSpinesRecursive(NodeViewModel node)
        {
            if (!node.IsExpanded || node.Children.Count == 0) return;

            // 직계 자식 부착점 ~ head 척추 접합 (좌우 반전 시 방향 반대)
            GetFishboneSubSpineSegment(node, out double subSpineLeft, out double subSpineRight);
            double centerY = node.Y + NodeHeight / 2;

            if (subSpineLeft < subSpineRight)
            {
                var fig = new PathFigure { StartPoint = new Point(MapX(subSpineLeft), MapY(centerY)), IsFilled = false };
                fig.Segments.Add(new LineSegment(new Point(MapX(subSpineRight), MapY(centerY)), isStroked: true));
                var geom = new PathGeometry();
                geom.Figures.Add(fig);

                double baseThickness = _vm?.ConnectionLineThickness ?? 1.8;
                var (lightColor, _) = NodeColorHelper.GetNodeColors(node);
                double thickness = ConnectionLineTaperHelper.ThicknessAtLevel(node.Level, baseThickness) * 1.4;

                var path = new Path
                {
                    Data = geom,
                    Stroke = new SolidColorBrush(lightColor) { Opacity = 0.7 },
                    StrokeThickness = Math.Max(1.0, thickness),
                    StrokeLineJoin = PenLineJoin.Round,
                    StrokeStartLineCap = PenLineCap.Round,
                    StrokeEndLineCap = PenLineCap.Round
                };

                _fishboneSubSpinePaths.Add(path);
                ConnectionCanvas.Children.Add(path);
            }

            foreach (var child in node.Children)
                DrawFishboneNodeSubSpinesRecursive(child);
        }

        private void RefreshFishboneSubSpines()
        {
            if (_vm?.RootNode == null) return;
            int idx = 0;
            foreach (var child in _vm.RootNode.Children)
                RefreshFishboneSubSpinesRecursive(child, ref idx);
        }

        private void RefreshFishboneSubSpinesRecursive(NodeViewModel node, ref int idx)
        {
            if (node.IsExpanded && node.Children.Count > 0)
            {
                if (idx < _fishboneSubSpinePaths.Count)
                {
                    GetFishboneSubSpineSegment(node, out double subSpineLeft, out double subSpineRight);
                    double centerY = node.Y + NodeHeight / 2;
                    if (subSpineLeft < subSpineRight)
                    {
                        var fig = new PathFigure { StartPoint = new Point(MapX(subSpineLeft), MapY(centerY)), IsFilled = false };
                        fig.Segments.Add(new LineSegment(new Point(MapX(subSpineRight), MapY(centerY)), isStroked: true));
                        var geom = new PathGeometry();
                        geom.Figures.Add(fig);
                        _fishboneSubSpinePaths[idx].Data = geom;
                    }
                    idx++;
                }
            }
            foreach (var child in node.Children)
                RefreshFishboneSubSpinesRecursive(child, ref idx);
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

            if (node.Children.Count > 0 && !node.IsExpanded)
            {
                var badge = CreateCollapseBadge(node);
                badge.PreviewMouseLeftButtonDown += (_, e) =>
                {
                    try
                    {
                        e.Handled = true;
                        _vm!.SelectedNode = node;
                        node.IsExpanded = true;
                        ScheduleRebuildCanvas();
                    }
                    catch (Exception ex)
                    {
                        ExceptionReporter.Show(ex, "노드 펼치기 배지");
                    }
                };
                wrapper.Children.Add(badge);
            }

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
                ToolTip = node.IsNoteExpanded ? "노트 접기" : "노트 보기",
                Child = AttachmentBadgeHelper.CreateNoteIcon()
            };
            AttachmentBadgeHelper.ApplyExpandedState(badge, node.IsNoteExpanded);

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
                ToolTip = node.IsImageExpanded ? "그림 접기" : "그림 보기",
                Child = AttachmentBadgeHelper.CreateImageIcon()
            };
            AttachmentBadgeHelper.ApplyExpandedState(badge, node.IsImageExpanded);

            badge.PreviewMouseLeftButtonDown += (_, e) =>
            {
                e.Handled = true;
                ToggleImagePanel(node);
            };

            return badge;
        }

        private static Border CreateCollapseBadge(NodeViewModel node)
        {
            return new Border
            {
                Tag = "CollapseBadge",
                Width = 16,
                Height = 16,
                CornerRadius = new CornerRadius(8),
                Background = new SolidColorBrush(Color.FromRgb(0x44, 0x77, 0xBB)),
                BorderBrush = new SolidColorBrush(Colors.White),
                BorderThickness = new Thickness(1),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(2, 2, 0, 0),
                Cursor = Cursors.Hand,
                IsHitTestVisible = true,
                ToolTip = $"클릭하여 펼치기 ({node.Children.Count}개 자식)",
                Child = new TextBlock
                {
                    Text = "+",
                    Foreground = Brushes.White,
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, -1, 0, 0)
                }
            };
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

        private void CloseNotePanel(bool skipSideEffects = false)
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

            if (!skipSideEffects)
            {
                RestoreExpandReflowSnapshot();
                RelayoutAfterAttachmentChange(node);

                if (noteAdded || noteRemoved)
                    ReplaceNodeVisual(node);
                else
                    UpdateNoteBadge(node);

                if (_imagePanelNode == node)
                    PositionNodeOverlays(node);
            }
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

        private void CloseImagePanel(bool skipSideEffects = false)
        {
            if (_imagePanelNode == null) return;

            var node = _imagePanelNode;
            node.IsImageExpanded = false;
            _imagePanelNode = null;

            ImageBorder.Visibility = Visibility.Collapsed;
            NodeImageDisplay.Source = null;
            UpdateOverlayHitTest();

            if (!skipSideEffects)
            {
                RestoreExpandReflowSnapshot();
                RelayoutAfterAttachmentChange(node);

                if (node.HasImage)
                    UpdateImageBadge(node);
                else
                    ReplaceNodeVisual(node);

                if (_notePanelNode == node)
                    PositionNodeOverlays(node);
            }
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

            badge.ToolTip = node.IsImageExpanded ? "그림 접기" : "그림 보기";
            AttachmentBadgeHelper.ApplyExpandedState(badge, node.IsImageExpanded);
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

            badge.ToolTip = node.IsNoteExpanded ? "노트 접기" : "노트 보기";
            AttachmentBadgeHelper.ApplyExpandedState(badge, node.IsNoteExpanded);
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
            if (sender is not FrameworkElement { Tag: NodeViewModel vm } || _vm == null)
                return;

            e.Handled = true;

            ShowNodeContextMenu(vm);
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
            if (_vm?.RootNode == null || _isRebuildingCanvas)
                return;

            if (!AreConnectionPathsInSync())
            {
                ScheduleRebuildCanvas();
                return;
            }

            foreach (var node in _vm.GetAllNodes())
            {
                if (_nodeElements.TryGetValue(node.Model.Id, out var border))
                {
                    Canvas.SetLeft(border, MapX(node.X));
                    Canvas.SetTop(border, MapY(node.Y));
                }
            }

            RefreshAllConnections(_vm.RootNode);
            if (_vm.LayoutType == LayoutType.Fishbone)
            {
                RefreshFishboneSpine();
                RefreshFishboneSubSpines();
            }

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

        private bool AreConnectionPathsInSync()
        {
            if (_vm?.RootNode == null)
                return true;

            return _connectionPaths.Count == CountExpectedConnections(_vm.RootNode);
        }

        private static int CountExpectedConnections(NodeViewModel node)
        {
            if (!node.IsExpanded)
                return 0;

            int count = node.Children.Count;
            foreach (var child in node.Children)
                count += CountExpectedConnections(child);
            return count;
        }

        private void Node_MouseEnter(object sender, MouseEventArgs e)
        {
            if (sender is not FrameworkElement border) return;
            double w = border.ActualWidth > 0 ? border.ActualWidth : border.Width;
            double h = border.ActualHeight > 0 ? border.ActualHeight : border.Height;
            if (w <= 0) w = NodeMinWidth;
            if (h <= 0) h = NodeHeight;
            border.RenderTransform = new ScaleTransform(1.06, 1.06, w / 2, h / 2);
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
            if (_vm == null || IsCanvasLayoutBusy)
                return;
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
            double targetX = (CanvasScroller.HorizontalOffset + scrollerPoint.X) * ratio - scrollerPoint.X;
            double targetY = (CanvasScroller.VerticalOffset + scrollerPoint.Y) * ratio - scrollerPoint.Y;

            ScaleXform.ScaleX = newZoom;
            ScaleXform.ScaleY = newZoom;
            ScrollToClamped(targetX, targetY);

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
            // 스크롤바(Thumb·Track) 클릭은 가로채지 않음 — 고무줄 선택이 스크롤을 막는 문제 방지
            if (IsScrollBarChrome(e.OriginalSource as DependencyObject))
                return;

            if (e.ChangedButton == MouseButton.Middle)
            {
                _isPanning = true;
                _panStart = e.GetPosition(CanvasScroller);
                _panStartScrollX = CanvasScroller.HorizontalOffset;
                _panStartScrollY = CanvasScroller.VerticalOffset;
                CanvasScroller.CaptureMouse();
            }
            else if (e.ChangedButton == MouseButton.Left
                     && IsPointerOnMapCanvas(e.OriginalSource as DependencyObject)
                     && !IsNodeHit(e.OriginalSource as DependencyObject))
            {
                _isRubberBanding = true;
                _rubberBandStart = e.GetPosition(NodeCanvas);

                _rubberBandRect = new Rectangle
                {
                    Stroke = new SolidColorBrush(Color.FromArgb(0xFF, 0x64, 0xB5, 0xF6)),
                    StrokeThickness = 1.5,
                    StrokeDashArray = new DoubleCollection([5, 3]),
                    Fill = new SolidColorBrush(Color.FromArgb(0x28, 0x64, 0xB5, 0xF6)),
                    IsHitTestVisible = false
                };
                Canvas.SetLeft(_rubberBandRect, _rubberBandStart.X);
                Canvas.SetTop(_rubberBandRect, _rubberBandStart.Y);
                _rubberBandRect.Width = 0;
                _rubberBandRect.Height = 0;
                NodeCanvas.Children.Add(_rubberBandRect);

                CanvasScroller.CaptureMouse();
                e.Handled = true;
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

        private static bool IsScrollBarChrome(DependencyObject? source)
        {
            while (source != null)
            {
                if (source is System.Windows.Controls.Primitives.ScrollBar)
                    return true;
                source = VisualTreeHelper.GetParent(source);
            }
            return false;
        }

        private bool IsPointerOnMapCanvas(DependencyObject? source)
        {
            if (source == null || RootCanvas == null)
                return false;

            while (source != null)
            {
                if (source == RootCanvas)
                    return true;
                source = VisualTreeHelper.GetParent(source);
            }

            return false;
        }

        private void CanvasScroller_PreviewMouseMove(object sender, MouseEventArgs e)
        {
            if (_isPanning)
            {
                var pos = e.GetPosition(CanvasScroller);
                ScrollToClamped(
                    _panStartScrollX - (pos.X - _panStart.X),
                    _panStartScrollY - (pos.Y - _panStart.Y),
                    refreshExtent: false);
            }
            else if (_isRubberBanding && _rubberBandRect != null)
            {
                var cur = e.GetPosition(NodeCanvas);
                double x = Math.Min(_rubberBandStart.X, cur.X);
                double y = Math.Min(_rubberBandStart.Y, cur.Y);
                double w = Math.Abs(cur.X - _rubberBandStart.X);
                double h = Math.Abs(cur.Y - _rubberBandStart.Y);
                Canvas.SetLeft(_rubberBandRect, x);
                Canvas.SetTop(_rubberBandRect, y);
                _rubberBandRect.Width = w;
                _rubberBandRect.Height = h;
            }
        }

        private void CanvasScroller_PreviewMouseUp(object sender, MouseButtonEventArgs e)
        {
            if (_isPanning && e.ChangedButton == MouseButton.Middle)
            {
                _isPanning = false;
                CanvasScroller.ReleaseMouseCapture();
            }
            else if (_isRubberBanding && e.ChangedButton == MouseButton.Left)
            {
                _isRubberBanding = false;
                if (_rubberBandRect != null)
                {
                    NodeCanvas.Children.Remove(_rubberBandRect);
                    _rubberBandRect = null;
                }

                CanvasScroller.ReleaseMouseCapture();
                var endPos = e.GetPosition(NodeCanvas);
                ApplyRubberBandSelection(_rubberBandStart, endPos);
            }
        }

        private void ApplyRubberBandSelection(Point startCanvas, Point endCanvas)
        {
            if (_vm == null) return;

            double x1 = Math.Min(startCanvas.X, endCanvas.X);
            double y1 = Math.Min(startCanvas.Y, endCanvas.Y);
            double x2 = Math.Max(startCanvas.X, endCanvas.X);
            double y2 = Math.Max(startCanvas.Y, endCanvas.Y);

            if (x2 - x1 < 4 && y2 - y1 < 4)
            {
                _vm.SelectedNode = null;
                RefreshSelectionVisuals();
                return;
            }

            double wx1 = x1 + _contentOriginX;
            double wy1 = y1 + _contentOriginY;
            double wx2 = x2 + _contentOriginX;
            double wy2 = y2 + _contentOriginY;
            var selRect = new Rect(wx1, wy1, wx2 - wx1, wy2 - wy1);

            var hits = _vm.GetAllNodes()
                .Where(n => _nodeElements.ContainsKey(n.Model.Id))
                .Where(n => selRect.IntersectsWith(new Rect(n.X, n.Y, n.Width, NodeHeight)))
                .ToList();

            _vm.SetMultiSelection(hits);
            RefreshSelectionVisuals();
        }

        public void RebuildFromViewModel() => ScheduleRebuildCanvas();

        public void RefreshNodeText(NodeViewModel node)
        {
            if (!_nodeElements.TryGetValue(node.Model.Id, out var wrapper) || wrapper is not Grid grid)
                return;

            foreach (var child in grid.Children)
            {
                if (child is not Grid nodeVisualGrid)
                    continue;
                foreach (var vc in nodeVisualGrid.Children)
                {
                    if (vc is TextBlock tb)
                    {
                        tb.Text = node.Text;
                        double fontSize = node.Level == 0 ? 16 : 13;
                        double newWidth = MeasureTextWidth(node.Text, fontSize) + 28;
                        if (Math.Abs(newWidth - node.Width) > 1)
                        {
                            node.Width = newWidth;
                            grid.Width = newWidth;
                            nodeVisualGrid.Width = newWidth;
                        }
                        return;
                    }
                }
            }
        }

        /// <summary>100% 확대로 맞춘 뒤 다이어그램 중심을 뷰포트에 배치합니다.</summary>
        public void SetViewToDefaultZoom()
        {
            if (_vm?.RootNode == null || CanvasScroller.ViewportWidth <= 0) return;

            const double defaultZoom = 1.0;
            _suppressZoomSync = true;
            ScaleXform.ScaleX = defaultZoom;
            ScaleXform.ScaleY = defaultZoom;
            _vm.ZoomLevel = defaultZoom;
            _suppressZoomSync = false;
            ZoomLabel.Text = "100%";
            ApplyScrollExtentSize();

            CenterView();
        }

        public void CenterView() => ApplyViewFit(centerOnly: true);

        /// <summary>노드 자동 배치 후 전체가 보이도록 줌하고 다이어그램 중심을 뷰포트 정중앙에 둡니다.</summary>
        public void FitToView() => ApplyViewFit(centerOnly: false);

        private void ApplyViewFit(bool centerOnly)
        {
            if (_vm?.RootNode == null)
                return;

            void ApplyNow()
            {
                if (CanvasScroller.ViewportWidth <= 0 || CanvasScroller.ViewportHeight <= 0)
                    return;

                var (minX, minY, maxX, maxY) = GetBoundingBox();
                if (minX == double.MaxValue)
                    return;

                double mapCX = MapX((minX + maxX) / 2);
                double mapCY = MapY((minY + maxY) / 2);

                double zoom = ScaleXform.ScaleX;
                if (!centerOnly)
                {
                    double mapW = Math.Max(1, maxX - minX + ContentPadding);
                    double mapH = Math.Max(1, maxY - minY + ContentPadding);
                    double fitZoom = Math.Min(
                        CanvasScroller.ViewportWidth / mapW,
                        CanvasScroller.ViewportHeight / mapH);
                    zoom = Math.Clamp(fitZoom, 0.15, 2.0);

                    _suppressZoomSync = true;
                    ScaleXform.ScaleX = zoom;
                    ScaleXform.ScaleY = zoom;
                    if (_vm != null)
                        _vm.ZoomLevel = zoom;
                    _suppressZoomSync = false;
                    ZoomLabel.Text = $"{zoom:P0}";
                }

                ApplyScrollExtentSize();
                ScrollToClamped(
                    mapCX * zoom - CanvasScroller.ViewportWidth / 2,
                    mapCY * zoom - CanvasScroller.ViewportHeight / 2,
                    refreshExtent: false);
            }

            // 레이아웃·줌 반영 후 Extent가 갱신된 다음 스크롤 (정렬 직후 중앙 맞춤)
            ApplyScrollExtentSize();
            Dispatcher.BeginInvoke(ApplyNow, System.Windows.Threading.DispatcherPriority.Loaded);
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
                ScrollToClamped(
                    startX + (targetX - startX) * eased,
                    startY + (targetY - startY) * eased,
                    refreshExtent: false);
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
