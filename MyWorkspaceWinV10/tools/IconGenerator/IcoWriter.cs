using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace IconGenerator;

internal static class IcoWriter
{
    public static void Save(string path, params Bitmap[] images)
    {
        if (images.Length == 0)
            throw new ArgumentException("At least one image is required.", nameof(images));

        using var stream = File.Create(path);
        using var writer = new BinaryWriter(stream);

        writer.Write((short)0);
        writer.Write((short)1);
        writer.Write((short)images.Length);

        var offset = 6 + 16 * images.Length;
        var imageData = new List<byte[]>();

        foreach (var image in images)
        {
            var bytes = CreateBmpIconImage(image);
            imageData.Add(bytes);

            writer.Write((byte)(image.Width >= 256 ? 0 : image.Width));
            writer.Write((byte)(image.Height >= 256 ? 0 : image.Height));
            writer.Write((byte)0);
            writer.Write((byte)0);
            writer.Write((short)1);
            writer.Write((short)32);
            writer.Write(bytes.Length);
            writer.Write(offset);
            offset += bytes.Length;
        }

        foreach (var bytes in imageData)
            writer.Write(bytes);
    }

    private static byte[] CreateBmpIconImage(Bitmap source)
    {
        var width = source.Width;
        var height = source.Height;

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Transparent);
            graphics.DrawImage(source, 0, 0, width, height);
        }

        var andRowBytes = ((width + 31) / 32) * 4;
        var xorSize = width * height * 4;
        var andSize = andRowBytes * height;
        var totalSize = 40 + xorSize + andSize;
        var buffer = new byte[totalSize];
        using var stream = new MemoryStream(buffer);
        using var writer = new BinaryWriter(stream);

        writer.Write(40);
        writer.Write(width);
        writer.Write(height * 2);
        writer.Write((short)1);
        writer.Write((short)32);
        writer.Write(0);
        writer.Write(xorSize);
        writer.Write(0);
        writer.Write(0);
        writer.Write(0);
        writer.Write(0);

        var rect = new Rectangle(0, 0, width, height);
        var bits = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            var stride = bits.Stride;
            var rowBytes = width * 4;
            for (var y = height - 1; y >= 0; y--)
            {
                var srcOffset = y * stride;
                for (var x = 0; x < width; x++)
                {
                    var pixelOffset = srcOffset + x * 4;
                    writer.Write(Marshal.ReadByte(bits.Scan0, pixelOffset + 0));
                    writer.Write(Marshal.ReadByte(bits.Scan0, pixelOffset + 1));
                    writer.Write(Marshal.ReadByte(bits.Scan0, pixelOffset + 2));
                    writer.Write(Marshal.ReadByte(bits.Scan0, pixelOffset + 3));
                }
            }
        }
        finally
        {
            bitmap.UnlockBits(bits);
        }

        writer.Write(new byte[andSize]);
        return buffer;
    }
}
