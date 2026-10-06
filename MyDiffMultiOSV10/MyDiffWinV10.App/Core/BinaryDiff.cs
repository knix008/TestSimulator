namespace MyDiffWinV10.App.Core;

public sealed class BinaryDiffLine
{
    public required string Text { get; init; }

    /// <summary>One bit per byte (0–15) indicating a differing byte on this row.</summary>
    public ushort DiffMask { get; init; }
}

/// <summary>
/// Lazy binary diff view: row kinds and stats are computed up front; hex lines are formatted on demand.
/// </summary>
public sealed class BinaryDiffDocument
{
    private const int MaxCachedRows = 256;

    private readonly byte[] _left;
    private readonly byte[] _right;
    private readonly DiffLineKind[] _rowKinds;
    private readonly Dictionary<int, (BinaryDiffLine Left, BinaryDiffLine Right)> _rowCache = new(MaxCachedRows);
    private readonly Queue<int> _cacheOrder = new(MaxCachedRows);

    private BinaryDiffDocument(
        byte[] left,
        byte[] right,
        DiffLineKind[] rowKinds,
        int differentByteCount,
        int modifiedRowCount,
        int addedRowCount,
        int removedRowCount)
    {
        _left = left;
        _right = right;
        _rowKinds = rowKinds;
        DifferentByteCount = differentByteCount;
        ModifiedRowCount = modifiedRowCount;
        AddedRowCount = addedRowCount;
        RemovedRowCount = removedRowCount;
        LeftLength = left.Length;
        RightLength = right.Length;
    }

    public int LineCount => _rowKinds.Length;

    public IReadOnlyList<DiffLineKind> RowKinds => _rowKinds;

    public int DifferentByteCount { get; }

    public int ModifiedRowCount { get; }

    public int AddedRowCount { get; }

    public int RemovedRowCount { get; }

    public long LeftLength { get; }

    public long RightLength { get; }

    public bool HasDifferences => DifferentByteCount > 0;

    public BinaryDiffLine GetLeftLine(int lineIndex) => GetRow(lineIndex).Left;

    public BinaryDiffLine GetRightLine(int lineIndex) => GetRow(lineIndex).Right;

    public static BinaryDiffDocument FromBytes(byte[] left, byte[] right)
    {
        int lineCount = Math.Max(left.Length, right.Length);
        lineCount = lineCount == 0 ? 1 : (lineCount + BinaryDiff.BytesPerLine - 1) / BinaryDiff.BytesPerLine;

        var rowKinds = new DiffLineKind[lineCount];
        int diffBytes = 0;
        int modified = 0, added = 0, removed = 0;

        for (int line = 0; line < lineCount; line++)
        {
            long offset = (long)line * BinaryDiff.BytesPerLine;
            BinaryDiff.ComputeRowMetadata(left, right, offset, out ushort diffMask, out DiffLineKind kind);
            rowKinds[line] = kind;
            diffBytes += BinaryDiff.PopCount(diffMask);

            switch (kind)
            {
                case DiffLineKind.Modified: modified++; break;
                case DiffLineKind.Added: added++; break;
                case DiffLineKind.Removed: removed++; break;
            }
        }

        return new BinaryDiffDocument(left, right, rowKinds, diffBytes, modified, added, removed);
    }

    private (BinaryDiffLine Left, BinaryDiffLine Right) GetRow(int lineIndex)
    {
        if (_rowCache.TryGetValue(lineIndex, out var cached))
        {
            return cached;
        }

        long offset = (long)lineIndex * BinaryDiff.BytesPerLine;
        Span<char> leftChars = stackalloc char[BinaryHexLayout.LineLength];
        Span<char> rightChars = stackalloc char[BinaryHexLayout.LineLength];
        BinaryDiff.FormatRow(_left, _right, offset, leftChars, rightChars, out ushort diffMask, out _);

        cached = (
            new BinaryDiffLine { Text = leftChars.ToString(), DiffMask = diffMask },
            new BinaryDiffLine { Text = rightChars.ToString(), DiffMask = diffMask });

        if (_rowCache.Count >= MaxCachedRows)
        {
            int oldest = _cacheOrder.Dequeue();
            _rowCache.Remove(oldest);
        }

        _rowCache[lineIndex] = cached;
        _cacheOrder.Enqueue(lineIndex);
        return cached;
    }
}

