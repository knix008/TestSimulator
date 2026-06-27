namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// Paints a row background on a <see cref="RichTextBox"/> line selection.
/// </summary>
internal static class RichTextRowBackground
{
    public static void Apply(RichTextBox box, int start, int length, Color color)
    {
        if (length <= 0)
        {
            return;
        }

        int savedStart = box.SelectionStart;
        int savedLength = box.SelectionLength;

        try
        {
            box.Select(start, length);
            box.SelectionBackColor = color;
        }
        finally
        {
            box.Select(savedStart, savedLength);
        }
    }
}
