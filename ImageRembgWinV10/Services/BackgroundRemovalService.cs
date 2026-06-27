using ImageRembgWinV10.Localization;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace ImageRembgWinV10.Services;

public static class BackgroundRemovalService
{
    public static Bitmap RemoveBackground(Bitmap source, Mat foregroundMask, Mat? cropToSelectionMask = null, bool softenEdges = true)
    {
        if (source.Width != foregroundMask.Width || source.Height != foregroundMask.Height)
        {
            throw new InvalidOperationException(L.Get("Exception.ImageMaskMismatch"));
        }

        using var sourceBgra = OpenCvImageHelper.BitmapToBgra8(source);

        using var alpha = softenEdges ? SoftenMask(foregroundMask) : foregroundMask.Clone();
        var channels = Cv2.Split(sourceBgra);
        Bitmap result;
        try
        {
            alpha.CopyTo(channels[3]);
            using var merged = new Mat();
            Cv2.Merge(channels, merged);
            result = BitmapConverter.ToBitmap(merged);
        }
        finally
        {
            foreach (var channel in channels)
            {
                channel.Dispose();
            }

            if (softenEdges)
            {
                alpha.Dispose();
            }
        }

        if (cropToSelectionMask == null)
        {
            return result;
        }

        try
        {
            return ImageCropService.CropToSelection(result, cropToSelectionMask);
        }
        finally
        {
            result.Dispose();
        }
    }

    private static Mat SoftenMask(Mat mask)
    {
        var softened = new Mat();
        Cv2.GaussianBlur(mask, softened, new OpenCvSharp.Size(5, 5), 0);
        return softened;
    }
}
