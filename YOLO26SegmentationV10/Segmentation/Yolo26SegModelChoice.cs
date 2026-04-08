using System.Collections.Generic;

namespace YOLO26SegmentationV10.Segmentation
{
    /// <summary>YOLO26-seg 변형별 표시용 정보 (Ultralytics YOLO26 문서 기준, imgsz=640, COCO).</summary>
    public sealed class Yolo26SegModelChoice
    {
        private Yolo26SegModelChoice(
            string variant,
            string shortLabel,
            string modelFileName,
            double mapMask,
            string paramsMega)
        {
            Variant = variant;
            ShortLabel = shortLabel;
            ModelFileName = modelFileName;
            MapMask = mapMask;
            ParamsMega = paramsMega;
        }

        public string Variant { get; }
        public string ShortLabel { get; }
        public string ModelFileName { get; }
        public double MapMask { get; }
        public string ParamsMega { get; }

        /// <summary>콤보박스 짧은 한 줄.</summary>
        public string ComboDisplay =>
            $"{ModelFileName} · {ShortLabel} · {ParamsMega} · mAP {MapMask:0.0}";

        public override string ToString() => ComboDisplay;

        public static IReadOnlyList<Yolo26SegModelChoice> All { get; } = new[]
        {
            new Yolo26SegModelChoice("n", "Nano", "yolo26n-seg.pt", 33.9, "2.7M"),
            new Yolo26SegModelChoice("s", "Small", "yolo26s-seg.pt", 40.0, "10.4M"),
            new Yolo26SegModelChoice("m", "Medium", "yolo26m-seg.pt", 44.1, "23.6M"),
            new Yolo26SegModelChoice("l", "Large", "yolo26l-seg.pt", 45.5, "28.0M"),
            new Yolo26SegModelChoice("x", "XLarge", "yolo26x-seg.pt", 47.0, "62.8M"),
        };

        public static Yolo26SegModelChoice FromVariant(string variant)
        {
            if (string.IsNullOrEmpty(variant))
                return All[0];
            foreach (var c in All)
            {
                if (c.Variant == variant)
                    return c;
            }

            return All[0];
        }
    }
}
