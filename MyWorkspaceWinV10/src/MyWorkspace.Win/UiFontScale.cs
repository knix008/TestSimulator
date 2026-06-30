namespace MyWorkspace.Win;

internal static class UiFontScale
{
    public const int MinStep = -2;
    public const int MaxStep = 2;

    public static int Normalize(int step) => Math.Clamp(step, MinStep, MaxStep);

    public static float GetFactor(int step) => Normalize(step) switch
    {
        -2 => 0.85f,
        -1 => 0.92f,
        0 => 1.0f,
        1 => 1.08f,
        2 => 1.16f,
        _ => 1.0f
    };

    public static string GetLocalizationKey(int step) => Normalize(step) switch
    {
        -2 => K.FontScaleMuchSmaller,
        -1 => K.FontScaleSmaller,
        0 => K.FontScaleNormal,
        1 => K.FontScaleLarger,
        2 => K.FontScaleMuchLarger,
        _ => K.FontScaleNormal
    };
}
