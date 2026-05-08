using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Viewer3DWinForms;

/// <summary>
/// WPF/WIC가 지원하는 포맷만 디코딩합니다. KTX2·DDS 등은 조용히 건너뜁니다.
/// </summary>
internal static class WpfTextureDecoder
{
    /// <summary>KTX1/2 식별자(«KTX …»).</summary>
    private static bool IsKtx(ReadOnlySpan<byte> b) =>
        b.Length >= 12
        && b[0] == 0xAB
        && b[1] == (byte)'K'
        && b[2] == (byte)'T'
        && b[3] == (byte)'X';

    private static bool IsDds(ReadOnlySpan<byte> b) =>
        b.Length >= 4
        && b[0] == (byte)'D'
        && b[1] == (byte)'D'
        && b[2] == (byte)'S'
        && b[3] == (byte)' ';

    private static bool IsPng(ReadOnlySpan<byte> b) =>
        b.Length >= 8
        && b[0] == 0x89
        && b[1] == 0x50
        && b[2] == 0x4E
        && b[3] == 0x47;

    private static bool IsJpeg(ReadOnlySpan<byte> b) =>
        b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF;

    private static bool IsGif(ReadOnlySpan<byte> b) =>
        b.Length >= 6
        && b[0] == (byte)'G'
        && b[1] == (byte)'I'
        && b[2] == (byte)'F'
        && b[3] == (byte)'8'
        && (b[4] == (byte)'7' || b[4] == (byte)'9')
        && b[5] == (byte)'a';

    private static bool IsBmp(ReadOnlySpan<byte> b) =>
        b.Length >= 2 && b[0] == (byte)'B' && b[1] == (byte)'M';

    private static bool IsTiff(ReadOnlySpan<byte> b) =>
        (b.Length >= 4 && b[0] == 0x49 && b[1] == 0x49 && b[2] == 0x2A && b[3] == 0x00)
        || (b.Length >= 4 && b[0] == 0x4D && b[1] == 0x4D && b[2] == 0x00 && b[3] == 0x2A);

    private static bool IsLikelyUnsupportedContainer(ReadOnlySpan<byte> b) =>
        IsKtx(b) || IsDds(b);

    private static BitmapSource? DecodeWith(BitmapDecoder decoder)
    {
        if (decoder.Frames.Count == 0)
        {
            return null;
        }

        var frame = decoder.Frames[0];
        frame.Freeze();
        return frame;
    }

    private static BitmapSource? TryDecodeWithDecoder(byte[] bytes, Func<Stream, BitmapDecoder> createDecoder)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            return DecodeWith(createDecoder(stream));
        }
        catch
        {
            return null;
        }
    }

    public static BitmapSource? TryDecodeBitmapSource(byte[] bytes)
    {
        if (bytes.Length < 8)
        {
            return null;
        }

        var span = bytes.AsSpan();
        if (IsLikelyUnsupportedContainer(span))
        {
            return null;
        }

        BitmapSource? decoded = null;

        if (IsPng(span))
        {
            decoded = TryDecodeWithDecoder(bytes, s => new PngBitmapDecoder(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
            if (decoded is not null)
            {
                return decoded;
            }
        }

        if (IsJpeg(span))
        {
            decoded = TryDecodeWithDecoder(bytes, s => new JpegBitmapDecoder(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
            if (decoded is not null)
            {
                return decoded;
            }
        }

        if (IsGif(span))
        {
            decoded = TryDecodeWithDecoder(bytes, s => new GifBitmapDecoder(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
            if (decoded is not null)
            {
                return decoded;
            }
        }

        if (IsBmp(span))
        {
            decoded = TryDecodeWithDecoder(bytes, s => new BmpBitmapDecoder(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
            if (decoded is not null)
            {
                return decoded;
            }
        }

        if (IsTiff(span))
        {
            decoded = TryDecodeWithDecoder(bytes, s => new TiffBitmapDecoder(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
            if (decoded is not null)
            {
                return decoded;
            }
        }

        decoded = TryDecodeWithDecoder(bytes, s => BitmapDecoder.Create(s, BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad));
        if (decoded is not null)
        {
            return decoded;
        }

        return TryDecodeViaBitmapImage(bytes);
    }

    private static BitmapSource? TryDecodeViaBitmapImage(byte[] bytes)
    {
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            var image = new BitmapImage();
            image.BeginInit();
            image.StreamSource = stream;
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch
        {
            return null;
        }
    }

    public static ImageBrush? TryCreateImageBrush(byte[] bytes, Action<ImageBrush>? configure = null)
    {
        var bmp = TryDecodeBitmapSource(bytes);
        if (bmp is null)
        {
            return null;
        }

        var brush = new ImageBrush(bmp)
        {
            Stretch = Stretch.Fill,
            TileMode = TileMode.Tile
        };
        configure?.Invoke(brush);
        TextureBrushQuality.ApplyToBrush(brush);
        brush.Freeze();
        return brush;
    }

    public static ImageBrush? TryCreateImageBrushFromFile(string imagePath)
    {
        try
        {
            var bytes = File.ReadAllBytes(imagePath);
            return TryCreateImageBrush(bytes);
        }
        catch
        {
            return null;
        }
    }
}
