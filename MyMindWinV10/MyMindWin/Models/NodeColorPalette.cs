using System;
using System.Windows;
using System.Windows.Media;

namespace MyMindWin.Models
{
    public static class NodeColorPalette
    {
        public const int InheritColorIndex = -1;
        public const int PaletteCount = 8;

        public static readonly Color RootLight = Color.FromRgb(0xB2, 0xBE, 0xFF);
        public static readonly Color RootDark = Color.FromRgb(0x66, 0x7E, 0xEA);

        public static readonly (Color Light, Color Dark)[] Branch =
        [
            (Color.FromRgb(0x74, 0xB9, 0xFF), Color.FromRgb(0x00, 0x84, 0xD6)),
            (Color.FromRgb(0x55, 0xEF, 0xCB), Color.FromRgb(0x00, 0xB8, 0x94)),
            (Color.FromRgb(0xFF, 0x7F, 0xB5), Color.FromRgb(0xE8, 0x40, 0x83)),
            (Color.FromRgb(0xFF, 0xD3, 0x6E), Color.FromRgb(0xE6, 0x9B, 0x00)),
            (Color.FromRgb(0xA2, 0x9B, 0xFE), Color.FromRgb(0x68, 0x5A, 0xE6)),
            (Color.FromRgb(0x81, 0xEC, 0xEC), Color.FromRgb(0x00, 0xCE, 0xCE)),
            (Color.FromRgb(0xFD, 0xA7, 0xDF), Color.FromRgb(0xE8, 0x4E, 0xCF)),
            (Color.FromRgb(0xFE, 0xB0, 0x8F), Color.FromRgb(0xE8, 0x74, 0x43)),
        ];

        public static readonly string[] BranchNames =
        [
            "하늘색", "민트", "핑크", "노랑", "보라", "청록", "자홍", "주황"
        ];

        public static (Color Light, Color Dark) GetBranch(int colorIndex) =>
            Branch[Math.Abs(colorIndex) % PaletteCount];

        public static string GetDisplayName(int colorIndex) =>
            colorIndex < 0 ? "부모 색 상속" : BranchNames[Math.Abs(colorIndex) % PaletteCount];

        /// <summary>노드 채움용 그라데이션 — 팔레트 Light→Dark 그대로 사용.</summary>
        public static LinearGradientBrush CreateNodeFillBrush(Color light, Color dark)
        {
            var brush = new LinearGradientBrush(light, dark, new Point(0, 0), new Point(1, 1));
            brush.Freeze();
            return brush;
        }

        public static SolidColorBrush CreateFrozenBrush(Color color)
        {
            var brush = new SolidColorBrush(color);
            brush.Freeze();
            return brush;
        }
    }
}