/// <summary>
/// Side-by-side hex dump diff aligned by byte offset.
/// </summary>
public static class BinaryDiff
{
    public const int BytesPerLine = 16;

    private static readonly string[] HexLookup = CreateHexLookup();

    internal static void ComputeRowMetadata(
        byte[] left,
        byte[] right,
        long offset,
        out ushort diffMask,
        out DiffLineKind kind)
    {
        diffMask = 0;
        bool anyLeft = false;
        bool anyRight = false;

        for (int i = 0; i < BytesPerLine; i++)
        {
            long idx = offset + i;
            bool hasLeft = idx < left.Length;
            bool hasRight = idx < right.Length;
            if (hasLeft)
            {
                anyLeft = true;
            }

            if (hasRight)
            {
                anyRight = true;
            }

            if (IsDifferent(left, right, idx))
            {
                diffMask |= (ushort)(1 << i);
            }
        }

        kind = ClassifyRow(diffMask, anyLeft, anyRight);
    }

    internal static void FormatRow(
        byte[] left,
        byte[] right,
        long offset,
        Span<char> leftChars,
        Span<char> rightChars,
        out ushort diffMask,
        out DiffLineKind kind)
    {
        leftChars.Clear();
        rightChars.Clear();
        leftChars.Fill(' ');
        rightChars.Fill(' ');

        WriteOffset(leftChars, offset);
        WriteOffset(rightChars, offset);

        diffMask = 0;
        bool anyLeft = false;
        bool anyRight = false;

        for (int i = 0; i < BytesPerLine; i++)
        {
            long idx = offset + i;
            bool hasLeft = idx < left.Length;
            bool hasRight = idx < right.Length;
            if (hasLeft)
            {
                anyLeft = true;
            }

            if (hasRight)
            {
                anyRight = true;
            }

            if (IsDifferent(left, right, idx))
            {
                diffMask |= (ushort)(1 << i);
            }

            WriteHexByte(leftChars, i, hasLeft ? left[idx] : null);
            WriteHexByte(rightChars, i, hasRight ? right[idx] : null);
            WriteAscii(leftChars, i, hasLeft ? left[idx] : null);
            WriteAscii(rightChars, i, hasRight ? right[idx] : null);
        }

        kind = ClassifyRow(diffMask, anyLeft, anyRight);
    }

    internal static int PopCount(ushort value)
    {
        int count = 0;
        while (value != 0)
        {
            count += value & 1;
            value >>= 1;
        }

        return count;
    }

    private static DiffLineKind ClassifyRow(ushort diffMask, bool anyLeft, bool anyRight)
    {
        if (diffMask == 0)
        {
            return DiffLineKind.Same;
        }

        if (anyLeft && !anyRight)
        {
            return DiffLineKind.Removed;
        }

        if (anyRight && !anyLeft)
        {
            return DiffLineKind.Added;
        }

        return DiffLineKind.Modified;
    }

    private static void WriteOffset(Span<char> chars, long offset)
    {
        string text = offset.ToString("X8");
        for (int i = 0; i < 8; i++)
        {
            chars[i] = text[i];
        }
    }

    private static void WriteHexByte(Span<char> chars, int byteIndex, byte? value)
    {
        int start = BinaryHexLayout.HexStart(byteIndex);
        if (value.HasValue)
        {
            string hex = HexLookup[value.Value];
            chars[start] = hex[0];
            chars[start + 1] = hex[1];
        }
        else
        {
            chars[start] = '.';
            chars[start + 1] = '.';
        }

        chars[start + 2] = ' ';
    }

    private static void WriteAscii(Span<char> chars, int byteIndex, byte? value)
    {
        chars[BinaryHexLayout.AsciiIndex(byteIndex)] = value.HasValue ? ToAscii(value.Value) : '.';
    }

    private static bool IsDifferent(byte[] left, byte[] right, long index)
    {
        bool hasLeft = index < left.Length;
        bool hasRight = index < right.Length;
        if (hasLeft != hasRight)
        {
            return hasLeft || hasRight;
        }

        return hasLeft && left[index] != right[index];
    }

    private static char ToAscii(byte value) =>
        value is >= 32 and <= 126 ? (char)value : '.';

    private static string[] CreateHexLookup()
    {
        var lookup = new string[256];
        for (int i = 0; i < 256; i++)
        {
            lookup[i] = i.ToString("X2");
        }

        return lookup;
    }
}
