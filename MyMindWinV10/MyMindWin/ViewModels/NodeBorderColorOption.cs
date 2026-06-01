using System.Windows.Media;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public sealed record NodeBorderColorOption(int ColorIndex, string Label, Color PreviewColor)
    {
        public Brush PreviewBrush => NodeColorPalette.CreateFrozenBrush(PreviewColor);

        public static NodeBorderColorOption ForInherit(Color preview) => new(
            NodeBorderPalette.InheritColorIndex,
            NodeBorderPalette.GetDisplayName(NodeBorderPalette.InheritColorIndex),
            preview);

        public static NodeBorderColorOption White() => new(
            NodeBorderPalette.WhiteColorIndex,
            NodeBorderPalette.GetDisplayName(NodeBorderPalette.WhiteColorIndex),
            Colors.White);

        public static NodeBorderColorOption FromPaletteIndex(int index)
        {
            var (light, _) = NodeColorPalette.GetBranch(index);
            return new(index, NodeBorderPalette.GetDisplayName(index), light);
        }
    }
}
