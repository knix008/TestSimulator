namespace MidiSheetMusic;

public partial class Staff
{
    /// <summary>Returns the X pixel (staff-local) for the given pulse time.</summary>
    public int GetXAtPulse(int pulseTime)
    {
        int xpos = keysigWidth;

        for (int i = 0; i < symbols.Count; i++)
        {
            MusicSymbol curr = symbols[i];
            if (curr is BarSymbol)
            {
                xpos += curr.Width;
                continue;
            }

            int start = curr.StartTime;
            int end;
            if (i + 2 < symbols.Count && symbols[i + 1] is BarSymbol)
                end = symbols[i + 2].StartTime;
            else if (i + 1 < symbols.Count)
                end = symbols[i + 1].StartTime;
            else
                end = endtime;

            if (start > pulseTime)
                return xpos;

            if (start <= pulseTime && pulseTime < end)
                return xpos;

            xpos += curr.Width;
        }

        return xpos;
    }
}
