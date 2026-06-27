using ImageRembgWinV10.Localization;
using OpenCvSharp;
using DrawingRectangle = System.Drawing.Rectangle;
using CvPoint = OpenCvSharp.Point;

namespace ImageRembgWinV10.Services;

internal static class SegmentationAlgorithmRunner
{
    public static Mat Run(
        SegmentationAlgorithm algorithm,
        Mat bgr,
        Mat selectionMask,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask,
        IProgress<string>? progress = null)
    {
        var bounds = SegmentationMaskBuilder.GetMaskBounds(selectionMask)
            ?? throw new InvalidOperationException(L.Get("Exception.NoSelection"));

        return algorithm switch
        {
            SegmentationAlgorithm.Rembg => RembgSegmentationService.GenerateMask(
                bgr,
                selectionMask,
                foregroundHintMask,
                backgroundHintMask,
                progress),
            SegmentationAlgorithm.GrabCut => RunGrabCut(bgr, selectionMask, bounds, foregroundHintMask, backgroundHintMask),
            SegmentationAlgorithm.ColorKey => RunColorKey(bgr, selectionMask, bounds, foregroundHintMask, backgroundHintMask),
            SegmentationAlgorithm.EdgeFill => RunEdgeFill(bgr, selectionMask, bounds, foregroundHintMask),
            SegmentationAlgorithm.Threshold => RunThreshold(bgr, selectionMask, bounds, foregroundHintMask),
            _ => throw new ArgumentOutOfRangeException(nameof(algorithm), algorithm, null)
        };
    }

    private static Mat RunGrabCut(
        Mat bgr,
        Mat selectionMask,
        DrawingRectangle selectionBounds,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask)
    {
        var mask = new Mat(bgr.Size(), MatType.CV_8UC1, new Scalar((int)GrabCutClasses.PR_BGD));
        using (var probableForeground = new Mat())
        {
            Cv2.Threshold(selectionMask, probableForeground, 0, 255, ThresholdTypes.Binary);
            mask.SetTo(new Scalar((int)GrabCutClasses.PR_FGD), probableForeground);
        }

        SegmentationMaskBuilder.ApplyHintMask(mask, foregroundHintMask, new Scalar((int)GrabCutClasses.FGD));
        SegmentationMaskBuilder.ApplyHintMask(mask, backgroundHintMask, new Scalar((int)GrabCutClasses.BGD));

        var cvRect = new Rect(selectionBounds.X, selectionBounds.Y, selectionBounds.Width, selectionBounds.Height);
        Cv2.GrabCut(
            bgr,
            mask,
            cvRect,
            new Mat(),
            new Mat(),
            SegmentationMaskBuilder.HasMaskContent(foregroundHintMask) ||
            SegmentationMaskBuilder.HasMaskContent(backgroundHintMask)
                ? 3
                : 5,
            GrabCutModes.InitWithMask);

        using var probable = new Mat();
        using var definite = new Mat();
        Cv2.Compare(mask, new Scalar((int)GrabCutClasses.PR_FGD), probable, CmpTypes.EQ);
        Cv2.Compare(mask, new Scalar((int)GrabCutClasses.FGD), definite, CmpTypes.EQ);

        var binary = new Mat();
        Cv2.BitwiseOr(probable, definite, binary);
        mask.Dispose();

        SegmentationMaskBuilder.ApplyPostProcessMasks(binary, selectionMask, foregroundHintMask, backgroundHintMask);
        return binary;
    }

    private static Mat RunColorKey(
        Mat bgr,
        Mat selectionMask,
        DrawingRectangle selectionBounds,
        Mat? foregroundHintMask,
        Mat? backgroundHintMask)
    {
        using var hsv = new Mat();
        Cv2.CvtColor(bgr, hsv, ColorConversionCodes.BGR2HSV);

        var samples = new List<Vec3b>();
        if (SegmentationMaskBuilder.HasMaskContent(backgroundHintMask))
        {
            SegmentationMaskBuilder.SampleMaskPixels(hsv, backgroundHintMask!, samples);
        }
        else
        {
            SegmentationMaskBuilder.SampleSelectionBorder(hsv, selectionMask, samples);
        }

        if (samples.Count == 0)
        {
            throw new InvalidOperationException(L.Get("Exception.BackgroundColorUnknown"));
        }

        var hueValues = samples.Select(sample => sample.Item0).ToArray();
        var satValues = samples.Select(sample => sample.Item1).ToArray();
        var valValues = samples.Select(sample => sample.Item2).ToArray();

        var hueTolerance = (byte)Math.Clamp(8 + samples.Count / 4, 8, 24);
        var satTolerance = (byte)Math.Clamp(40 + samples.Count, 40, 90);
        var valTolerance = (byte)Math.Clamp(40 + samples.Count, 40, 90);

        var hueMedian = (byte)Median(hueValues);
        var satMedian = (byte)Median(satValues);
        var valMedian = (byte)Median(valValues);

        var lower = new Scalar(
            Math.Max(0, hueMedian - hueTolerance),
            Math.Max(0, satMedian - satTolerance),
            Math.Max(0, valMedian - valTolerance));
        var upper = new Scalar(
            Math.Min(179, hueMedian + hueTolerance),
            Math.Min(255, satMedian + satTolerance),
            Math.Min(255, valMedian + valTolerance));

        using var backgroundMask = new Mat();
        Cv2.InRange(hsv, lower, upper, backgroundMask);

        using var backgroundInSelection = new Mat();
        Cv2.BitwiseAnd(backgroundMask, selectionMask, backgroundInSelection);

        var foregroundMask = new Mat();
        Cv2.BitwiseNot(backgroundInSelection, foregroundMask);
        SegmentationMaskBuilder.ApplyPostProcessMasks(foregroundMask, selectionMask, foregroundHintMask, backgroundHintMask);
        return foregroundMask;
    }

