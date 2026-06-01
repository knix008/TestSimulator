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

        // ── Properties ──────────────────────────────────────────────────────

        public NodeViewModel? RootNode
        {
            get => _rootNode;
            private set { _rootNode = value; OnPropertyChanged(); OnPropertyChanged(nameof(RootNodes)); }
        }

        public IEnumerable<NodeViewModel> RootNodes =>
            _rootNode != null ? [_rootNode] : [];

        public NodeViewModel? SelectedNode
        {
            get => _selectedNode;
            set
            {
                if (_selectedNode != null) _selectedNode.IsSelected = false;
                _selectedNode = value;
                if (_selectedNode != null) _selectedNode.IsSelected = true;
                OnPropertyChanged();
                OnPropertyChanged(nameof(HasSelectedNode));
                SyncShapeComboFromSelectedNode();
                SyncColorComboFromSelectedNode();
            }
        }

        public bool HasSelectedNode => SelectedNode != null;

        public bool CanEditNodeColor => SelectedNode is { Level: > 0 };

        public ObservableCollection<NodeColorOption> NodeColorOptions { get; } = BuildNodeColorOptions();

        public int SelectedNodeColorIndex
        {
            get
            {
                if (SelectedNode == null || SelectedNode.Level == 0)
                    return NodeColorPalette.InheritColorIndex;

                return SelectedNode.Model.ColorIndex;
            }
            set
            {
                if (_syncingColorCombo || SelectedNode == null || SelectedNode.Level == 0)
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

            bool restoreInheritSelection = SelectedNode is { Level: > 0, Model.ColorIndex: < 0 };
            NodeColorOptions.RemoveAt(0);
            NodeColorOptions.Insert(0, inherit);

            if (restoreInheritSelection)
            {
                _syncingColorCombo = true;
                OnPropertyChanged(nameof(SelectedNodeColorIndex));
                _syncingColorCombo = false;
            }
        }

        private NodeColorOption BuildInheritColorOption()
        {
            if (SelectedNode == null || SelectedNode.Level == 0)
            {
                return NodeColorOption.ForInherit(NodeColorPalette.RootLight, NodeColorPalette.RootDark);
            }

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
            _layoutFlipHorizontal = false;
            _layoutFlipVertical = false;
            OnPropertyChanged(nameof(LayoutFlipHorizontal));
            OnPropertyChanged(nameof(LayoutFlipVertical));

            var root = new MindMapNode { Text = "Main Topic", IsExpanded = true };
            AddSampleNodes(root);
            SetRoot(root);
            _currentFilePath = string.Empty;
            _documentTitle = null;
            _defaultNodeShape = NodeShapeKind.RoundedRectangle;
            _shapeComboSelection = NodeShapeKind.RoundedRectangle;
            OnPropertyChanged(nameof(DocumentTitle));
            OnPropertyChanged(nameof(DefaultNodeShape));
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));
        }

        private static void AddSampleNodes(MindMapNode root)
        {
            var b1 = new MindMapNode { Text = "Idea 1", IsExpanded = true };
            b1.Children.Add(new MindMapNode { Text = "Detail A" });
            b1.Children.Add(new MindMapNode { Text = "Detail B" });

            var b2 = new MindMapNode { Text = "Idea 2", IsExpanded = true };
            b2.Children.Add(new MindMapNode { Text = "Detail C" });
            b2.Children.Add(new MindMapNode { Text = "Detail D" });

            var b3 = new MindMapNode { Text = "Idea 3", IsExpanded = true };
            b3.Children.Add(new MindMapNode { Text = "Detail E" });

            var b4 = new MindMapNode { Text = "Idea 4", IsExpanded = false };
            b4.Children.Add(new MindMapNode { Text = "Hidden Item" });

            root.Children.AddRange([b1, b2, b3, b4]);
        }

        public void SetRoot(MindMapNode model, LayoutType? layout = null)
        {
            if (layout.HasValue)
                _layoutType = layout.Value;

            RootNode = BuildViewModel(model, null, 0);
            SelectedNode = RootNode;
            OnPropertyChanged(nameof(DocumentTitle));
            OnPropertyChanged(nameof(LayoutType));
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
            if (SelectedNode == null || SelectedNode.Level == 0)
                return;

            SelectedNode.NodeColorIndex = colorIndex;
            _syncingColorCombo = true;
            RefreshInheritColorPreview();
            OnPropertyChanged(nameof(SelectedNodeColorIndex));
            _syncingColorCombo = false;
            RequestNodeColorRefresh?.Invoke(this, SelectedNode);
        }

        /// <summary>부모 색 변경 등으로 상속 색이 바뀐 뒤 속성창 견본을 맞춥니다.</summary>
        public void RefreshInheritColorPreviewIfNeeded(NodeViewModel changedNode)
        {
            if (SelectedNode == null || SelectedNode.Level == 0)
                return;

            if (SelectedNode.Model.ColorIndex >= 0)
                return;

            if (SelectedNode == changedNode || IsAncestor(changedNode, SelectedNode))
                RefreshInheritColorPreview();
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
            _syncingShapeCombo = true;
            _shapeComboSelection = shape;
            OnPropertyChanged(nameof(ShapeComboSelection));
            OnPropertyChanged(nameof(SelectedShapeOption));
            _syncingShapeCombo = false;
            RequestNodeShapeRefresh?.Invoke(this, SelectedNode);
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

            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void DeleteNode()
        {
            if (SelectedNode?.Parent == null) return;

            var parent = SelectedNode.Parent;
            parent.Model.Children.Remove(SelectedNode.Model);
            parent.Children.Remove(SelectedNode);
            SelectedNode = parent;

            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        private void ToggleExpand()
        {
            if (SelectedNode == null) return;
            SelectedNode.IsExpanded = !SelectedNode.IsExpanded;
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        private void SetExpandAll(bool expanded)
        {
            if (RootNode == null) return;
            SetExpandRecursive(RootNode, expanded);
            RequestLayout?.Invoke(this, EventArgs.Empty);
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

            try
            {
                MindMapDocumentExporter.Export(
                    RootNode.Model,
                    DocumentTitle,
                    dlg.FileName,
                    format);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"{format.GetDisplayName()} 파일을 저장할 수 없습니다:\n{ex.Message}",
                    "보내기 오류",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
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

            var optionsDlg = new Views.ExportImageDialog(DocumentTitle,
                Application.Current?.MainWindow as Window);
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

            var format = CanvasImageFormatExtensions.FromExtension(System.IO.Path.GetExtension(dlg.FileName))
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
