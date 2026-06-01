using System.Windows.Media;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public sealed record NodeColorOption(int ColorIndex, string Label, Color Light, Color Dark)
    {
        public static NodeColorOption ForInherit(Color light, Color dark) => new(
            NodeColorPalette.InheritColorIndex,
            NodeColorPalette.GetDisplayName(NodeColorPalette.InheritColorIndex),
            light,
            dark);

        public static NodeColorOption FromPaletteIndex(int index)
        {
            var (light, dark) = NodeColorPalette.GetBranch(index);
            return new(index, NodeColorPalette.GetDisplayName(index), light, dark);
        }
    }
}
