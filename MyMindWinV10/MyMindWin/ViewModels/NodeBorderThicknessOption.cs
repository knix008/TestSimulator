using System.Windows;
using MyMindWin.Models;

namespace MyMindWin.ViewModels
{
    public sealed record NodeBorderThicknessOption(double? Thickness, string Label)
    {
        public double PreviewThickness => Thickness ?? 2.5;

        public Thickness PreviewBorderThickness => new(PreviewThickness);

        public static NodeBorderThicknessOption FromPreset(double? thickness) =>
            new(thickness, NodeBorderThicknessPresets.GetDisplayName(thickness));
    }
}
