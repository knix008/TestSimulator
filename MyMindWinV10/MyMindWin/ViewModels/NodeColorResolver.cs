using System.Windows.Media;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public static class NodeColorResolver
    {
        public static (Color Light, Color Dark) GetColors(NodeViewModel node)
        {
            if (node.Level == 0)
            {
                if (node.Model.ColorIndex >= 0)
                    return NodeColorPalette.GetBranch(node.Model.ColorIndex);

                return (NodeColorPalette.RootLight, NodeColorPalette.RootDark);
            }

            return NodeColorPalette.GetBranch(ResolveColorIndex(node));
        }

        /// <summary>노드에 실제로 적용되는 팔레트 인덱스 (0~7).</summary>
        public static int ResolveColorIndex(NodeViewModel node)
        {
            if (node.Level == 0)
            {
                return node.Model.ColorIndex >= 0
                    ? node.Model.ColorIndex % NodeColorPalette.PaletteCount
                    : 0;
            }

            if (node.Model.ColorIndex >= 0)
                return node.Model.ColorIndex % NodeColorPalette.PaletteCount;

            if (node.Parent == null)
                return 0;

            if (node.Parent.Level == 0)
            {
                if (node.Parent.Model.ColorIndex >= 0)
                    return node.Parent.Model.ColorIndex % NodeColorPalette.PaletteCount;

                return GetRootChildBranchIndex(node);
            }

            return ResolveColorIndex(node.Parent);
        }

        /// <summary>루트 직계 자식의 기본(상속) 가지 색 인덱스 — 형제 순서 기준.</summary>
        public static int GetRootChildBranchIndex(NodeViewModel node)
        {
            if (node.Parent == null || node.Parent.Level != 0)
                return 0;

            int index = node.Parent.Children.IndexOf(node);
            if (index < 0)
                index = 0;

            return index % NodeColorPalette.PaletteCount;
        }
    }
}
