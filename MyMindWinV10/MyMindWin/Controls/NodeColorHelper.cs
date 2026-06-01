using System.Windows.Media;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    internal static class NodeColorHelper
    {
        public static (Color Light, Color Dark) GetNodeColors(NodeViewModel node) =>
            NodeColorResolver.GetColors(node);

        public static int GetEffectiveBranchIndex(NodeViewModel node)
        {
            if (node.Level == 0)
                return NodeColorPalette.InheritColorIndex;

            if (node.Model.ColorIndex >= 0)
                return node.Model.ColorIndex;

            if (node.Parent?.Level == 0)
                return NodeColorResolver.GetRootChildBranchIndex(node);

            if (node.Parent != null)
                return GetEffectiveBranchIndex(node.Parent);

            return 0;
        }

        public static bool UsesInheritedColor(NodeViewModel node) =>
            node.Level > 0 && node.Model.ColorIndex < 0;
    }
}
