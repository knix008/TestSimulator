using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using MyMindWin.Diagnostics;
using MyMindWin.Models;
using MyMindWin.Services;

namespace MyMindWin.ViewModels
{
    public sealed record NodeShapeOption(NodeShapeKind Kind, string Label);
    public sealed record ConnectionLineOption(ConnectionLineType Type, string Label, string Description);

    public enum LayoutType { HorizontalTree, Radial, Fishbone }

    public class MainViewModel : INotifyPropertyChanged
    {
        private NodeViewModel? _rootNode;
        private NodeViewModel? _selectedNode;
        private readonly List<NodeViewModel> _multiSelectedNodes = [];
        private LayoutType _layoutType = LayoutType.HorizontalTree;
        private bool _layoutFlipHorizontal;
        private bool _layoutFlipVertical;
        private ConnectionLineType _connectionLineType = ConnectionLineType.Bezier;
        private double _connectionLineThickness = ConnectionLineThicknessPresets.Normal;
        private bool _connectionLineTaper = true;
        private double _zoomLevel = 1.0;
        private string _currentFilePath = string.Empty;
        private string? _documentTitle;
        private NodeShapeKind _shapeComboSelection = NodeShapeKind.RoundedRectangle;
        private NodeShapeKind _defaultNodeShape = NodeShapeKind.RoundedRectangle;
        private bool _syncingShapeCombo;
        private bool _syncingColorCombo;
        private bool _syncingBorderCombo;

        // ── Properties ──────────────────────────────────────────────────────

        public NodeViewModel? RootNode
        {
            get => _rootNode;
            private set { _rootNode = value; OnPropertyChanged(); OnPropertyChanged(nameof(RootNodes)); }
        }

        public IEnumerable<NodeViewModel> RootNodes =>
            _rootNode != null ? [_rootNode] : [];

        public IReadOnlyList<NodeViewModel> MultiSelectedNodes => _multiSelectedNodes;

        public NodeViewModel? SelectedNode
        {
            get => _selectedNode;
            set
            {
                ClearMultiSelection();
                if (_selectedNode != null) _selectedNode.IsSelected = false;
                _selectedNode = value;
                if (_selectedNode != null) _selectedNode.IsSelected = true;
                OnPropertyChanged();
                OnPropertyChanged(nameof(HasSelectedNode));
                OnPropertyChanged(nameof(SelectionStatusText));
                SyncShapeComboFromSelectedNode();
                SyncColorComboFromSelectedNode();
                SyncBorderComboFromSelectedNode();
            }
        }

        public void SetMultiSelection(IEnumerable<NodeViewModel> nodes)
        {
            ClearMultiSelection();
            if (_selectedNode != null) { _selectedNode.IsSelected = false; _selectedNode = null; }

            var list = nodes.ToList();
            if (list.Count == 0)
            {
                OnPropertyChanged(nameof(SelectedNode));
                OnPropertyChanged(nameof(HasSelectedNode));
                return;
            }

            _selectedNode = list[0];
            _selectedNode.IsSelected = true;
            foreach (var n in list.Skip(1))
            {
                n.IsSelected = true;
                _multiSelectedNodes.Add(n);
            }

            OnPropertyChanged(nameof(SelectedNode));
            OnPropertyChanged(nameof(HasSelectedNode));
            SyncShapeComboFromSelectedNode();
            SyncColorComboFromSelectedNode();
            SyncBorderComboFromSelectedNode();
        }

        private void ClearMultiSelection()
        {
            foreach (var n in _multiSelectedNodes)
                n.IsSelected = false;
            _multiSelectedNodes.Clear();
        }

        public bool HasSelectedNode => SelectedNode != null;

        public bool CanEditNodeColor => SelectedNode != null;

        public ObservableCollection<NodeColorOption> NodeColorOptions { get; } = BuildNodeColorOptions();

        public int SelectedNodeColorIndex
        {
            get => SelectedNode?.Model.ColorIndex ?? NodeColorPalette.InheritColorIndex;
            set
            {
                if (_syncingColorCombo || SelectedNode == null)
                    return;

                if (SelectedNode.Model.ColorIndex == value)
                    return;

                ApplyColorToSelected(value);
            }
        }

        private static ObservableCollection<NodeColorOption> BuildNodeColorOptions()
        {
            var list = new ObservableCollection<NodeColorOption>
            {
                NodeColorOption.ForInherit(NodeColorPalette.RootLight, NodeColorPalette.RootDark)
            };
            for (int i = 0; i < NodeColorPalette.PaletteCount; i++)
                list.Add(NodeColorOption.FromPaletteIndex(i));
            return list;
        }

