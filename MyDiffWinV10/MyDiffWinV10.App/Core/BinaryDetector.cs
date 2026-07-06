namespace MyDiffWinV10.App.Core;

/// <summary>
/// Heuristic detection of binary content in a byte buffer.
/// </summary>
internal static class BinaryDetector
{
    private const int SampleSize = 8192;

    public static bool IsBinary(ReadOnlySpan<byte> data)
    {
        if (data.IsEmpty)
        {
            return false;
        }

        int length = Math.Min(data.Length, SampleSize);
        ReadOnlySpan<byte> sample = data.Slice(0, length);

        if (length >= 2)
        {
            if (sample[0] == 0xFF && sample[1] == 0xFE)
            {
                return !LooksLikeUtf16Text(sample.Slice(2), littleEndian: true);
            }

            if (sample[0] == 0xFE && sample[1] == 0xFF)
            {
                return !LooksLikeUtf16Text(sample.Slice(2), littleEndian: false);
            }
        }

        ReadOnlySpan<byte> utf8 = sample;
        if (length >= 3 && sample[0] == 0xEF && sample[1] == 0xBB && sample[2] == 0xBF)
        {
            utf8 = sample.Slice(3);
        }

        if (IsValidUtf8(utf8))
        {
            return false;
        }

        int nonText = 0;
        for (int i = 0; i < length; i++)
        {
            byte b = sample[i];
            if (b == 0)
            {
                return true;
            }

            if (!IsAsciiTextByte(b))
            {
                nonText++;
            }
        }

        return nonText * 10 > length * 3;
    }

    private static bool IsValidUtf8(ReadOnlySpan<byte> data)
    {
        int i = 0;
        while (i < data.Length)
        {
            byte b = data[i];
            if (b <= 0x7F)
            {
                i++;
                continue;
            }

            int trailing;
            if (b < 0xC2)
            {
                return false;
            }

            if (b < 0xE0)
            {
                trailing = 1;
            }
            else if (b < 0xF0)
            {
                trailing = 2;
            }
            else if (b < 0xF5)
            {
                trailing = 3;
            }
            else
            {
                return false;
            }

            if (i + trailing >= data.Length)
            {
                return true;
            }

            for (int j = 1; j <= trailing; j++)
            {
                if ((data[i + j] & 0xC0) != 0x80)
                {
                    return false;
                }
            }

            i += trailing + 1;
        }

        return true;
    }

    private static bool LooksLikeUtf16Text(ReadOnlySpan<byte> data, bool littleEndian)
    {
        if (data.Length < 2)
        {
            return data.IsEmpty;
        }

        int codeUnitCount = data.Length / 2;
        int nonText = 0;

        for (int i = 0; i < codeUnitCount; i++)
        {
            int offset = i * 2;
            char ch = littleEndian
                ? (char)(data[offset] | (data[offset + 1] << 8))
                : (char)((data[offset] << 8) | data[offset + 1]);

            if (ch == '\0')
            {
                return false;
            }

            if (!IsPrintableChar(ch))
            {
                nonText++;
            }
        }

        return nonText * 10 <= codeUnitCount * 3;
    }

    private static bool IsAsciiTextByte(byte b) =>
        b is 9 or 10 or 13 or (>= 32 and <= 126);

    private static bool IsPrintableChar(char ch) =>
        ch is '\t' or '\n' or '\r' or (>= ' ' and <= '~');
}
