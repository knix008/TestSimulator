using OCRWinV10.Ocr;
using OpenCvSharp;
using OpenCvSharp.Extensions;
using Size = OpenCvSharp.Size;

namespace OCRWinV10;

public class ImagePreprocessor
{
    private const int MinDimension = 500;
    private const int MaxDimension = 4000;
    private const int DocumentMinDimension = 960;
    private const int DocumentMaxDimension = 4800;
    private const int TesseractMinDimension = 1200;
    private const int HandwritingMinDimension = 960;
    private const int HandwritingMaxDimension = 4800;

    public PreprocessResult ProcessWithMetadata(
        System.Drawing.Bitmap input, PreprocessMode mode, string? providerId = null)
    {
        int origW = input.Width;
        int origH = input.Height;

        if (mode == PreprocessMode.None)
            return UpscaleIfSmallWithMetadata(new System.Drawing.Bitmap(input), origW, origH, MinDimension, MaxDimension);

        using var mat = BitmapConverter.ToMat(input);
        var (resultMat, deskew) = mode == PreprocessMode.Handwriting
            ? ProcessHandwritingSoft(mat)
            : OcrProviderPreprocess.UsesDocumentPreprocess(providerId)
                ? ProcessDocument(mat, providerId)
                : ProcessMat(mat);

        var bmp = BitmapConverter.ToBitmap(resultMat);
        resultMat.Dispose();
        return new PreprocessResult(
            bmp,
            OcrBoxTransform.FromSizes(bmp.Width, bmp.Height, origW, origH, deskew));
    }

    /// <summary>
    /// EasyOCR·Tesseract Auto: 그레이 보정 + 이진화 패스로 다중 인식.
    /// </summary>
    public IReadOnlyList<PreprocessResult> ProcessAlternateEnginePassesWithMetadata(
        System.Drawing.Bitmap input, string? providerId)
    {
        int origW = input.Width;
        int origH = input.Height;
        using var mat = BitmapConverter.ToMat(input);

        var (document, deskewDoc) = ProcessDocument(mat, providerId);
        var (binary, deskewBin) = ProcessHandwritingHard(mat);

        return
        [
            ToPreprocessResult(document, origW, origH, deskewDoc),
            ToPreprocessResult(binary, origW, origH, deskewBin)
        ];
    }

    /// <summary>
    /// 손글씨 모드: 서로 다른 전처리 결과로 다중 OCR 패스를 수행합니다.
    /// </summary>
    public IReadOnlyList<PreprocessResult> ProcessHandwritingPassesWithMetadata(System.Drawing.Bitmap input)
    {
        int origW = input.Width;
        int origH = input.Height;
        using var mat = BitmapConverter.ToMat(input);

        var (soft, deskewSoft) = ProcessHandwritingSoft(mat);
        var (hard, deskewHard) = ProcessHandwritingHard(mat);

        using var gray = ToGray(mat);
        var scaled = EnsureOptimalSize(gray, HandwritingMinDimension, HandwritingMaxDimension);
        NormalizePolarity(scaled);
        var scaledBgr = ToBgr(scaled);
        scaled.Dispose();

        return
        [
            ToPreprocessResult(soft, origW, origH, deskewSoft),
            ToPreprocessResult(hard, origW, origH, deskewHard),
            ToPreprocessResult(scaledBgr, origW, origH, 0f)
        ];
    }

    private static PreprocessResult ToPreprocessResult(Mat mat, int origW, int origH, float deskewDegrees)
    {
        var bmp = BitmapConverter.ToBitmap(mat);
        mat.Dispose();
        return new PreprocessResult(
            bmp,
            OcrBoxTransform.FromSizes(bmp.Width, bmp.Height, origW, origH, deskewDegrees));
    }

    /// <summary>
    /// EasyOCR·Tesseract·Windows용: 이진화 없이 해상도·대비·기울기만 보정 (한글 획 보존).
    /// </summary>
    private static (Mat Image, float DeskewDegrees) ProcessDocument(Mat src, string? providerId)
    {
        int minDim = providerId == OcrProviderIds.Tesseract
            ? TesseractMinDimension
            : DocumentMinDimension;

        using var gray = ToGray(src);
        var scaled = EnsureOptimalSize(gray, minDim, DocumentMaxDimension);
        NormalizePolarity(scaled);

        var denoised = new Mat();
        Cv2.BilateralFilter(scaled, denoised, d: 5, sigmaColor: 45, sigmaSpace: 45);
        scaled.Dispose();

        var enhanced = ApplyClahe(denoised, clipLimit: 2.8);
        denoised.Dispose();

        var sharpened = ApplyUnsharpMask(enhanced, amount: 0.9, sigma: 1.0);
        enhanced.Dispose();

        var (deskewed, angle) = TryDeskewGrayWithAngle(sharpened);
        sharpened.Dispose();

        var result = ToBgr(deskewed);
        deskewed.Dispose();
        return (result, angle);
    }

