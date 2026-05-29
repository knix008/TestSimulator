using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public sealed record NodeShapeOption(NodeShapeKind Kind, string Label);

    public enum LayoutType { HorizontalTree, Radial }

    public class MainViewModel : INotifyPropertyChanged
    {
        private NodeViewModel? _rootNode;
        private NodeViewModel? _selectedNode;
        private LayoutType _layoutType = LayoutType.HorizontalTree;
        private double _zoomLevel = 1.0;
        private string _currentFilePath = string.Empty;
        private NodeShapeKind _shapeComboSelection = NodeShapeKind.RoundedRectangle;
        private bool _syncingShapeCombo;

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
            }
        }

        public bool HasSelectedNode => SelectedNode != null;

        public IReadOnlyList<NodeShapeOption> ShapeOptions { get; } =
            Enum.GetValues<NodeShapeKind>()
                .Select(k => new NodeShapeOption(k, k.GetDisplayName()))
                .ToArray();

        public NodeShapeKind ShapeComboSelection
        {
            get => _shapeComboSelection;
            set
            {
                if (_syncingShapeCombo || _shapeComboSelection == value) return;
                _shapeComboSelection = value;
                OnPropertyChanged();
                if (SelectedNode != null && SelectedNode.Shape != value)
                    ApplyShapeToSelected(value);
            }
        }

        public LayoutType LayoutType
        {
            get => _layoutType;
            set { _layoutType = value; OnPropertyChanged(); }
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
        public event EventHandler<NodeViewModel>? RequestNodeShapeRefresh;

        // ── Commands ─────────────────────────────────────────────────────────

        public ICommand NewDocumentCommand { get; }
        public ICommand OpenCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand SaveAsCommand { get; }
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
        public ICommand SetLayoutTreeCommand { get; }
        public ICommand SetShapeCommand { get; }

        public MainViewModel()
        {
            NewDocumentCommand = new RelayCommand(_ => NewDocument());
            OpenCommand = new RelayCommand(_ => Open());
            SaveCommand = new RelayCommand(_ => Save());
            SaveAsCommand = new RelayCommand(_ => SaveAs());
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
            SetLayoutTreeCommand = new RelayCommand(_ => ApplyLayout(LayoutType.HorizontalTree), _ => RootNode != null);
            SetShapeCommand = new RelayCommand(SetShapeFromParameter, _ => SelectedNode != null);

            NewDocument();
        }

        // ── Document Operations ───────────────────────────────────────────────

        private void NewDocument()
        {
            var root = new MindMapNode { Text = "Main Topic", IsExpanded = true };
            AddSampleNodes(root);
            SetRoot(root);
            _currentFilePath = string.Empty;
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
            if (!ModelHasBranchColors(model))
                AssignBranchColors(RootNode);
            SelectedNode = RootNode;
            OnPropertyChanged(nameof(LayoutType));
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void LoadDocument(MindMapDocument document)
        {
            var layout = MindMapFileSerializer.ParseLayout(document.Layout);
            SetRoot(document.Root, layout);
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
            _shapeComboSelection = SelectedNode?.Shape ?? NodeShapeKind.RoundedRectangle;
            OnPropertyChanged(nameof(ShapeComboSelection));
            _syncingShapeCombo = false;
        }

        private void ApplyShapeToSelected(NodeShapeKind shape)
        {
            if (SelectedNode == null || SelectedNode.Shape == shape) return;
            SelectedNode.Shape = shape;
            _syncingShapeCombo = true;
            _shapeComboSelection = shape;
            OnPropertyChanged(nameof(ShapeComboSelection));
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
            ApplyShapeToSelected(shape);
        }

        // ── Node Operations ───────────────────────────────────────────────────

        public void AddChild()
        {
            if (SelectedNode == null) return;

            var newModel = new MindMapNode
            {
                Text = "New Node",
                Shape = SelectedNode.Shape.ToJsonValue()
            };
            SelectedNode.Model.Children.Add(newModel);

            var newVm = new NodeViewModel(newModel, SelectedNode, SelectedNode.Level + 1)
            {
                BranchColorIndex = SelectedNode.Level == 0
                    ? SelectedNode.Children.Count
                    : SelectedNode.BranchColorIndex,
                Shape = SelectedNode.Shape
            };
            SelectedNode.Children.Add(newVm);
            SelectedNode.IsExpanded = true;
            SelectedNode = newVm;

            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void AddSibling()
        {
            if (SelectedNode?.Parent == null) return;

            var newModel = new MindMapNode
            {
                Text = "New Node",
                Shape = SelectedNode.Shape.ToJsonValue()
            };
            var parent = SelectedNode.Parent;
            int idx = parent.Model.Children.IndexOf(SelectedNode.Model);
            parent.Model.Children.Insert(idx + 1, newModel);

            var newVm = new NodeViewModel(newModel, parent, SelectedNode.Level)
            {
                BranchColorIndex = SelectedNode.BranchColorIndex,
                Shape = SelectedNode.Shape
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

        private static NodeViewModel BuildViewModel(MindMapNode model, NodeViewModel? parent, int level)
        {
            var vm = new NodeViewModel(model, parent, level);
            foreach (var child in model.Children)
                vm.Children.Add(BuildViewModel(child, vm, level + 1));
            return vm;
        }

        private static bool ModelHasBranchColors(MindMapNode node)
        {
            foreach (var child in node.Children)
            {
                if (child.ColorIndex >= 0) return true;
                if (ModelHasBranchColors(child)) return true;
            }
            return false;
        }

        private static void AssignBranchColors(NodeViewModel root)
        {
            root.BranchColorIndex = -1;
            int idx = 0;
            foreach (var child in root.Children)
                SetBranchColor(child, idx++);
        }

        private static void SetBranchColor(NodeViewModel node, int colorIndex)
        {
            node.BranchColorIndex = colorIndex;
            foreach (var child in node.Children)
                SetBranchColor(child, colorIndex);
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
