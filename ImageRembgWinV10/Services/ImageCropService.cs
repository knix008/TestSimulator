using ImageRembgWinV10.Localization;
using DrawingRectangle = System.Drawing.Rectangle;
using OpenCvSharp;

namespace ImageRembgWinV10.Services;

public static class ImageCropService
{
    public static DrawingRectangle? GetCropBounds(Mat? selectionMask, DrawingRectangle imageBounds, int padding = 1)
    {
        var bounds = SegmentationMaskBuilder.GetMaskBounds(selectionMask);
        if (bounds == null)
        {
            return null;
        }

        return ExpandAndClamp(bounds.Value, padding, imageBounds);
    }

    public static Bitmap Crop(Bitmap source, DrawingRectangle bounds)
    {
        var imageBounds = new DrawingRectangle(0, 0, source.Width, source.Height);
        var crop = DrawingRectangle.Intersect(bounds, imageBounds);
        if (crop.Width <= 0 || crop.Height <= 0)
        {
            throw new InvalidOperationException(L.Get("Exception.CropOutOfBounds"));
        }

        var cropped = new Bitmap(crop.Width, crop.Height, source.PixelFormat);
        using var graphics = Graphics.FromImage(cropped);
        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        graphics.DrawImage(
            source,
            new DrawingRectangle(0, 0, crop.Width, crop.Height),
            crop,
            GraphicsUnit.Pixel);

        return cropped;
    }

    public static Bitmap CropToSelection(Bitmap source, Mat selectionMask, int padding = 1)
    {
        var imageBounds = new DrawingRectangle(0, 0, source.Width, source.Height);
        var cropBounds = GetCropBounds(selectionMask, imageBounds, padding)
            ?? throw new InvalidOperationException(L.Get("Exception.SelectionNotFound"));

        return Crop(source, cropBounds);
    }

    private static DrawingRectangle ExpandAndClamp(
        DrawingRectangle bounds,
        int padding,
        DrawingRectangle imageBounds)
    {
        var left = Math.Max(imageBounds.Left, bounds.Left - padding);
        var top = Math.Max(imageBounds.Top, bounds.Top - padding);
        var right = Math.Min(imageBounds.Right, bounds.Right + padding);
        var bottom = Math.Min(imageBounds.Bottom, bounds.Bottom + padding);
        return DrawingRectangle.FromLTRB(left, top, right, bottom);
    }
}
