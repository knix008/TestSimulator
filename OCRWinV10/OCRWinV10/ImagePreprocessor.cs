using OpenCvSharp;
using OpenCvSharp.Extensions;
using Size = OpenCvSharp.Size;

namespace OCRWinV10;

public class ImagePreprocessor
{
    private const int MinDimension = 500;
    private const int MaxDimension = 4000;

    public System.Drawing.Bitmap Process(System.Drawing.Bitmap input, PreprocessMode mode)
    {
        if (mode == PreprocessMode.None)
            return new System.Drawing.Bitmap(input);

        using var mat = BitmapConverter.ToMat(input);
        using var result = ProcessMat(mat, mode);
        return BitmapConverter.ToBitmap(result);
    }

    private Mat ProcessMat(Mat src, PreprocessMode mode)
    {
        // 1. Grayscale
        var gray = new Mat();
        if (src.Channels() == 4)
            Cv2.CvtColor(src, gray, ColorConversionCodes.BGRA2GRAY);
        else if (src.Channels() == 3)
            Cv2.CvtColor(src, gray, ColorConversionCodes.BGR2GRAY);
        else
            gray = src.Clone();

        // 2. Optimal size
        var scaled = EnsureOptimalSize(gray);
        gray.Dispose();

        // 3. Denoise
        var denoised = new Mat();
        int blurSize = mode == PreprocessMode.Handwriting ? 3 : 1;
        if (blurSize > 1)
            Cv2.GaussianBlur(scaled, denoised, new Size(blurSize, blurSize), 0);
        else
            denoised = scaled.Clone();
        scaled.Dispose();

        // 4. CLAHE contrast enhancement
        var clahe = Cv2.CreateCLAHE(clipLimit: 2.0, tileGridSize: new Size(8, 8));
        var enhanced = new Mat();
        clahe.Apply(denoised, enhanced);
        denoised.Dispose();

        // 5. Adaptive binarization
        var binary = new Mat();
        int blockSize = mode == PreprocessMode.Handwriting ? 25 : 15;
        int C = mode == PreprocessMode.Handwriting ? 8 : 3;
        Cv2.AdaptiveThreshold(enhanced, binary, 255,
            AdaptiveThresholdTypes.GaussianC,
            ThresholdTypes.Binary, blockSize, C);
        enhanced.Dispose();

        // 6. Deskew
        var deskewed = TryDeskew(binary);
        binary.Dispose();

        // 7. Handwriting: close gaps in strokes
        if (mode == PreprocessMode.Handwriting)
        {
            var kernel = Cv2.GetStructuringElement(MorphShapes.Rect, new Size(2, 2));
            Cv2.MorphologyEx(deskewed, deskewed, MorphTypes.Close, kernel);
        }

        // 8. Back to BGR
        var result = new Mat();
        Cv2.CvtColor(deskewed, result, ColorConversionCodes.GRAY2BGR);
        deskewed.Dispose();

        return result;
    }

    private static Mat EnsureOptimalSize(Mat mat)
    {
        int maxDim = Math.Max(mat.Width, mat.Height);
        int minDim = Math.Min(mat.Width, mat.Height);

        if (maxDim > MaxDimension)
        {
            double scale = (double)MaxDimension / maxDim;
            var result = new Mat();
            Cv2.Resize(mat, result, new Size(0, 0), scale, scale, InterpolationFlags.Area);
            return result;
        }

        if (minDim < MinDimension)
        {
            double scale = (double)MinDimension / minDim;
            var result = new Mat();
            Cv2.Resize(mat, result, new Size(0, 0), scale, scale, InterpolationFlags.Cubic);
            return result;
        }

        return mat.Clone();
    }

    private static Mat TryDeskew(Mat binary)
    {
        try
        {
            using var edges = new Mat();
            Cv2.Canny(binary, edges, 50, 150);

            var lines = Cv2.HoughLinesP(edges, rho: 1, theta: Math.PI / 180,
                threshold: 80, minLineLength: 80, maxLineGap: 20);

            if (lines == null || lines.Length < 5)
                return binary.Clone();

            var angles = lines
                .Select(l => Math.Atan2(l.P2.Y - l.P1.Y, l.P2.X - l.P1.X) * 180.0 / Math.PI)
                .Where(a => Math.Abs(a) < 45)
                .ToList();

            if (angles.Count < 3)
                return binary.Clone();

            angles.Sort();
            double medianAngle = angles[angles.Count / 2];

            if (Math.Abs(medianAngle) < 0.5)
                return binary.Clone();

            var center = new Point2f(binary.Width / 2f, binary.Height / 2f);
            using var rotMatrix = Cv2.GetRotationMatrix2D(center, medianAngle, 1.0);
            var rotated = new Mat();
            Cv2.WarpAffine(binary, rotated, rotMatrix, binary.Size(),
                InterpolationFlags.Cubic, BorderTypes.Replicate, new Scalar(255));
            return rotated;
        }
        catch
        {
            return binary.Clone();
        }
    }
}
