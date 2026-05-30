using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    public static class NodeContextMenuHelper
    {
        public static ContextMenu Build(
            NodeViewModel node,
            MainViewModel vm,
            FrameworkElement resourceOwner,
            IInputElement? commandTarget = null,
            Action<NodeViewModel>? onRename = null)
        {
            var menu = new ContextMenu
            {
                Style = (Style)resourceOwner.FindResource("NodeContextMenu")
            };

            menu.Items.Add(CreateCommandItem(resourceOwner, "자식 노드 추가", "Tab",
                vm.AddChildCommand, commandTarget, MenuIcons.AddChild));

            if (node.Parent != null)
            {
                menu.Items.Add(CreateCommandItem(resourceOwner, "형제 노드 추가", "Enter",
                    vm.AddSiblingCommand, commandTarget, MenuIcons.AddSibling));
            }

            menu.Items.Add(new Separator { Style = (Style)resourceOwner.FindResource("NodeContextMenuSeparator") });

            var rename = CreateItem(resourceOwner, "이름 바꾸기", "F2", MenuIcons.Rename);
            rename.Click += (_, _) => onRename?.Invoke(node);
            menu.Items.Add(rename);

            if (node.Children.Count > 0)
            {
                string expandLabel = node.IsExpanded ? "접기" : "펼치기";
                var expandIcon = node.IsExpanded ? MenuIcons.Collapse : MenuIcons.Expand;
                menu.Items.Add(CreateCommandItem(resourceOwner, expandLabel, "Space",
                    vm.ToggleExpandCommand, commandTarget, expandIcon));
            }

            menu.Items.Add(new Separator { Style = (Style)resourceOwner.FindResource("NodeContextMenuSeparator") });

            if (node.Parent != null)
            {
                menu.Items.Add(CreateCommandItem(resourceOwner, "삭제", "Del",
                    vm.DeleteNodeCommand, commandTarget, MenuIcons.Delete));
            }

            return menu;
        }

        private static MenuItem CreateCommandItem(
            FrameworkElement resourceOwner,
            string header,
            string gesture,
            ICommand command,
            IInputElement? commandTarget,
            UIElement icon)
        {
            var item = CreateItem(resourceOwner, header, gesture, icon);
            item.Command = command;
            if (commandTarget is UIElement target)
                item.CommandTarget = target;
            return item;
        }

        private static MenuItem CreateItem(
            FrameworkElement resourceOwner, string header, string gesture, UIElement icon)
        {
            return new MenuItem
            {
                Header = header,
                Icon = icon,
                InputGestureText = gesture,
                Style = (Style)resourceOwner.FindResource("NodeContextMenuItem")
            };
        }

        private static class MenuIcons
        {
            private static readonly Brush IconFill = new SolidColorBrush(Color.FromRgb(0xA8, 0xC8, 0xFF));

            public static UIElement AddChild => Create("M 7,2 L 7,12 M 2,7 L 12,7");
            public static UIElement AddSibling => Create("M 1,7 L 4,7 M 10,7 L 13,7 M 7,4 L 7,10");
            public static UIElement Rename => Create("M 2,10 L 10,2 L 12,4 L 4,12 Z M 2,12 L 4,12");
            public static UIElement Expand => Create("M 2,5 L 7,10 L 12,5");
            public static UIElement Collapse => Create("M 2,10 L 7,5 L 12,10");
            public static UIElement Delete => Create("M 3,4 L 11,4 M 5,4 L 5,2 L 9,2 L 9,4 M 4,4 L 5,11 L 9,11 L 10,4");

            private static UIElement Create(string geometry) => new Path
            {
                Data = Geometry.Parse(geometry),
                Fill = IconFill,
                Width = 14,
                Height = 14,
                Stretch = Stretch.Uniform,
                StrokeThickness = 0
            };
        }
    }
}
