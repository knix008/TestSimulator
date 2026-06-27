using ImageRembgWinV10.Localization;
using OpenCvSharp;
using DrawingPoint = System.Drawing.Point;
using DrawingRectangle = System.Drawing.Rectangle;
using CvPoint = OpenCvSharp.Point;

namespace ImageRembgWinV10.Services;

internal static class SegmentationMaskBuilder
{
    public static Mat CleanupMask(Mat mask)
    {
        var cleaned = mask.Clone();
        using var kernel = Cv2.GetStructuringElement(MorphShapes.Ellipse, new OpenCvSharp.Size(3, 3));
        Cv2.MorphologyEx(cleaned, cleaned, MorphTypes.Close, kernel, iterations: 1);
        Cv2.MorphologyEx(cleaned, cleaned, MorphTypes.Open, kernel, iterations: 1);
        return cleaned;
    }

    public static Mat CreateRectMask(OpenCvSharp.Size size, DrawingRectangle rect)
    {
        var mask = new Mat(size, MatType.CV_8UC1, Scalar.Black);
        Cv2.Rectangle(
            mask,
            new Rect(rect.X, rect.Y, rect.Width, rect.Height),
            Scalar.White,
            -1);
        return mask;
    }

    public static void ApplyForegroundHints(Mat mask, IReadOnlyList<DrawingPoint> foregroundPoints)
    {
        const int radius = 6;
        foreach (var point in foregroundPoints)
        {
            if (point.X < 0 || point.Y < 0 || point.X >= mask.Width || point.Y >= mask.Height)
            {
                continue;
            }

            Cv2.Circle(mask, new CvPoint(point.X, point.Y), radius, Scalar.White, -1);
        }
    }

    public static void ApplyHintMask(Mat mask, Mat? hintMask, Scalar valueWhenHint)
    {
        if (hintMask == null || hintMask.Empty() || Cv2.CountNonZero(hintMask) == 0)
        {
            return;
        }

        using var hint = new Mat();
        Cv2.Threshold(hintMask, hint, 0, 255, ThresholdTypes.Binary);
        mask.SetTo(valueWhenHint, hint);
    }

    public static void ApplyPostProcessMasks(Mat binary, Mat selectionMask, Mat? foregroundHintMask, Mat? backgroundHintMask)
    {
        Cv2.BitwiseAnd(binary, selectionMask, binary);

        if (foregroundHintMask != null && Cv2.CountNonZero(foregroundHintMask) > 0)
        {
            using var foregroundHint = new Mat();
            Cv2.Threshold(foregroundHintMask, foregroundHint, 0, 255, ThresholdTypes.Binary);
            Cv2.BitwiseOr(binary, foregroundHint, binary);
        }

        if (backgroundHintMask != null && Cv2.CountNonZero(backgroundHintMask) > 0)
        {
            using var backgroundHint = new Mat();
            Cv2.Threshold(backgroundHintMask, backgroundHint, 0, 255, ThresholdTypes.Binary);
            using var keep = new Mat();
            Cv2.BitwiseNot(backgroundHint, keep);
            Cv2.BitwiseAnd(binary, keep, binary);
        }

        Cv2.BitwiseAnd(binary, selectionMask, binary);
    }

    public static DrawingRectangle? GetMaskBounds(Mat? mask)
    {
        if (mask == null || mask.Empty() || Cv2.CountNonZero(mask) == 0)
        {
            return null;
        }

        Cv2.FindContours(
            mask,
            out var contours,
            out _,
            RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);

        if (contours.Length == 0)
        {
            return null;
        }

        var rect = Cv2.BoundingRect(contours[0]);
        for (var i = 1; i < contours.Length; i++)
        {
            rect = rect.Union(Cv2.BoundingRect(contours[i]));
        }

        if (rect.Width < 1 || rect.Height < 1)
        {
            return null;
        }

        return new DrawingRectangle(rect.X, rect.Y, rect.Width, rect.Height);
    }

    public static bool HasMaskContent(Mat? mask)
    {
        return mask != null && !mask.Empty() && Cv2.CountNonZero(mask) > 0;
    }

    public static Mat ResizeMask(Mat mask, OpenCvSharp.Size targetSize)
    {
        var resized = new Mat(targetSize, MatType.CV_8UC1);
        Cv2.Resize(mask, resized, targetSize, 0, 0, InterpolationFlags.Nearest);
        return resized;
    }

    public static void SampleMaskPixels(Mat image, Mat mask, ICollection<Vec3b> samples, int maxSamples = 512)
    {
        using var points = new Mat();
        Cv2.FindNonZero(mask, points);
        if (points.Empty())
        {
            return;
        }

        var pointRows = points.Rows;
        var step = Math.Max(1, pointRows / maxSamples);
        for (var i = 0; i < pointRows; i += step)
        {
            var point = ReadFindNonZeroPoint(points, i);
            if (point.X >= 0 && point.Y >= 0 && point.X < image.Cols && point.Y < image.Rows)
            {
                samples.Add(image.At<Vec3b>(point.Y, point.X));
            }
        }
    }