    private static (Mat Image, float DeskewDegrees) ProcessMat(Mat src)
    {
        using var gray = ToGray(src);
        var scaled = EnsureOptimalSize(gray, MinDimension, MaxDimension);

        var denoised = new Mat();
        Cv2.GaussianBlur(scaled, denoised, new Size(3, 3), 0);
        scaled.Dispose();

        var enhanced = ApplyClahe(denoised, clipLimit: 2.0);
        denoised.Dispose();

        var binary = new Mat();
        Cv2.AdaptiveThreshold(enhanced, binary, 255,
            AdaptiveThresholdTypes.GaussianC,
            ThresholdTypes.Binary, 15, 3);
        enhanced.Dispose();

        var (deskewed, angle) = TryDeskewWithAngle(binary);
        binary.Dispose();

        var result = ToBgr(deskewed);
        deskewed.Dispose();
        return (result, angle);
    }

    /// <summary>
    /// Windows OCR은 과도한 이진화보다 대비·해상도가 살아 있는 그레이스케일에서 손글씨가 잘 나오는 경우가 많습니다.
    /// </summary>
    private static (Mat Image, float DeskewDegrees) ProcessHandwritingSoft(Mat src)
    {
        using var gray = ToGray(src);
        var scaled = EnsureOptimalSize(gray, HandwritingMinDimension, HandwritingMaxDimension);
        NormalizePolarity(scaled);

        var denoised = new Mat();
        Cv2.BilateralFilter(scaled, denoised, d: 7, sigmaColor: 50, sigmaSpace: 50);
        scaled.Dispose();

        var enhanced = ApplyClahe(denoised, clipLimit: 3.0);
        denoised.Dispose();

        var sharpened = ApplyUnsharpMask(enhanced, amount: 1.2, sigma: 1.0);
        enhanced.Dispose();

        var (deskewed, angle) = TryDeskewGrayWithAngle(sharpened);
        sharpened.Dispose();

        var result = ToBgr(deskewed);
        deskewed.Dispose();
        return (result, angle);
    }

    private static (Mat Image, float DeskewDegrees) ProcessHandwritingHard(Mat src)
    {
        using var gray = ToGray(src);
        var scaled = EnsureOptimalSize(gray, HandwritingMinDimension, HandwritingMaxDimension);
        NormalizePolarity(scaled);

        var denoised = new Mat();
        Cv2.BilateralFilter(scaled, denoised, d: 5, sigmaColor: 40, sigmaSpace: 40);
        scaled.Dispose();

        var enhanced = ApplyClahe(denoised, clipLimit: 2.5);
        denoised.Dispose();

        var binary = new Mat();
        Cv2.AdaptiveThreshold(enhanced, binary, 255,
            AdaptiveThresholdTypes.GaussianC,
            ThresholdTypes.Binary, 31, 10);
        enhanced.Dispose();

        using var kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(2, 2));
        Cv2.MorphologyEx(binary, binary, MorphTypes.Close, kernel);

        var (deskewed, angle) = TryDeskewWithAngle(binary);
        binary.Dispose();

