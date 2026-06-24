namespace DeskSearch.Services;

internal static class IndexResyncPolicy
{
    public const int Disabled = 0;
    public const int DefaultPeriodicResyncHours = 8;

    public static readonly int[] AllowedHours = [0, 1, 4, 8, 12, 24, 168];

    public static int Normalize(int hours)
    {
        if (hours <= Disabled)
            return Disabled;

        foreach (var allowed in AllowedHours)
        {
            if (allowed == Disabled)
                continue;

            if (hours == allowed)
                return allowed;
        }

        var best = DefaultPeriodicResyncHours;
        foreach (var allowed in AllowedHours)
        {
            if (allowed == Disabled)
                continue;

            if (allowed <= hours)
                best = allowed;
        }

        return best;
    }
}