    public static CvPoint[] SimplifyContourForDrawing(CvPoint[] contour, int maxPoints = 512)
    {
        if (contour.Length == 0)
        {
            return contour;
        }

        if (contour.Length <= maxPoints)
        {
            if (contour.Length <= 3)
            {
                return contour;
            }

            var approx = Cv2.ApproxPolyDP(contour, 2.0, true);
            return approx.Length >= 3 ? approx : contour;
        }

        var epsilon = Math.Max(2.0, Cv2.ArcLength(contour, true) / maxPoints);
        var simplified = Cv2.ApproxPolyDP(contour, epsilon, true);
        if (simplified.Length <= maxPoints && simplified.Length >= 3)
        {
            return simplified;
        }

        var source = simplified.Length >= 3 ? simplified : contour;
        var step = Math.Max(1, source.Length / maxPoints);
        var capped = new List<CvPoint>(maxPoints);
        for (var i = 0; i < source.Length && capped.Count < maxPoints; i += step)
        {
            capped.Add(source[i]);
        }

        return capped.Count >= 3 ? capped.ToArray() : source.Take(Math.Min(source.Length, maxPoints)).ToArray();
    }

    private static CvPoint ReadFindNonZeroPoint(Mat points, int row)
    {
        var value = points.Get<Vec2i>(row, 0);
        return new CvPoint(value.Item0, value.Item1);
    }

    public static void SampleSelectionBorder(Mat image, Mat selectionMask, ICollection<Vec3b> samples)
    {
        using var dilated = new Mat();
        using var eroded = new Mat();
        using var kernel = Cv2.GetStructuringElement(MorphShapes.Ellipse, new OpenCvSharp.Size(3, 3));
        Cv2.Dilate(selectionMask, dilated, kernel);
        Cv2.Erode(selectionMask, eroded, kernel);

        using var border = new Mat();
        Cv2.Subtract(dilated, eroded, border);
        SampleMaskPixels(image, border, samples);
    }

    public static OpenCvSharp.Point GetMaskCentroid(Mat mask)
    {
        var moments = Cv2.Moments(mask, true);
        if (Math.Abs(moments.M00) < 1e-6)
        {
            var bounds = GetMaskBounds(mask);
            if (bounds == null)
            {
                return new OpenCvSharp.Point(0, 0);
            }

            return new OpenCvSharp.Point(
                bounds.Value.X + bounds.Value.Width / 2,
                bounds.Value.Y + bounds.Value.Height / 2);
        }

        return new OpenCvSharp.Point(
            (int)(moments.M10 / moments.M00),
            (int)(moments.M01 / moments.M00));
    }

    public static void SampleRectBorder(Mat hsv, DrawingRectangle rect, ICollection<Vec3b> samples)
    {
        var left = Math.Clamp(rect.Left, 0, hsv.Width - 1);
        var top = Math.Clamp(rect.Top, 0, hsv.Height - 1);
        var right = Math.Clamp(rect.Right, 1, hsv.Width);
        var bottom = Math.Clamp(rect.Bottom, 1, hsv.Height);

        for (var x = left; x < right; x++)
        {
            samples.Add(hsv.At<Vec3b>(top, x));
            samples.Add(hsv.At<Vec3b>(bottom - 1, x));
        }

        for (var y = top; y < bottom; y++)
        {
            samples.Add(hsv.At<Vec3b>(y, left));
            samples.Add(hsv.At<Vec3b>(y, right - 1));
        }
    }

    public static SegmentationResult BuildResult(Mat binaryMask)
    {
        using var cleaned = CleanupMask(binaryMask);
        var finalMask = cleaned.Clone();

        Cv2.FindContours(
            finalMask,
            out var contours,
            out _,
            RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);

        var foregroundPixels = Cv2.CountNonZero(finalMask);
        var totalPixels = finalMask.Rows * finalMask.Cols;
        var ratio = totalPixels == 0 ? 0 : foregroundPixels / (double)totalPixels;

        if (foregroundPixels == 0)
        {
            finalMask.Dispose();
            throw new InvalidOperationException(L.Get("Exception.ObjectNotFound"));
        }

        return new SegmentationResult(finalMask, contours, ratio);
    }

    public static Mat PlaceRoiMask(OpenCvSharp.Size fullSize, DrawingRectangle rect, Mat roiMask)
    {
        var fullMask = new Mat(fullSize, MatType.CV_8UC1, Scalar.Black);
        var targetRect = new Rect(rect.X, rect.Y, rect.Width, rect.Height);
        using var roiView = new Mat(fullMask, targetRect);
        roiMask.CopyTo(roiView);
        return fullMask;
    }
}
