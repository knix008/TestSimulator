using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10.Services;

public enum SegmentationAlgorithm
{
    Rembg,
    Rembg2,
    GrabCut,
    ColorKey,
    EdgeFill,
    Threshold
}

public readonly record struct SegmentationAlgorithmOption(
    SegmentationAlgorithm Algorithm,
    string DisplayName,
    string Description);

public static class SegmentationAlgorithmCatalog
{
    public static IReadOnlyList<SegmentationAlgorithmOption> Options => GetOptions();

    public static IReadOnlyList<SegmentationAlgorithmOption> GetOptions()
    {
        return
        [
            new(
                SegmentationAlgorithm.Rembg,
                L.Get("Algo.Rembg.Name"),
                L.Get("Algo.Rembg.Desc")),
            new(
                SegmentationAlgorithm.Rembg2,
                L.Get("Algo.Rembg2.Name"),
                L.Get("Algo.Rembg2.Desc")),
            new(
                SegmentationAlgorithm.GrabCut,
                L.Get("Algo.GrabCut.Name"),
                L.Get("Algo.GrabCut.Desc")),
            new(
                SegmentationAlgorithm.ColorKey,
                L.Get("Algo.ColorKey.Name"),
                L.Get("Algo.ColorKey.Desc")),
            new(
                SegmentationAlgorithm.EdgeFill,
                L.Get("Algo.EdgeFill.Name"),
                L.Get("Algo.EdgeFill.Desc")),
            new(
                SegmentationAlgorithm.Threshold,
                L.Get("Algo.Threshold.Name"),
                L.Get("Algo.Threshold.Desc"))
        ];
    }

    public static string GetDisplayName(SegmentationAlgorithm algorithm)
    {
        return GetOptions().First(option => option.Algorithm == algorithm).DisplayName;
    }

    public static string GetDescription(SegmentationAlgorithm algorithm)
    {
        return GetOptions().First(option => option.Algorithm == algorithm).Description;
    }
}