        private void RefreshInheritColorPreview()
        {
            var inherit = BuildInheritColorOption();
            var current = NodeColorOptions[0];
            if (current.Light == inherit.Light && current.Dark == inherit.Dark)
                return;

            bool restoreInheritSelection = SelectedNode is { Model.ColorIndex: < 0 };
            bool prevColorSync = _syncingColorCombo;
            _syncingColorCombo = true;
            NodeColorOptions.RemoveAt(0);
            NodeColorOptions.Insert(0, inherit);
            if (restoreInheritSelection)
                OnPropertyChanged(nameof(SelectedNodeColorIndex));
            _syncingColorCombo = prevColorSync;
        }

        private NodeColorOption BuildInheritColorOption()
        {
            if (SelectedNode == null)
                return NodeColorOption.ForRootDefault();

            if (SelectedNode.Level == 0)
                return NodeColorOption.ForRootDefault();

            if (SelectedNode.Model.ColorIndex < 0)
            {
                var (light, dark) = NodeColorResolver.GetColors(SelectedNode);
                return NodeColorOption.ForInherit(light, dark);
            }

            if (SelectedNode.Parent != null)
            {
                var (light, dark) = NodeColorResolver.GetColors(SelectedNode.Parent);
                return NodeColorOption.ForInherit(light, dark);
            }

            return NodeColorOption.ForInherit(NodeColorPalette.RootLight, NodeColorPalette.RootDark);
        }

        public bool CanEditNodeBorder => SelectedNode != null;

        public ObservableCollection<NodeBorderColorOption> NodeBorderColorOptions { get; } = BuildNodeBorderColorOptions();

        public int SelectedNodeBorderColorIndex
        {
            get => SelectedNode?.Model.BorderColorIndex ?? NodeBorderPalette.InheritColorIndex;
            set
            {
                if (_syncingBorderCombo || SelectedNode == null)
                    return;

                if (SelectedNode.Model.BorderColorIndex == value)
                    return;

                ApplyBorderColorToSelected(value);
            }
        }

        public IReadOnlyList<NodeBorderThicknessOption> NodeBorderThicknessOptions { get; } =
            NodeBorderThicknessPresets.Presets
                .Select(NodeBorderThicknessOption.FromPreset)
                .ToArray();

        public NodeBorderThicknessOption SelectedNodeBorderThicknessOption
        {
            get
            {
                var t = SelectedNode?.Model.BorderThickness;
                return NodeBorderThicknessOptions.First(o => o.Thickness == t);
            }
            set
            {
                if (_syncingBorderCombo || value == null || SelectedNode == null)
                    return;

                if (SelectedNode.Model.BorderThickness == value.Thickness)
                    return;

                ApplyBorderThicknessToSelected(value.Thickness);
            }
        }

        private static ObservableCollection<NodeBorderColorOption> BuildNodeBorderColorOptions()
        {
            var list = new ObservableCollection<NodeBorderColorOption>
            {
                NodeBorderColorOption.ForInherit(NodeColorPalette.RootLight)
            };
            list.Add(NodeBorderColorOption.White());
            for (int i = 0; i < NodeColorPalette.PaletteCount; i++)
                list.Add(NodeBorderColorOption.FromPaletteIndex(i));
            return list;
        }

        private void RefreshInheritBorderColorPreview()
        {
            if (SelectedNode == null)
                return;

            var inherit = BuildInheritBorderColorOption();
            var current = NodeBorderColorOptions[0];
            if (current.PreviewColor == inherit.PreviewColor)
                return;

            bool restore = SelectedNode.Model.BorderColorIndex == NodeBorderPalette.InheritColorIndex;
            bool prevBorderSync = _syncingBorderCombo;
            _syncingBorderCombo = true;
            NodeBorderColorOptions.RemoveAt(0);
            NodeBorderColorOptions.Insert(0, inherit);
            if (restore)
                OnPropertyChanged(nameof(SelectedNodeBorderColorIndex));
            _syncingBorderCombo = prevBorderSync;
        }

        private NodeBorderColorOption BuildInheritBorderColorOption()
        {
            if (SelectedNode == null)
                return NodeBorderColorOption.ForInherit(NodeColorPalette.RootLight);

            var (light, _) = NodeColorResolver.GetColors(SelectedNode);
            return NodeBorderColorOption.ForInherit(light);
        }

        private void SyncBorderComboFromSelectedNode()
        {
            _syncingBorderCombo = true;
            RefreshInheritBorderColorPreview();
            OnPropertyChanged(nameof(CanEditNodeBorder));
            OnPropertyChanged(nameof(SelectedNodeBorderColorIndex));
            OnPropertyChanged(nameof(SelectedNodeBorderThicknessOption));
            _syncingBorderCombo = false;
        }

