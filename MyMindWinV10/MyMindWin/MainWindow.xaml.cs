using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MyMindWin.Controls;
using MyMindWin.Diagnostics;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin
{
    public partial class MainWindow : Window
    {
        private readonly MainViewModel? _vm;
        private NodeViewModel? _treeEditingNode;
        private string? _treeEditOriginalText;

        public MainWindow()
        {
            InitializeComponent();

            if (DesignerProperties.GetIsInDesignMode(this))
                return;

            _vm = new MainViewModel();
            DataContext = _vm;

            MindMapCanvas.SetViewModel(_vm);
            _vm.RequestNodeColorRefresh += (_, node) =>
            {
                _vm.RefreshInheritColorPreviewIfNeeded(node);
                _vm.RefreshInheritBorderColorPreviewIfNeeded(node);
            };
            _vm.SetExportImageHandler((options, path) =>
            {
                bool ok = MindMapCanvas.TryExportToFile(path, options, out var error);
                return (ok, error);
            });

            // Keyboard shortcuts
            PreviewKeyDown += MainWindow_PreviewKeyDown;

            Loaded += (_, _) =>
            {
                if (!string.IsNullOrEmpty(App.StartupFilePath))
                {
                    // 커맨드라인 또는 파일 연결로 전달된 파일 열기
                    _vm.OpenFile(App.StartupFilePath);
                    App.ClearStartupFilePath();
                }
                else
                {
                    // 시작 시 내장 예제 마인드맵 로드
                    _vm.LoadSampleDocument();
                }
                MindMapCanvas.SetViewToDefaultZoom();
                MindMapCanvas.Focus();
            };
        }

        // ── Tree ↔ Canvas sync ────────────────────────────────────────────

        private void ConnectionLineMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_vm == null) return;
            if (sender is not MenuItem item || item.Tag is not string tag) return;
            _vm.ConnectionLineType = ConnectionLineTypeExtensions.FromJsonValue(tag);
        }

        private bool _suppressTreeSync;
        private bool _suppressStructureTreeLayout;
        private ContextMenu? _activeStructureContextMenu;

        private void StructureTreeItem_ExpandCollapse(object sender, RoutedEventArgs e)
        {
            try
            {
                if (sender is TreeViewItem { DataContext: NodeViewModel vm } item)
                    vm.IsExpanded = item.IsExpanded;

                if (_suppressTreeSync || _suppressStructureTreeLayout)
                    return;

                MindMapCanvas.ScheduleRebuildCanvas();
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "구조 트리 접기/펴기");
            }
        }

        private void StructureTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
        {
            if (_suppressTreeSync) return;
            if (e.NewValue is NodeViewModel vm)
                SelectTreeNode(vm);
        }

        private void StructureTreeItem_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
        {
            try
            {
                if (sender is not TreeViewItem treeItem || treeItem.DataContext is not NodeViewModel vm)
                    return;

                // PreviewMouseRightButtonDown tunnels root→source, so an ancestor TreeViewItem
                // fires before the actual click target. Only handle when the deepest TreeViewItem
                // under the cursor is THIS item (not a descendant).
                var sourceTreeItem = FindAncestor<TreeViewItem>(e.OriginalSource as DependencyObject);
                if (sourceTreeItem != null && sourceTreeItem != treeItem)
                    return;

                e.Handled = true;
                treeItem.Focus();
                treeItem.IsSelected = true;
                SelectTreeNode(vm);
                Keyboard.Focus(StructureTree);

                if (_vm == null) return;

                ShowStructureTreeContextMenu(treeItem, vm);
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "구조 트리 우클릭");
            }
        }

        private void CloseStructureContextMenu()
        {
            if (_activeStructureContextMenu == null) return;
            try
            {
                _activeStructureContextMenu.IsOpen = false;
            }
            catch
            {
                // ignored
            }
            finally
            {
                _activeStructureContextMenu = null;
            }
        }

        private void ShowStructureTreeContextMenu(TreeViewItem treeItem, NodeViewModel vm)
        {
            try
            {
                if (_vm == null) return;

                CloseStructureContextMenu();

                var menu = NodeContextMenuHelper.Build(
                    vm,
                    _vm,
                    this,
                    this,
                    BeginTreeRename,
                    node => MindMapCanvas.OpenNoteForNode(node),
                    node => MindMapCanvas.OpenImageForNode(node),
                    node => MindMapCanvas.RemoveImageFromNode(node),
                    includeExpandAllCommands: true);

                menu.PlacementTarget = treeItem;
                menu.Placement = PlacementMode.MousePoint;
                menu.Closed += (_, _) =>
                {
                    if (ReferenceEquals(_activeStructureContextMenu, menu))
                        _activeStructureContextMenu = null;
                };

                _activeStructureContextMenu = menu;
                CommandManager.InvalidateRequerySuggested();
                menu.IsOpen = true;
            }
            catch (Exception ex)
            {
                ExceptionReporter.Show(ex, "구조 트리 컨텍스트 메뉴");
            }
        }

        private void StructureTree_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (FindAncestor<TreeViewItem>(e.OriginalSource as DependencyObject)?.DataContext is not NodeViewModel vm)
                return;

            BeginTreeRename(vm);
            e.Handled = true;
        }

        private void StructureTree_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (_vm == null || _treeEditingNode != null) return;

            switch (e.Key)
            {
                case Key.Tab when Keyboard.Modifiers == ModifierKeys.None:
                    _vm.AddChildCommand.Execute(null);
                    e.Handled = true;
                    break;
                case Key.Enter when Keyboard.Modifiers == ModifierKeys.None:
                    _vm.AddSiblingCommand.Execute(null);
                    e.Handled = true;
                    break;
                case Key.Delete:
                    _vm.DeleteNodeCommand.Execute(null);
                    e.Handled = true;
                    break;
                case Key.Space:
                    _vm.ToggleExpandCommand.Execute(null);
                    e.Handled = true;
                    break;
                case Key.F2 when _vm.SelectedNode != null:
                    BeginTreeRename(_vm.SelectedNode);
                    e.Handled = true;
                    break;
            }
        }

        private void StructureTreeEditBox_Loaded(object sender, RoutedEventArgs e)
        {
            if (sender is not TextBox box || box.DataContext is not NodeViewModel vm || !vm.IsTreeEditing)
                return;

            box.Focus();
            box.SelectAll();
        }

        private void StructureTreeEditBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                EndTreeRename(commit: true);
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                EndTreeRename(commit: false);
                e.Handled = true;
            }
        }

        private void StructureTreeEditBox_LostFocus(object sender, RoutedEventArgs e)
        {
            if (_treeEditingNode != null && sender is TextBox box && box.DataContext == _treeEditingNode)
                EndTreeRename(commit: true);
        }

        private void StructureTreeEditBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (sender is TextBox box && box.DataContext is NodeViewModel vm && vm.IsTreeEditing)
                MindMapCanvas.RefreshNodeText(vm);
        }

        private void BeginTreeRename(NodeViewModel vm)
        {
            EndTreeRename(commit: true);

            SelectTreeNode(vm);
            EnsureTreeItemVisible(vm);

            _treeEditingNode = vm;
            _treeEditOriginalText = vm.Text;
            vm.IsTreeEditing = true;
        }

        private void EndTreeRename(bool commit)
        {
            if (_treeEditingNode == null) return;

            var node = _treeEditingNode;
            if (!commit && _treeEditOriginalText != null)
                node.Text = _treeEditOriginalText;
            else if (commit && string.IsNullOrWhiteSpace(node.Text) && _treeEditOriginalText != null)
                node.Text = _treeEditOriginalText;

            node.IsTreeEditing = false;
            _treeEditingNode = null;
            _treeEditOriginalText = null;

            if (commit)
                MindMapCanvas.RebuildFromViewModel();
        }

        private void SelectTreeNode(NodeViewModel vm)
        {
            if (_vm == null) return;
            _suppressTreeSync = true;
            _vm.SelectedNode = vm;
            _suppressTreeSync = false;
        }

        private void EnsureTreeItemVisible(NodeViewModel vm)
        {
            _suppressStructureTreeLayout = true;
            try
            {
                for (var node = vm.Parent; node != null; node = node.Parent)
                    node.IsExpanded = true;
            }
            finally
            {
                _suppressStructureTreeLayout = false;
            }

            StructureTree.UpdateLayout();
            FindTreeViewItem(vm)?.BringIntoView();
            MindMapCanvas.ScheduleRebuildCanvas();
        }

        private TreeViewItem? FindTreeViewItem(NodeViewModel vm) =>
            FindTreeViewItem(StructureTree, vm);

        private static TreeViewItem? FindTreeViewItem(ItemsControl parent, object item)
        {
            foreach (var child in parent.Items)
            {
                if (parent.ItemContainerGenerator.ContainerFromItem(child) is not TreeViewItem treeItem)
                    continue;

                if (ReferenceEquals(child, item))
                    return treeItem;

                var found = FindTreeViewItem(treeItem, item);
                if (found != null)
                    return found;
            }

            return null;
        }

        private static T? FindAncestor<T>(DependencyObject? current) where T : DependencyObject
        {
            while (current != null)
            {
                if (current is T match)
                    return match;
                current = VisualTreeHelper.GetParent(current);
            }

            return null;
        }

        // ── Keyboard shortcuts ────────────────────────────────────────────

        private void MainWindow_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (_vm == null) return;

            if (e.Key == Key.N && Keyboard.Modifiers == ModifierKeys.Control)
            {
                _vm.NewDocumentCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.O && Keyboard.Modifiers == ModifierKeys.Control)
            {
                _vm.OpenCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.S && Keyboard.Modifiers == ModifierKeys.Control &&
                     Keyboard.Modifiers != ModifierKeys.Shift)
            {
                _vm.SaveCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.S &&
                     Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
            {
                _vm.SaveAsCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.F5)
            {
                _vm.AutoLayoutCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == Key.F4)
            {
                _vm.ResetViewCommand.Execute(null);
                e.Handled = true;
            }
        }
    }
}
