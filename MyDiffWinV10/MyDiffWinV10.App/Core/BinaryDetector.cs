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
        int nonText = 0;

        for (int i = 0; i < length; i++)
        {
            byte b = data[i];
            if (b == 0)
            {
                return true;
            }

            if (!IsTextByte(b))
            {
                nonText++;
            }
        }

        return nonText * 10 > length * 3;
    }

    private static bool IsTextByte(byte b) =>
        b is 9 or 10 or 13 or (>= 32 and <= 126);
}