        private void ApplyBorderColorToSelected(int colorIndex)
        {
            if (SelectedNode == null)
                return;

            SelectedNode.BorderColorIndex = colorIndex;
            foreach (var n in _multiSelectedNodes)
                n.BorderColorIndex = colorIndex;

            _syncingBorderCombo = true;
            RefreshInheritBorderColorPreview();
            OnPropertyChanged(nameof(SelectedNodeBorderColorIndex));
            _syncingBorderCombo = false;
            RequestNodeShapeRefresh?.Invoke(this, SelectedNode);
            foreach (var n in _multiSelectedNodes)
                RequestNodeShapeRefresh?.Invoke(this, n);
        }

        private void ApplyBorderThicknessToSelected(double? thickness)
        {
            if (SelectedNode == null)
                return;

            var normalized = NodeBorderThicknessPresets.Normalize(thickness);
            SelectedNode.BorderThickness = normalized;
            foreach (var n in _multiSelectedNodes)
                n.BorderThickness = normalized;

            _syncingBorderCombo = true;
            OnPropertyChanged(nameof(SelectedNodeBorderThicknessOption));
            _syncingBorderCombo = false;
            RequestNodeShapeRefresh?.Invoke(this, SelectedNode);
            foreach (var n in _multiSelectedNodes)
                RequestNodeShapeRefresh?.Invoke(this, n);
        }

        /// <summary>문서 제목 (.mmap title → 파일명 → 루트 노드 텍스트).</summary>
        public string DocumentTitle => ResolveDocumentTitle();

        public IReadOnlyList<NodeShapeOption> ShapeOptions { get; } =
            Enum.GetValues<NodeShapeKind>()
                .Select(k => new NodeShapeOption(k, k.GetDisplayName()))
                .ToArray();

        /// <summary>새로 추가하는 노드에 적용할 기본 도형.</summary>
        public NodeShapeKind DefaultNodeShape
        {
            get => _defaultNodeShape;
            private set
            {
                if (_defaultNodeShape == value) return;
                _defaultNodeShape = value;
                OnPropertyChanged();
            }
        }

        public NodeShapeKind ShapeComboSelection
        {
            get => _shapeComboSelection;
            set
            {
                if (_syncingShapeCombo || _shapeComboSelection == value) return;
                _shapeComboSelection = value;
                DefaultNodeShape = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(SelectedShapeOption));
                if (SelectedNode != null && SelectedNode.Shape != value)
                    ApplyShapeToSelected(value);
            }
        }

        public NodeShapeOption SelectedShapeOption
        {
            get => ShapeOptions.First(o => o.Kind == _shapeComboSelection);
            set
            {
                if (value == null || _syncingShapeCombo || value.Kind == _shapeComboSelection)
                    return;
                ShapeComboSelection = value.Kind;
            }
        }

        public LayoutType LayoutType
        {
            get => _layoutType;
            set { _layoutType = value; OnPropertyChanged(); }
        }

        public bool LayoutFlipHorizontal
        {
            get => _layoutFlipHorizontal;
            set
            {
                if (_layoutFlipHorizontal == value) return;
                _layoutFlipHorizontal = value;
                OnPropertyChanged();
                RequestAutoLayout?.Invoke(this, EventArgs.Empty);
            }
        }

        public bool LayoutFlipVertical
        {
            get => _layoutFlipVertical;
            set
            {
                if (_layoutFlipVertical == value) return;
                _layoutFlipVertical = value;
                OnPropertyChanged();
                RequestAutoLayout?.Invoke(this, EventArgs.Empty);
            }
        }

        public IReadOnlyList<ConnectionLineOption> ConnectionLineOptions { get; } =
            Enum.GetValues<ConnectionLineType>()
                .Select(t => new ConnectionLineOption(t, t.GetDisplayName(), t.GetDescription()))
                .ToArray();

