using System.IO.Compression;

namespace VNCServer.VNCServer;

/// <summary>
/// 화면 데이터 압축 및 인코딩을 담당하는 클래스
/// </summary>
public static class ImageCompressor
{
    /// <summary>
    /// Zlib 압축을 사용하여 바이트 배열 압축
    /// </summary>
    public static byte[] CompressZlib(byte[] data, int compressionLevel)
    {
        if (compressionLevel == 0)
        {
            return data; // 압축 없음
        }

        using (var output = new MemoryStream())
        {
            var level = compressionLevel switch
            {
                1 => CompressionLevel.Fastest,
                >= 2 and <= 5 => CompressionLevel.Optimal,
                _ => CompressionLevel.SmallestSize
            };

            using (var deflate = new DeflateStream(output, level, true))
            {
                deflate.Write(data, 0, data.Length);
            }

            return output.ToArray();
        }
    }

    /// <summary>
    /// Zlib 압축 해제
    /// </summary>
    public static byte[] DecompressZlib(byte[] data)
    {
        using (var input = new MemoryStream(data))
        using (var output = new MemoryStream())
        using (var deflate = new DeflateStream(input, CompressionMode.Decompress))
        {
            deflate.CopyTo(output);
            return output.ToArray();
        }
    }

    /// <summary>
    /// 이미지를 JPEG로 인코딩하여 품질 조절
    /// </summary>
    public static byte[] EncodeJpeg(System.Drawing.Bitmap bitmap, int quality)
    {
        using (var stream = new MemoryStream())
        {
            var encoderParams = new System.Drawing.Imaging.EncoderParameters(1);
            encoderParams.Param[0] = new System.Drawing.Imaging.EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, (long)quality);

            var jpegEncoder = GetEncoder(System.Drawing.Imaging.ImageFormat.Jpeg);
            if (jpegEncoder != null)
            {
                bitmap.Save(stream, jpegEncoder, encoderParams);
            }
            else
            {
                bitmap.Save(stream, System.Drawing.Imaging.ImageFormat.Jpeg);
            }

            return stream.ToArray();
        }
    }

    private static System.Drawing.Imaging.ImageCodecInfo? GetEncoder(System.Drawing.Imaging.ImageFormat format)
    {
        var codecs = System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders();
        foreach (var codec in codecs)
        {
            if (codec.FormatID == format.Guid)
            {
                return codec;
            }
        }
        return null;
    }

    /// <summary>
    /// 픽셀 데이터를 효율적으로 인코딩 (RLE - Run Length Encoding)
    /// </summary>
    public static byte[] EncodeRLE(byte[] pixels)
    {
        var output = new List<byte>();
        int i = 0;

        while (i < pixels.Length)
        {
            byte current = pixels[i];
            int count = 1;

            // 같은 값이 연속되는 횟수 계산
            while (i + count < pixels.Length && pixels[i + count] == current && count < 255)
            {
                count++;
            }

            // 카운트와 값 저장
            output.Add((byte)count);
            output.Add(current);

            i += count;
        }

        return output.ToArray();
    }
}
