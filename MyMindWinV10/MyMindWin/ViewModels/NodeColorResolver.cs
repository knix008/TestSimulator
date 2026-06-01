using System.Windows.Media;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public static class NodeColorResolver
    {
        public static (Color Light, Color Dark) GetColors(NodeViewModel node)
        {
            if (node.Level == 0)
                return (NodeColorPalette.RootLight, NodeColorPalette.RootDark);

            if (node.Model.ColorIndex >= 0)
                return NodeColorPalette.GetBranch(node.Model.ColorIndex);

            if (node.Parent == null)
                return NodeColorPalette.GetBranch(0);

            if (node.Parent.Level == 0)
                return NodeColorPalette.GetBranch(GetRootChildBranchIndex(node));

            return GetColors(node.Parent);
        }

        /// <summary>루트 직계 자식의 기본(상속) 가지 색 인덱스 — 형제 순서 기준.</summary>
        public static int GetRootChildBranchIndex(NodeViewModel node)
        {
            if (node.Parent == null || node.Parent.Level != 0)
                return 0;

            int index = node.Parent.Children.IndexOf(node);
            if (index < 0)
                index = node.Parent.Children.Count;

            return index % NodeColorPalette.PaletteCount;
        }
    }
}
