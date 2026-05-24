using System;

namespace MidiSheetMusic;

public partial class SheetMusic
{
    public static void SetPageWidth(int width) =>
        PageWidth = Math.Max(400, width);
}
