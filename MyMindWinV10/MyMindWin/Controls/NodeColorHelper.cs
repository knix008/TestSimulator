using System.Windows.Media;
using MyMindWin.Models;
using MyMindWin.ViewModels;

namespace MyMindWin.Controls
{
    internal static class NodeColorHelper
    {
        public static (Color Light, Color Dark) GetNodeColors(NodeViewModel node) =>
            NodeColorResolver.GetColors(node);

        public static int GetEffectiveBranchIndex(NodeViewModel node) =>
            NodeColorResolver.ResolveColorIndex(node);

        public static bool UsesInheritedColor(NodeViewModel node) =>
            node.Level > 0 && node.Model.ColorIndex < 0;
    }
}