        var result = ToBgr(deskewed);
        deskewed.Dispose();
        return (result, angle);
    }

    private static Mat ToGray(Mat src)
    {
        var gray = new Mat();
        if (src.Channels() == 4)
            Cv2.CvtColor(src, gray, ColorConversionCodes.BGRA2GRAY);
        else if (src.Channels() == 3)
            Cv2.CvtColor(src, gray, ColorConversionCodes.BGR2GRAY);
        else
            gray = src.Clone();
        return gray;
    }

    private static Mat ToBgr(Mat grayOrBinary)
    {
        var result = new Mat();
        if (grayOrBinary.Channels() == 1)
            Cv2.CvtColor(grayOrBinary, result, ColorConversionCodes.GRAY2BGR);
        else
            result = grayOrBinary.Clone();
        return result;
    }

    private static Mat ApplyClahe(Mat gray, double clipLimit)
    {
        using var clahe = Cv2.CreateCLAHE(clipLimit, new Size(8, 8));
        var enhanced = new Mat();
        clahe.Apply(gray, enhanced);
        return enhanced;
    }

    private static Mat ApplyUnsharpMask(Mat src, double amount, double sigma)
    {
        var blurred = new Mat();
        Cv2.GaussianBlur(src, blurred, new Size(0, 0), sigma);
        var sharp = new Mat();
        Cv2.AddWeighted(src, 1.0 + amount, blurred, -amount, 0, sharp);
        blurred.Dispose();
        return sharp;
    }

    /// <summary>
    /// 어두운 배경·밝은 글씨 등 극성이 뒤집힌 경우 보정합니다.
    /// </summary>
    private static void NormalizePolarity(Mat gray)
    {
        var mean = Cv2.Mean(gray).Val0;
        if (mean < 110)
            Cv2.BitwiseNot(gray, gray);
    }

    private static Mat EnsureOptimalSize(Mat mat, int minDim, int maxDim)
    {
        int maxSide = Math.Max(mat.Width, mat.Height);
        int minSide = Math.Min(mat.Width, mat.Height);

        if (maxSide > maxDim)
        {
            double scale = (double)maxDim / maxSide;
            var result = new Mat();
            Cv2.Resize(mat, result, new Size(0, 0), scale, scale, InterpolationFlags.Area);
            return result;
        }

        if (minSide < minDim)
        {
            double scale = (double)minDim / minSide;
            var result = new Mat();
            Cv2.Resize(mat, result, new Size(0, 0), scale, scale, InterpolationFlags.Cubic);
            return result;
        }

        return mat.Clone();
    }

    private static PreprocessResult UpscaleIfSmallWithMetadata(
        System.Drawing.Bitmap input, int origW, int origH, int minDim, int maxDim)
    {
        int minSide = Math.Min(input.Width, input.Height);
        int maxSide = Math.Max(input.Width, input.Height);
        if (minSide >= minDim && maxSide <= maxDim)
            return new PreprocessResult(input, OcrBoxTransform.FromSizes(input.Width, input.Height, origW, origH, 0f));

        using var mat = BitmapConverter.ToMat(input);
        using var gray = ToGray(mat);
        using var scaled = EnsureOptimalSize(gray, minDim, maxDim);
        using var bgr = ToBgr(scaled);
        var bmp = BitmapConverter.ToBitmap(bgr);
        input.Dispose();
        return new PreprocessResult(
            bmp,
            OcrBoxTransform.FromSizes(bmp.Width, bmp.Height, origW, origH, 0f));
    }

    private static (Mat Image, float DeskewDegrees) TryDeskewWithAngle(Mat binary)
    {
        try
        {
            using var edges = new Mat();
            Cv2.Canny(binary, edges, 50, 150);

            var lines = Cv2.HoughLinesP(edges, rho: 1, theta: Math.PI / 180,
                threshold: 80, minLineLength: 80, maxLineGap: 20);

            return RotateByMedianAngleWithAngle(binary, lines);
        }
        catch
        {
            return (binary.Clone(), 0f);
        }
    }

    private static (Mat Image, float DeskewDegrees) TryDeskewGrayWithAngle(Mat gray)
    {
        try
        {
            using var blurred = new Mat();
            Cv2.GaussianBlur(gray, blurred, new Size(3, 3), 0);

            using var edges = new Mat();
            Cv2.Canny(blurred, edges, 40, 120);

            var lines = Cv2.HoughLinesP(edges, rho: 1, theta: Math.PI / 180,
                threshold: 60, minLineLength: 60, maxLineGap: 25);

            return RotateByMedianAngleWithAngle(gray, lines);
        }
        catch
        {
            return (gray.Clone(), 0f);
        }
    }

    private static (Mat Image, float DeskewDegrees) RotateByMedianAngleWithAngle(
        Mat src, LineSegmentPoint[]? lines)
    {
        if (lines == null || lines.Length < 5)
            return (src.Clone(), 0f);

        var angles = lines
            .Select(l => Math.Atan2(l.P2.Y - l.P1.Y, l.P2.X - l.P1.X) * 180.0 / Math.PI)
            .Where(a => Math.Abs(a) < 45)
            .ToList();

        if (angles.Count < 3)
            return (src.Clone(), 0f);

        angles.Sort();
        double medianAngle = angles[angles.Count / 2];

        if (Math.Abs(medianAngle) < 0.5)
            return (src.Clone(), 0f);

        var center = new Point2f(src.Width / 2f, src.Height / 2f);
        using var rotMatrix = Cv2.GetRotationMatrix2D(center, medianAngle, 1.0);
        var rotated = new Mat();
        var fill = src.Channels() == 1 ? new Scalar(255) : new Scalar(255, 255, 255);
        Cv2.WarpAffine(src, rotated, rotMatrix, src.Size(),
            InterpolationFlags.Cubic, BorderTypes.Replicate, fill);
        return (rotated, (float)medianAngle);
    }
}
