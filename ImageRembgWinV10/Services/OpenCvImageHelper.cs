using ImageRembgWinV10.Localization;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace ImageRembgWinV10.Services;

public static class OpenCvImageHelper
{
    public static Mat BitmapToBgr8(Bitmap bitmap)
    {
        using var mat = BitmapConverter.ToMat(bitmap);
        return EnsureBgr8(mat);
    }

    public static Mat BitmapToBgra8(Bitmap bitmap)
    {
        using var mat = BitmapConverter.ToMat(bitmap);
        return EnsureBgra8(mat);
    }

    public static Mat EnsureBgr8(Mat image)
    {
        return image.Channels() switch
        {
            3 => image.Clone(),
            4 => ConvertColor(image, ColorConversionCodes.BGRA2BGR),
            1 => ConvertColor(image, ColorConversionCodes.GRAY2BGR),
            _ => throw CreateUnsupportedChannelException(image)
        };
    }

    public static Mat EnsureBgra8(Mat image)
    {
        return image.Channels() switch
        {
            4 => image.Clone(),
            3 => ConvertColor(image, ColorConversionCodes.BGR2BGRA),
            1 => ConvertColor(image, ColorConversionCodes.GRAY2BGRA),
            _ => throw CreateUnsupportedChannelException(image)
        };
    }

    private static Mat ConvertColor(Mat source, ColorConversionCodes code)
    {
        var converted = new Mat();
        Cv2.CvtColor(source, converted, code);
        return converted;
    }

    private static NotSupportedException CreateUnsupportedChannelException(Mat image)
    {
        return new NotSupportedException(
            L.F("Exception.UnsupportedImageFormat", image.Channels(), image.Type()));
    }
}
