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
            Action<NodeViewModel>? onRename = null,
            Action<NodeViewModel>? onNote = null,
            Action<NodeViewModel>? onImage = null,
            Action<NodeViewModel>? onRemoveImage = null,
            bool includeExpandAllCommands = false)
        {
            var menu = new ContextMenu();
            if (TryFindStyle(resourceOwner, "NodeContextMenu") is Style menuStyle)
                menu.Style = menuStyle;

            menu.Items.Add(CreateCommandItem(resourceOwner, "자식 노드 추가", "Tab",
                vm.AddChildCommand, commandTarget, MenuIcons.AddChild));

            if (node.Parent != null)
            {
                menu.Items.Add(CreateCommandItem(resourceOwner, "형제 노드 추가", "Enter",
                    vm.AddSiblingCommand, commandTarget, MenuIcons.AddSibling));
            }

            if (TryFindStyle(resourceOwner, "NodeContextMenuSeparator") is Style sepStyle)
                menu.Items.Add(new Separator { Style = sepStyle });
            else
                menu.Items.Add(new Separator());

            var rename = CreateItem(resourceOwner, "이름 바꾸기", "F2", MenuIcons.Rename);
            rename.Click += (_, _) => onRename?.Invoke(node);
            menu.Items.Add(rename);

            var noteItem = CreateItem(resourceOwner, node.HasNote ? "노트 편집" : "노트 추가", string.Empty, MenuIcons.Note);
            noteItem.Click += (_, _) => onNote?.Invoke(node);
            menu.Items.Add(noteItem);

            var imageItem = CreateItem(resourceOwner, node.HasImage ? "그림 보기" : "그림 추가", string.Empty, MenuIcons.Image);
            imageItem.Click += (_, _) => onImage?.Invoke(node);
            menu.Items.Add(imageItem);

            if (node.HasImage && onRemoveImage != null)
            {
                var removeImage = CreateItem(resourceOwner, "그림 제거", string.Empty, MenuIcons.Delete);
                removeImage.Click += (_, _) => onRemoveImage(node);
                menu.Items.Add(removeImage);
            }

            if (node.Children.Count > 0)
            {
                string expandLabel = node.IsExpanded ? "접기" : "펼치기";
                var expandIcon = node.IsExpanded ? MenuIcons.Collapse : MenuIcons.Expand;
                menu.Items.Add(CreateCommandItem(resourceOwner, expandLabel, "Space",
                    vm.ToggleExpandCommand, commandTarget, expandIcon));
            }

            if (includeExpandAllCommands)
            {
                menu.Items.Add(CreateCommandItem(resourceOwner, "모두 펼치기", string.Empty,
                    vm.ExpandAllCommand, commandTarget, MenuIcons.Expand));
                menu.Items.Add(CreateCommandItem(resourceOwner, "모두 접기", string.Empty,
                    vm.CollapseAllCommand, commandTarget, MenuIcons.Collapse));
            }

            if (TryFindStyle(resourceOwner, "NodeContextMenuSeparator") is Style sepStyle2)
                menu.Items.Add(new Separator { Style = sepStyle2 });
            else
                menu.Items.Add(new Separator());

            if (node.Parent != null)
            {
                menu.Items.Add(CreateCommandItem(resourceOwner, "삭제", "Del",
                    vm.DeleteNodeCommand, commandTarget, MenuIcons.Delete));
            }

            return menu;
        }

        private static Style? TryFindStyle(FrameworkElement owner, string key)
        {
            if (owner.TryFindResource(key) is Style style)
                return style;
            return Application.Current.TryFindResource(key) as Style;
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
            var item = new MenuItem
            {
                Header = header,
                Icon = icon,
                InputGestureText = gesture
            };
            if (TryFindStyle(resourceOwner, "NodeContextMenuItem") is Style itemStyle)
                item.Style = itemStyle;
            return item;
        }

        private static class MenuIcons
        {
            private static readonly Brush IconBrush;

            static MenuIcons()
            {
                IconBrush = new SolidColorBrush(Color.FromRgb(0xD8, 0xE8, 0xFF));
                IconBrush.Freeze();
            }

            public static UIElement AddChild =>
                LineIcon("M 8,3 L 8,13 M 3,8 L 13,8", 1.7);

            public static UIElement AddSibling =>
                LineIcon("M 2,8 L 5,8 M 11,8 L 14,8 M 8,5 L 8,11", 1.6);

            public static UIElement Rename =>
                LineIcon("M 3,13 L 11,5 M 11,5 L 13,7 M 9,3 L 11,5", 1.5);

            public static UIElement Expand =>
                LineIcon("M 3,6 L 8,11 L 13,6", 1.7);

            public static UIElement Collapse =>
                LineIcon("M 3,10 L 8,5 L 13,10", 1.7);

            public static UIElement Delete =>
                LineIcon("M 4,4 L 12,4 M 6,4 L 6,2 L 10,2 L 10,4 M 5,5 L 6,12 L 10,12 L 11,5", 1.4);

            public static UIElement Note =>
                LineIcon("M 4,3 L 12,3 L 12,12 L 4,12 Z M 6,6 L 10,6 M 6,9 L 10,9", 1.3);

            public static UIElement Image =>
                LineIcon("M 3,10 L 6,7 L 8,9 L 11,5 L 13,7 L 13,12 L 3,12 Z M 5,5 A 1,1 0 1 0 5,7 A 1,1 0 1 0 5,5", 1.3);

            private static UIElement LineIcon(string geometry, double thickness) => new Path
            {
                Data = Geometry.Parse(geometry),
                Stroke = IconBrush,
                StrokeThickness = thickness,
                StrokeLineJoin = PenLineJoin.Round,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap = PenLineCap.Round,
                Fill = Brushes.Transparent,
                Width = 16,
                Height = 16,
                Stretch = Stretch.Uniform
            };
        }
    }
}