    private static Mat RunEdgeFill(
        Mat bgr,
        Mat selectionMask,
        DrawingRectangle selectionBounds,
        Mat? foregroundHintMask)
    {
        var cvRect = new Rect(selectionBounds.X, selectionBounds.Y, selectionBounds.Width, selectionBounds.Height);
        using var roi = new Mat(bgr, cvRect);
        using var gray = new Mat();
        Cv2.CvtColor(roi, gray, ColorConversionCodes.BGR2GRAY);
        Cv2.GaussianBlur(gray, gray, new OpenCvSharp.Size(5, 5), 0);

        using var edges = new Mat();
        Cv2.Canny(gray, edges, 40, 120);
        using var closed = new Mat();
        using var kernel = Cv2.GetStructuringElement(MorphShapes.Ellipse, new OpenCvSharp.Size(3, 3));
        Cv2.MorphologyEx(edges, closed, MorphTypes.Close, kernel, iterations: 2);

        Cv2.FindContours(closed, out var contours, out _, RetrievalModes.External, ContourApproximationModes.ApproxSimple);
        if (contours.Length == 0)
        {
            throw new InvalidOperationException(L.Get("Exception.ContourNotFound"));
        }

        var seed = GetSeedPoint(selectionMask, foregroundHintMask, selectionBounds);
        var center = new CvPoint(seed.X - selectionBounds.X, seed.Y - selectionBounds.Y);

        CvPoint[]? bestContour = null;
        var bestArea = 0.0;

        foreach (var contour in contours)
        {
            if (Cv2.PointPolygonTest(contour, center, false) < 0)
            {
                continue;
            }

            var area = Cv2.ContourArea(contour);
            if (area > bestArea)
            {
                bestArea = area;
                bestContour = contour;
            }
        }

        if (bestContour == null)
        {
            foreach (var contour in contours)
            {
                var area = Cv2.ContourArea(contour);
                if (area > bestArea)
                {
                    bestArea = area;
                    bestContour = contour;
                }
            }
        }

        if (bestContour == null)
        {
            throw new InvalidOperationException(L.Get("Exception.ContourNotFound"));
        }

        using var roiMask = new Mat(roi.Size(), MatType.CV_8UC1, Scalar.Black);
        Cv2.DrawContours(roiMask, [bestContour], -1, Scalar.White, -1);
        using var placed = SegmentationMaskBuilder.PlaceRoiMask(bgr.Size(), selectionBounds, roiMask);
        var binary = placed.Clone();
        SegmentationMaskBuilder.ApplyPostProcessMasks(binary, selectionMask, foregroundHintMask, null);
        return binary;
    }

    private static Mat RunThreshold(
        Mat bgr,
        Mat selectionMask,
        DrawingRectangle selectionBounds,
        Mat? foregroundHintMask)
    {
        var cvRect = new Rect(selectionBounds.X, selectionBounds.Y, selectionBounds.Width, selectionBounds.Height);
        using var roi = new Mat(bgr, cvRect);
        using var gray = new Mat();
        Cv2.CvtColor(roi, gray, ColorConversionCodes.BGR2GRAY);
        Cv2.GaussianBlur(gray, gray, new OpenCvSharp.Size(5, 5), 0);

        using var thresholded = new Mat();
        Cv2.Threshold(gray, thresholded, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);

        var seed = GetSeedPoint(selectionMask, foregroundHintMask, selectionBounds);
        var samplePoint = new CvPoint(seed.X - selectionBounds.X, seed.Y - selectionBounds.Y);
        samplePoint.X = Math.Clamp(samplePoint.X, 0, thresholded.Width - 1);
        samplePoint.Y = Math.Clamp(samplePoint.Y, 0, thresholded.Height - 1);

        if (thresholded.At<byte>(samplePoint.Y, samplePoint.X) == 0)
        {
            Cv2.BitwiseNot(thresholded, thresholded);
        }

        using var placed = SegmentationMaskBuilder.PlaceRoiMask(bgr.Size(), selectionBounds, thresholded);
        var binary = placed.Clone();
        SegmentationMaskBuilder.ApplyPostProcessMasks(binary, selectionMask, foregroundHintMask, null);
        return binary;
    }

    private static CvPoint GetSeedPoint(Mat selectionMask, Mat? foregroundHintMask, DrawingRectangle selectionBounds)
    {
        if (SegmentationMaskBuilder.HasMaskContent(foregroundHintMask))
        {
            return SegmentationMaskBuilder.GetMaskCentroid(foregroundHintMask!);
        }

        return SegmentationMaskBuilder.GetMaskCentroid(selectionMask);
    }

    private static double Median(IReadOnlyList<byte> values)
    {
        var ordered = values.OrderBy(value => value).ToArray();
        var middle = ordered.Length / 2;
        return ordered.Length % 2 == 0
            ? (ordered[middle - 1] + ordered[middle]) / 2.0
            : ordered[middle];
    }
}
