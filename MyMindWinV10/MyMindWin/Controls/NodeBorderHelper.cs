using System.Windows.Media;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    internal static class NodeBorderHelper
    {
        public static Color ResolveBorderColor(NodeViewModel node)
        {
            int idx = node.Model.BorderColorIndex;

            if (idx == NodeBorderPalette.WhiteColorIndex)
                return Colors.White;

            if (idx >= 0)
                return NodeColorPalette.GetBranch(idx).Light;

            // inherit: 선택 + 두께 자동일 때 흰 테두리로 강조
            if (node.IsSelected && !node.Model.BorderThickness.HasValue)
                return Colors.White;

            return NodeColorResolver.GetColors(node).Light;
        }

        public static double ResolveBorderThickness(NodeViewModel node)
        {
            if (node.Model.BorderThickness.HasValue)
                return node.Model.BorderThickness.Value;

            return node.IsSelected ? 2.5 : 1.0;
        }

        public static (Brush Brush, double Thickness) GetBorder(NodeViewModel node)
        {
            var color = ResolveBorderColor(node);
            return (NodeColorPalette.CreateFrozenBrush(color), ResolveBorderThickness(node));
        }
    }
}
