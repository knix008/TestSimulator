using System.Windows.Media;

namespace MyMindWin.Models
{
    public sealed class CanvasImageExportOptions
    {
        public CanvasImageFormat Format { get; init; } = CanvasImageFormat.Png;

        /// <summary>렌더 해상도 배율 (1 = 96 DPI, 2 = 고해상도).</summary>
        public double Scale { get; init; } = 2.0;

        /// <summary>PNG/WebP/AVIF/GIF: true면 배경 투명. JPEG는 항상 불투명.</summary>
        public bool TransparentBackground { get; init; } = true;

        public Color OpaqueBackgroundColor { get; init; } = Color.FromRgb(0x1A, 0x1F, 0x2E);

        public int JpegQuality { get; init; } = 92;

        public int WebpQuality { get; init; } = 90;

        /// <summary>AVIF CQ level (낮을수록 고품질, 일반적으로 18~40).</summary>
        public int AvifCqLevel { get; init; } = 28;

        /// <summary>이미지 상단 Heading. null/빈 문자열이면 표시하지 않습니다.</summary>
        public string? Heading { get; init; }
    }
}
