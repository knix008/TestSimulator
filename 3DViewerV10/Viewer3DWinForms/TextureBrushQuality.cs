using System.Windows;
using System.Windows.Media;

namespace Viewer3DWinForms;

/// <summary>
/// WPF 3D에서 UV로 늘린 텍스처가 저해상도 필터로 샘플링되는 현상을 줄입니다.
/// </summary>
internal static class TextureBrushQuality
{
    public static void ApplyToBrush(ImageBrush brush)
    {
        RenderOptions.SetBitmapScalingMode(brush, BitmapScalingMode.Fant);
    }

    public static void ApplyToViewport(DependencyObject viewport)
    {
        RenderOptions.SetBitmapScalingMode(viewport, BitmapScalingMode.Fant);
    }
}
