using ImageRembgWinV10.Localization;
using OpenCvSharp;
using DrawingRectangle = System.Drawing.Rectangle;

namespace ImageRembgWinV10.Services;

public sealed class SegmentationResult : IDisposable
{
    public Mat Mask { get; }
    public OpenCvSharp.Point[][] Contours { get; }
    public double ForegroundRatio { get; }

    public SegmentationResult(Mat mask, OpenCvSharp.Point[][] contours, double foregroundRatio)
    {
        Mask = mask;
        Contours = contours;
        ForegroundRatio = foregroundRatio;
    }

    public void Dispose()
    {
        Mask.Dispose();
    }
}

public static class SegmentationService
{
    private const int MaxProcessDimension = 2400;

    public static SegmentationResult Segment(
        SegmentationAlgorithm algorithm,
        Mat sourceBgr,
        Mat selectionMask,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask,
        IProgress<string>? progress = null)
    {
        if (!SegmentationMaskBuilder.HasMaskContent(selectionMask))
        {
            throw new InvalidOperationException(L.Get("Exception.DrawSelection"));
        }

        using var normalizedBgr = OpenCvImageHelper.EnsureBgr8(sourceBgr);
        using var normalizedSelection = NormalizeMask(selectionMask, normalizedBgr.Size());

        var selectionBounds = SegmentationMaskBuilder.GetMaskBounds(normalizedSelection);
        if (selectionBounds == null || selectionBounds.Value.Width < 2 || selectionBounds.Value.Height < 2)
        {
            throw new InvalidOperationException(L.Get("Exception.SelectionTooSmall"));
        }

        using var normalizedForegroundHint = NormalizeOptionalMask(foregroundHintMask, normalizedBgr.Size());
        using var normalizedBackgroundHint = NormalizeOptionalMask(backgroundHintMask, normalizedBgr.Size());

        if (algorithm == SegmentationAlgorithm.Rembg)
        {
            using var binary = SegmentationAlgorithmRunner.Run(
                algorithm,
                normalizedBgr,
                normalizedSelection,
                normalizedForegroundHint,
                normalizedBackgroundHint,
                progress);
            return SegmentationMaskBuilder.BuildResult(binary);
        }

        var maxSide = Math.Max(normalizedBgr.Width, normalizedBgr.Height);
        var scale = maxSide > MaxProcessDimension ? MaxProcessDimension / (float)maxSide : 1f;

        Mat workBgr;
        Mat workSelection;
        Mat? workForegroundHint;
        Mat? workBackgroundHint;

        if (scale < 1f)
        {
            workBgr = new Mat();
            Cv2.Resize(normalizedBgr, workBgr, new OpenCvSharp.Size(), scale, scale, InterpolationFlags.Area);
            workSelection = SegmentationMaskBuilder.ResizeMask(normalizedSelection, workBgr.Size());
            workForegroundHint = ResizeOptionalMask(normalizedForegroundHint, workBgr.Size());
            workBackgroundHint = ResizeOptionalMask(normalizedBackgroundHint, workBgr.Size());
        }
        else
        {
            workBgr = normalizedBgr.Clone();
            workSelection = normalizedSelection.Clone();
            workForegroundHint = normalizedForegroundHint?.Clone();
            workBackgroundHint = normalizedBackgroundHint?.Clone();
        }

        try
        {
            using var binary = SegmentationAlgorithmRunner.Run(
                algorithm,
                workBgr,
                workSelection,
                workForegroundHint,
                workBackgroundHint);

            using var finalMask = scale < 1f
                ? SegmentationMaskBuilder.ResizeMask(binary, normalizedBgr.Size())
                : binary.Clone();

            return SegmentationMaskBuilder.BuildResult(finalMask);
        }
        finally
        {
            workBgr.Dispose();
            workSelection.Dispose();
            workForegroundHint?.Dispose();
            workBackgroundHint?.Dispose();
        }
    }

    private static Mat NormalizeMask(Mat mask, OpenCvSharp.Size targetSize)
    {
        Mat? resized = null;
        var source = mask;
        if (mask.Width != targetSize.Width || mask.Height != targetSize.Height)
        {
            resized = SegmentationMaskBuilder.ResizeMask(mask, targetSize);
            source = resized;
        }

        var result = new Mat();
        Cv2.Threshold(source, result, 0, 255, ThresholdTypes.Binary);
        resized?.Dispose();
        return result;
    }

    private static Mat? NormalizeOptionalMask(Mat? mask, OpenCvSharp.Size targetSize)
    {
        if (!SegmentationMaskBuilder.HasMaskContent(mask))
        {
            return null;
        }

        return NormalizeMask(mask!, targetSize);
    }

    private static Mat? ResizeOptionalMask(Mat? mask, OpenCvSharp.Size targetSize)
    {
        if (!SegmentationMaskBuilder.HasMaskContent(mask))
        {
            return null;
        }

        using var resized = SegmentationMaskBuilder.ResizeMask(mask!, targetSize);
        var result = new Mat();
        Cv2.Threshold(resized, result, 0, 255, ThresholdTypes.Binary);
        return result;
    }
}