        public ConnectionLineType ConnectionLineType
        {
            get => _connectionLineType;
            set
            {
                if (_connectionLineType == value) return;
                _connectionLineType = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(SelectedConnectionLineOption));
                RequestConnectionRefresh?.Invoke(this, EventArgs.Empty);
            }
        }

        public ConnectionLineOption SelectedConnectionLineOption
        {
            get => ConnectionLineOptions.First(o => o.Type == _connectionLineType);
            set
            {
                if (value == null || value.Type == _connectionLineType) return;
                ConnectionLineType = value.Type;
            }
        }

        public IReadOnlyList<ConnectionLineThicknessOption> ConnectionLineThicknessOptions { get; } =
            ConnectionLineThicknessPresets.Presets
                .Select(t => new ConnectionLineThicknessOption(t, ConnectionLineThicknessPresets.GetDisplayName(t)))
                .ToArray();

        public double ConnectionLineThickness
        {
            get => _connectionLineThickness;
            set
            {
                double normalized = ConnectionLineThicknessPresets.Normalize(value);
                if (Math.Abs(_connectionLineThickness - normalized) < 0.01) return;
                _connectionLineThickness = normalized;
                OnPropertyChanged();
                OnPropertyChanged(nameof(SelectedConnectionLineThicknessOption));
                RequestConnectionRefresh?.Invoke(this, EventArgs.Empty);
            }
        }

        /// <summary>연결선 뿌리형 테이퍼 — 중심(부모)에서 굵고 세부 노드로 갈수록 가늘게.</summary>
        public bool ConnectionLineTaper
        {
            get => _connectionLineTaper;
            set
            {
                if (_connectionLineTaper == value) return;
                _connectionLineTaper = value;
                OnPropertyChanged();
                RequestConnectionRefresh?.Invoke(this, EventArgs.Empty);
            }
        }

        public ConnectionLineThicknessOption SelectedConnectionLineThicknessOption
        {
            get => ConnectionLineThicknessOptions.First(o => Math.Abs(o.Thickness - _connectionLineThickness) < 0.01);
            set
            {
                if (value == null || Math.Abs(value.Thickness - _connectionLineThickness) < 0.01) return;
                ConnectionLineThickness = value.Thickness;
            }
        }

        public double ZoomLevel
        {
            get => _zoomLevel;
            set { _zoomLevel = Math.Clamp(value, 0.15, 4.0); OnPropertyChanged(); }
        }

        // ── Events ───────────────────────────────────────────────────────────

        public event EventHandler? RequestLayout;
        public event EventHandler? RequestAutoLayout;
        public event EventHandler? RequestFitView;
        public event EventHandler? RequestConnectionRefresh;
        public event EventHandler<NodeViewModel>? RequestNodeShapeRefresh;
        public event EventHandler<NodeViewModel>? RequestNodeColorRefresh;

        // ── Commands ─────────────────────────────────────────────────────────

        public ICommand NewDocumentCommand { get; }
        public ICommand OpenCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand SaveAsCommand { get; }
        public ICommand ExportImageCommand { get; }
        public ICommand ExportMarkdownCommand { get; }
        public ICommand ExportWordCommand { get; }
        public ICommand ExportPdfCommand { get; }
        public ICommand AddChildCommand { get; }
        public ICommand AddSiblingCommand { get; }
        public ICommand DeleteNodeCommand { get; }
        public ICommand ToggleExpandCommand { get; }
        public ICommand ExpandAllCommand { get; }
        public ICommand CollapseAllCommand { get; }
        public ICommand ZoomInCommand { get; }
        public ICommand ZoomOutCommand { get; }
        public ICommand ResetViewCommand { get; }
        public ICommand AutoLayoutCommand { get; }
        public ICommand SetLayoutRadialCommand { get; }
        public ICommand SetLayoutFishboneCommand { get; }
        public ICommand SetLayoutTreeCommand { get; }
        public ICommand SetShapeCommand { get; }

        private Func<CanvasImageExportOptions, string, (bool Success, string? Error)>? _exportImageHandler;

        public void SetExportImageHandler(Func<CanvasImageExportOptions, string, (bool Success, string? Error)> handler)
            => _exportImageHandler = handler;

        public MainViewModel()
        {
            NewDocumentCommand = new RelayCommand(_ => NewDocument());
            OpenCommand = new RelayCommand(_ => Open());
            SaveCommand = new RelayCommand(_ => Save());
            SaveAsCommand = new RelayCommand(_ => SaveAs());
            ExportImageCommand = new RelayCommand(_ => ExportImage(), _ => RootNode != null);
            ExportMarkdownCommand = new RelayCommand(_ => ExportDocument(DocumentExportFormat.Markdown), _ => RootNode != null);
            ExportWordCommand = new RelayCommand(_ => ExportDocument(DocumentExportFormat.Word), _ => RootNode != null);
            ExportPdfCommand = new RelayCommand(_ => ExportDocument(DocumentExportFormat.Pdf), _ => RootNode != null);
            AddChildCommand = new RelayCommand(_ => AddChild(), _ => SelectedNode != null);
            AddSiblingCommand = new RelayCommand(_ => AddSibling(), _ => SelectedNode?.Parent != null);
            DeleteNodeCommand = new RelayCommand(_ => DeleteNode(), _ => SelectedNode?.Parent != null);
            ToggleExpandCommand = new RelayCommand(_ => ToggleExpand(), _ => SelectedNode?.Children.Count > 0);
            ExpandAllCommand = new RelayCommand(_ => SetExpandAll(true));
            CollapseAllCommand = new RelayCommand(_ => SetExpandAll(false));
            ZoomInCommand = new RelayCommand(_ => ZoomLevel *= 1.2);
            ZoomOutCommand = new RelayCommand(_ => ZoomLevel /= 1.2);
            ResetViewCommand = new RelayCommand(_ => RequestFitView?.Invoke(this, EventArgs.Empty), _ => RootNode != null);
            AutoLayoutCommand = new RelayCommand(_ => RequestAutoLayout?.Invoke(this, EventArgs.Empty), _ => RootNode != null);
            SetLayoutRadialCommand = new RelayCommand(_ => ApplyLayout(LayoutType.Radial), _ => RootNode != null);
            SetLayoutFishboneCommand = new RelayCommand(_ => ApplyLayout(LayoutType.Fishbone), _ => RootNode != null);
            SetLayoutTreeCommand = new RelayCommand(_ => ApplyLayout(LayoutType.HorizontalTree), _ => RootNode != null);
            SetShapeCommand = new RelayCommand(SetShapeFromParameter);

            if (!IsInDesignTime())
                NewDocument();
            else
                LoadDesignTimeSample();
        }

        private static bool IsInDesignTime() =>
            LicenseManager.UsageMode == LicenseUsageMode.Designtime;

        private void LoadDesignTimeSample()
        {
            var root = new MindMapNode { Text = "Main Topic", IsExpanded = true };
            root.Children.Add(new MindMapNode { Text = "Idea 1", IsExpanded = true });
            root.Children.Add(new MindMapNode { Text = "Idea 2" });
            SetRoot(root);
        }

        // ── Document Operations ───────────────────────────────────────────────

        private void NewDocument()
        {
            _layoutType = LayoutType.HorizontalTree;
            _layoutFlipHorizontal = false;
            _layoutFlipVertical = false;
            _connectionLineType = ConnectionLineType.Bezier;
            _connectionLineThickness = ConnectionLineThicknessPresets.Normal;
            _connectionLineTaper = true;

            OnPropertyChanged(nameof(LayoutType));
            OnPropertyChanged(nameof(LayoutFlipHorizontal));
            OnPropertyChanged(nameof(LayoutFlipVertical));
            OnPropertyChanged(nameof(ConnectionLineType));
            OnPropertyChanged(nameof(SelectedConnectionLineOption));
            OnPropertyChanged(nameof(ConnectionLineThickness));
            OnPropertyChanged(nameof(SelectedConnectionLineThicknessOption));
            OnPropertyChanged(nameof(ConnectionLineTaper));

            var root = new MindMapNode { Text = "Main Topic", IsExpanded = true };
            SetRoot(root);
            _currentFilePath = string.Empty;
            _documentTitle = null;
            _defaultNodeShape = NodeShapeKind.RoundedRectangle;
            _shapeComboSelection = NodeShapeKind.RoundedRectangle;
            OnPropertyChanged(nameof(DocumentTitle));
            OnPropertyChanged(nameof(DefaultNodeShape));
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));

            ZoomLevel = 1.0;
        }

        public int TotalNodeCount => GetAllNodes().Count();

        public string LayoutTypeName => _layoutType switch
        {
            LayoutType.Radial   => "방사형",
            LayoutType.Fishbone => "피쉬본",
            _                   => "수평 트리"
        };

        public string SelectionStatusText
        {
            get
            {
                int extra = _multiSelectedNodes.Count;
                if (extra > 0 && _selectedNode != null)
                    return $"{extra + 1}개 노드 선택됨";
                return _selectedNode != null ? _selectedNode.Text : "선택 없음";
            }
        }

        private void NotifyStatusChanged()
        {
            OnPropertyChanged(nameof(TotalNodeCount));
            OnPropertyChanged(nameof(SelectionStatusText));
            OnPropertyChanged(nameof(LayoutTypeName));
        }

        public void SetRoot(MindMapNode model, LayoutType? layout = null)
        {
            if (layout.HasValue)
                _layoutType = layout.Value;

            RootNode = BuildViewModel(model, null, 0);
            NodeColorNormalizer.Normalize(RootNode);
            SelectedNode = RootNode;
            OnPropertyChanged(nameof(DocumentTitle));
            OnPropertyChanged(nameof(LayoutType));
            NotifyStatusChanged();
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void LoadDocument(MindMapDocument document)
        {
            _connectionLineType = MindMapFileSerializer.ParseConnectionLine(document.ConnectionLine);
            _connectionLineThickness = document.ConnectionLineThickness.HasValue
                ? ConnectionLineThicknessPresets.Normalize(document.ConnectionLineThickness.Value)
                : ConnectionLineThicknessPresets.Normal;
            _connectionLineTaper = document.ConnectionLineTaper;
            _defaultNodeShape = NodeShapeKindExtensions.FromJsonValue(document.DefaultNodeShape);
            _shapeComboSelection = _defaultNodeShape;
            OnPropertyChanged(nameof(ConnectionLineType));
            OnPropertyChanged(nameof(DefaultNodeShape));
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));
            OnPropertyChanged(nameof(SelectedConnectionLineOption));
            OnPropertyChanged(nameof(ConnectionLineThickness));
            OnPropertyChanged(nameof(SelectedConnectionLineThicknessOption));
            OnPropertyChanged(nameof(ConnectionLineTaper));

            _layoutFlipHorizontal = document.LayoutFlipHorizontal;
            _layoutFlipVertical = document.LayoutFlipVertical;
            OnPropertyChanged(nameof(LayoutFlipHorizontal));
            OnPropertyChanged(nameof(LayoutFlipVertical));

            _documentTitle = string.IsNullOrWhiteSpace(document.Title) ? null : document.Title.Trim();

            var layout = MindMapFileSerializer.ParseLayout(document.Layout);
            SetRoot(document.Root, layout);
            OnPropertyChanged(nameof(DocumentTitle));
        }

        private void ApplyLayout(LayoutType layoutType)
        {
            _layoutType = layoutType;
            OnPropertyChanged(nameof(LayoutType));
            NotifyStatusChanged();
            RequestAutoLayout?.Invoke(this, EventArgs.Empty);
        }

        private void SyncShapeComboFromSelectedNode()
        {
            _syncingShapeCombo = true;
            _shapeComboSelection = SelectedNode?.Shape ?? _defaultNodeShape;
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));
            _syncingShapeCombo = false;
        }

        private void SyncColorComboFromSelectedNode()
        {
            _syncingColorCombo = true;
            RefreshInheritColorPreview();
            OnPropertyChanged(nameof(CanEditNodeColor));
            OnPropertyChanged(nameof(SelectedNodeColorIndex));
            _syncingColorCombo = false;
        }

        private void ApplyColorToSelected(int colorIndex)
        {
            if (SelectedNode == null)
                return;

            SelectedNode.NodeColorIndex = colorIndex;
            foreach (var n in _multiSelectedNodes)
                n.NodeColorIndex = colorIndex;

            _syncingColorCombo = true;
            RefreshInheritColorPreview();
            OnPropertyChanged(nameof(SelectedNodeColorIndex));
            _syncingColorCombo = false;

            RequestNodeColorRefresh?.Invoke(this, SelectedNode);
            foreach (var n in _multiSelectedNodes)
                RequestNodeColorRefresh?.Invoke(this, n);
            RefreshInheritBorderColorPreviewIfNeeded(SelectedNode);
        }

        /// <summary>부모 색 변경 등으로 상속 색이 바뀐 뒤 속성창 견본을 맞춥니다.</summary>
        public void RefreshInheritColorPreviewIfNeeded(NodeViewModel changedNode)
        {
            if (SelectedNode == null)
                return;

            if (SelectedNode.Level == 0 || SelectedNode.Model.ColorIndex >= 0)
                return;

            if (SelectedNode == changedNode || IsAncestor(changedNode, SelectedNode))
                RefreshInheritColorPreview();
        }

        public void RefreshInheritBorderColorPreviewIfNeeded(NodeViewModel changedNode)
        {
            if (SelectedNode == null)
                return;

            if (SelectedNode.Model.BorderColorIndex != NodeBorderPalette.InheritColorIndex)
                return;

            if (SelectedNode == changedNode || IsAncestor(changedNode, SelectedNode))
                RefreshInheritBorderColorPreview();
        }

        private static bool IsAncestor(NodeViewModel ancestor, NodeViewModel node)
        {
            for (var p = node.Parent; p != null; p = p.Parent)
            {
                if (p == ancestor)
                    return true;
            }

            return false;
        }

        private void ApplyShapeToSelected(NodeShapeKind shape)
        {
            if (SelectedNode == null || SelectedNode.Shape == shape) return;
            SelectedNode.Shape = shape;
            foreach (var n in _multiSelectedNodes)
                n.Shape = shape;

            _syncingShapeCombo = true;
            _shapeComboSelection = shape;
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));
            _syncingShapeCombo = false;
            RequestNodeShapeRefresh?.Invoke(this, SelectedNode);
            foreach (var n in _multiSelectedNodes)
                RequestNodeShapeRefresh?.Invoke(this, n);
        }

        private void SetShapeFromParameter(object? parameter)
        {
            var shape = parameter switch
            {
                NodeShapeKind k => k,
                string s => NodeShapeKindExtensions.FromJsonValue(s),
                _ => NodeShapeKind.RoundedRectangle
            };
            ShapeComboSelection = shape;
        }

        // ── Node Operations ───────────────────────────────────────────────────

        public void AddChild()
        {
            if (SelectedNode == null) return;

            var newModel = new MindMapNode
            {
                Text = "New Node",
                Shape = DefaultNodeShape.ToJsonValue(),
                ColorIndex = SelectedNode.Level == 0
                    ? SelectedNode.Children.Count % NodeColorPalette.PaletteCount
                    : NodeColorPalette.InheritColorIndex
            };
            SelectedNode.Model.Children.Add(newModel);

            var newVm = new NodeViewModel(newModel, SelectedNode, SelectedNode.Level + 1)
            {
                Shape = DefaultNodeShape
            };
            SelectedNode.Children.Add(newVm);
            SelectedNode.IsExpanded = true;
            SelectedNode = newVm;

            NotifyStatusChanged();
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void AddSibling()
        {
            if (SelectedNode?.Parent == null) return;

            var parent = SelectedNode.Parent;
            int insertIndex = parent.Children.IndexOf(SelectedNode) + 1;

            var newModel = new MindMapNode
            {
                Text = "New Node",
                Shape = DefaultNodeShape.ToJsonValue(),
                ColorIndex = parent.Level == 0
                    ? insertIndex % NodeColorPalette.PaletteCount
                    : NodeColorPalette.InheritColorIndex
            };
            int modelIdx = parent.Model.Children.IndexOf(SelectedNode.Model);
            parent.Model.Children.Insert(modelIdx + 1, newModel);

            var newVm = new NodeViewModel(newModel, parent, SelectedNode.Level)
            {
                Shape = DefaultNodeShape
            };
            parent.Children.Insert(parent.Children.IndexOf(SelectedNode) + 1, newVm);
            SelectedNode = newVm;

            NotifyStatusChanged();
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void DeleteNode()
        {
            if (SelectedNode?.Parent == null) return;

            var parent = SelectedNode.Parent;
            parent.Model.Children.Remove(SelectedNode.Model);
            parent.Children.Remove(SelectedNode);
            SelectedNode = parent;

            NotifyStatusChanged();
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        private void ToggleExpand()
        {
            try
            {
                if (SelectedNode == null) return;
                SelectedNode.IsExpanded = !SelectedNode.IsExpanded;
                RequestLayout?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception ex)
            {
                App.ReportError(ex, "노드 접기/펴기");
            }
        }

        private void SetExpandAll(bool expanded)
        {
            try
            {
                var startNode = SelectedNode ?? RootNode;
                if (startNode == null) return;
                SetExpandRecursive(startNode, expanded);
                RequestLayout?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception ex)
            {
                App.ReportError(ex, expanded ? "모두 펼치기" : "모두 접기");
            }
        }

        private static void SetExpandRecursive(NodeViewModel node, bool expanded)
        {
            if (node.Children.Count > 0) node.IsExpanded = expanded;
            foreach (var child in node.Children)
                SetExpandRecursive(child, expanded);
        }

        // ── File I/O ─────────────────────────────────────────────────────────

        private void Open()
        {
            var dlg = new OpenFileDialog { Filter = "Mind Map (*.mmap)|*.mmap|All Files (*.*)|*.*" };
            if (dlg.ShowDialog() != true) return;
            OpenFile(dlg.FileName);
        }

        public void OpenFile(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            try
            {
                var json = File.ReadAllText(path);
                var document = MindMapFileSerializer.Deserialize(json);
                LoadDocument(document);
                _currentFilePath = path;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"파일을 열 수 없습니다:\n{ex.Message}", "열기 오류",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Save()
        {
            if (string.IsNullOrEmpty(_currentFilePath)) SaveAs();
            else SaveToFile(_currentFilePath);
        }

        private void SaveAs()
        {
            var dlg = new SaveFileDialog { Filter = "Mind Map (*.mmap)|*.mmap|All Files (*.*)|*.*" };
            if (dlg.ShowDialog() == true) { _currentFilePath = dlg.FileName; SaveToFile(_currentFilePath); }
        }

        private void ExportDocument(DocumentExportFormat format)
        {
            if (RootNode == null) return;

            try
            {
                SyncAllNodesToModel();

                var dlg = new SaveFileDialog
                {
                    Title = $"마인드맵을 {format.GetDisplayName()}으로 저장",
                    Filter = format.GetSaveFileFilter() + "|모든 파일 (*.*)|*.*",
                    DefaultExt = format.GetExtension(),
                    FileName = BuildExportFileName(format)
                };

                if (dlg.ShowDialog() != true)
                    return;

                MindMapDocumentExporter.Export(
                    RootNode.Model,
                    DocumentTitle,
                    dlg.FileName,
                    format);
            }
            catch (Exception ex)
            {
                App.ReportError(ex, $"{format.GetDisplayName()} 보내기");
            }
        }

        private string BuildExportFileName(DocumentExportFormat format)
        {
            var baseName = DocumentTitle.Trim();
            if (string.IsNullOrEmpty(baseName))
                baseName = "mindmap";

            foreach (var c in Path.GetInvalidFileNameChars())
                baseName = baseName.Replace(c, '_');

            return baseName + format.GetExtension();
        }

        private void SyncAllNodesToModel()
        {
            foreach (var node in GetAllNodes())
                node.SyncToModel();
        }

        private void ExportImage()
        {
            if (RootNode == null) return;

            try
            {
                var owner = Application.Current?.MainWindow;
                var optionsDlg = new Views.ExportImageDialog(DocumentTitle, owner);
                if (optionsDlg.ShowDialog() != true)
                    return;

                var dlg = new SaveFileDialog
                {
                    Title = "마인드맵을 이미지로 저장",
                    Filter = CanvasImageExporter.SaveFileFilter,
                    DefaultExt = ".png",
                    FileName = "mindmap.png"
                };

                if (dlg.ShowDialog() != true)
                    return;

                var format = CanvasImageFormatExtensions.FromExtension(Path.GetExtension(dlg.FileName))
                             ?? CanvasImageFormat.Png;
                var options = CanvasImageExporter.CreateOptionsForFormat(format, optionsDlg.HeadingText);

                if (_exportImageHandler == null)
                {
                    MessageBox.Show("이미지보내기를 사용할 수 없습니다.", "보내기 오류",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                var (success, error) = _exportImageHandler(options, dlg.FileName);
                if (!success)
                {
                    MessageBox.Show($"이미지를 저장할 수 없습니다:\n{error}", "보내기 오류",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                App.ReportError(ex, "이미지 보내기");
            }
        }

        private void SaveToFile(string path)
        {
            if (RootNode == null) return;
            try
            {
                var document = MindMapFileSerializer.CreateFromViewModel(this);
                var json = MindMapFileSerializer.Serialize(document);
                File.WriteAllText(path, json);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"파일을 저장할 수 없습니다:\n{ex.Message}", "저장 오류",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // ── Sample document ───────────────────────────────────────────────────

        /// <summary>앱에 내장된 예제 마인드맵을 로드합니다. 시작 시 자동 호출됩니다.</summary>
        public void LoadSampleDocument()
        {
            try
            {
                var assembly = typeof(MainViewModel).Assembly;
                using var stream = assembly.GetManifestResourceStream("MyMindWin.Assets.sample.mmap");
                if (stream == null) return;

                using var reader = new System.IO.StreamReader(stream, System.Text.Encoding.UTF8);
                var json = reader.ReadToEnd();
                var document = MindMapFileSerializer.Deserialize(json);
                LoadDocument(document);
                _currentFilePath = string.Empty;
                _documentTitle = null;
                OnPropertyChanged(nameof(DocumentTitle));
            }
            catch
            {
                // 로드 실패 시 빈 문서 그대로 유지
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        public string? GetDocumentTitleForSave()
        {
            var title = DocumentTitle.Trim();
            if (string.IsNullOrEmpty(title))
                return null;

            if (RootNode != null && title == RootNode.Text.Trim())
                return null;

            return title;
        }

        private string ResolveDocumentTitle()
        {
            if (!string.IsNullOrWhiteSpace(_documentTitle))
                return _documentTitle.Trim();

            if (!string.IsNullOrEmpty(_currentFilePath))
            {
                var name = Path.GetFileNameWithoutExtension(_currentFilePath);
                if (!string.IsNullOrWhiteSpace(name))
                    return name;
            }

            if (RootNode != null && !string.IsNullOrWhiteSpace(RootNode.Text))
                return RootNode.Text.Trim();

            return "마인드맵";
        }

        private static NodeViewModel BuildViewModel(MindMapNode model, NodeViewModel? parent, int level)
        {
            var vm = new NodeViewModel(model, parent, level);
            foreach (var child in model.Children)
                vm.Children.Add(BuildViewModel(child, vm, level + 1));
            return vm;
        }

        public IEnumerable<NodeViewModel> GetAllNodes()
        {
            if (RootNode == null) return [];
            return RootNode.GetAllDescendants();
        }

        // ── INotifyPropertyChanged ────────────────────────────────────────────

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
