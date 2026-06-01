using System;
using System.Windows;
using System.Windows.Media;

namespace MyMindWin.Controls
{
    /// <summary>100×60 뷰박스 기준 PathGeometry — Stretch.Fill로 노드 크기에 맞춤.</summary>
    internal static class NodeShapeGeometries
    {
        private static readonly Geometry Cloud = ParseFrozen(
            "M 24,42 C 6,42 4,28 16,22 C 10,10 26,6 36,14 C 46,4 62,8 58,20 " +
            "C 74,14 92,20 90,34 C 98,40 88,48 72,46 C 78,56 58,58 48,52 C 36,58 26,54 24,42 Z");

        private static readonly Geometry Hexagon = ParseFrozen(
            "M 50,4 L 90,30 L 90,54 L 50,58 L 10,54 L 10,30 Z");

        private static readonly Geometry SpeechBubble = ParseFrozen(
            "M 12,8 L 88,8 Q 96,8 96,16 L 96,40 Q 96,48 88,48 L 38,48 L 28,58 L 30,48 L 12,48 Q 4,48 4,40 L 4,16 Q 4,8 12,8 Z");

        private static readonly Geometry Star = ParseFrozen(
            "M 50,4 L 60,34 L 92,34 L 66,52 L 76,58 L 50,42 L 24,58 L 34,52 L 8,34 L 40,34 Z");

        private static readonly Geometry Parallelogram = ParseFrozen(
            "M 18,8 L 92,8 L 82,52 L 8,52 Z");

        public static Geometry GetGeometry(Models.NodeShapeKind shape) => shape switch
        {
            Models.NodeShapeKind.Cloud => Cloud,
            Models.NodeShapeKind.Hexagon => Hexagon,
            Models.NodeShapeKind.SpeechBubble => SpeechBubble,
            Models.NodeShapeKind.Star => Star,
            Models.NodeShapeKind.Parallelogram => Parallelogram,
            _ => Cloud
        };

        public static bool IsCustomPathShape(Models.NodeShapeKind shape) =>
            shape is Models.NodeShapeKind.Cloud
                or Models.NodeShapeKind.Hexagon
                or Models.NodeShapeKind.SpeechBubble
                or Models.NodeShapeKind.Star
                or Models.NodeShapeKind.Parallelogram;

        private static Geometry ParseFrozen(string pathData)
        {
            var geometry = Geometry.Parse(pathData);
            geometry.Freeze();
            return geometry;
        }
    }
}
