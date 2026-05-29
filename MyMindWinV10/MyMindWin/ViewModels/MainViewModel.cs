using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public enum LayoutType { HorizontalTree, Radial }

    public class MainViewModel : INotifyPropertyChanged
    {
        private NodeViewModel? _rootNode;
        private NodeViewModel? _selectedNode;
        private LayoutType _layoutType = LayoutType.HorizontalTree;
        private double _zoomLevel = 1.0;
        private string _currentFilePath = string.Empty;

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
            }
        }

        public LayoutType LayoutType
        {
            get => _layoutType;
            set { _layoutType = value; OnPropertyChanged(); RequestLayout?.Invoke(this, EventArgs.Empty); }
        }

        public double ZoomLevel
        {
            get => _zoomLevel;
            set { _zoomLevel = Math.Clamp(value, 0.15, 4.0); OnPropertyChanged(); }
        }

        // ── Events ───────────────────────────────────────────────────────────

        public event EventHandler? RequestLayout;
        public event EventHandler? RequestReset;

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
        public ICommand SetLayoutRadialCommand { get; }
        public ICommand SetLayoutTreeCommand { get; }

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
            ResetViewCommand = new RelayCommand(_ => RequestReset?.Invoke(this, EventArgs.Empty));
            SetLayoutRadialCommand = new RelayCommand(_ => LayoutType = LayoutType.Radial);
            SetLayoutTreeCommand = new RelayCommand(_ => LayoutType = LayoutType.HorizontalTree);

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

        public void SetRoot(MindMapNode model)
        {
            RootNode = BuildViewModel(model, null, 0);
            AssignBranchColors(RootNode);
            SelectedNode = RootNode;
            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        // ── Node Operations ───────────────────────────────────────────────────

        public void AddChild()
        {
            if (SelectedNode == null) return;

            var newModel = new MindMapNode { Text = "New Node" };
            SelectedNode.Model.Children.Add(newModel);

            var newVm = new NodeViewModel(newModel, SelectedNode, SelectedNode.Level + 1)
            {
                BranchColorIndex = SelectedNode.Level == 0
                    ? SelectedNode.Children.Count
                    : SelectedNode.BranchColorIndex
            };
            SelectedNode.Children.Add(newVm);
            SelectedNode.IsExpanded = true;
            SelectedNode = newVm;

            RequestLayout?.Invoke(this, EventArgs.Empty);
        }

        public void AddSibling()
        {
            if (SelectedNode?.Parent == null) return;

            var newModel = new MindMapNode { Text = "New Node" };
            var parent = SelectedNode.Parent;
            int idx = parent.Model.Children.IndexOf(SelectedNode.Model);
            parent.Model.Children.Insert(idx + 1, newModel);

            var newVm = new NodeViewModel(newModel, parent, SelectedNode.Level)
            {
                BranchColorIndex = SelectedNode.BranchColorIndex
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
            try
            {
                var json = File.ReadAllText(dlg.FileName);
                var root = JsonSerializer.Deserialize<MindMapNode>(json);
                if (root != null) { SetRoot(root); _currentFilePath = dlg.FileName; }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error opening file:\n{ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
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
                var json = JsonSerializer.Serialize(RootNode.Model,
                    new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error saving file:\n{ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
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
