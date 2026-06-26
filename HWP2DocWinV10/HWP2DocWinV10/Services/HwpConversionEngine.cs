namespace HWP2DocWinV10.Services;

internal enum HwpConversionEngine
{
    Unhwp,
    Rhwp,
    Hwp2MdRoboco,
    Hwp2MdHephaex,
}

internal static class HwpConversionEngineCatalog
{
    internal sealed record Entry(
        HwpConversionEngine Engine,
        string Label,
        string ShortName,
        string Description,
        Func<bool> IsAvailable,
        string MissingToolHint);

    private static readonly Entry[] AllEntries =
    [
        new(
            HwpConversionEngine.Unhwp,
            "unhwp (내장, 기본)",
            "unhwp",
            "NuGet 내장 엔진. 별도 설치 없이 항상 사용 가능합니다.",
            static () => true,
            string.Empty),
        new(
            HwpConversionEngine.Rhwp,
            "rhwp",
            "rhwp",
            "표·그림·본문 변환. unhwp로 제목 구조·자산을 보조합니다.",
            RhwpLocator.IsAvailable,
            @"Tools\rhwp\rhwp.exe"),
        new(
            HwpConversionEngine.Hwp2MdRoboco,
            "hwp2md (roboco-io)",
            "hwp2md-roboco",
            "MIT 라이선스 CLI. 복잡한 표·레이아웃 문서 비교용.",
            Hwp2MdRobocoLocator.IsAvailable,
            @"Tools\hwp2md-roboco\hwp2md.exe"),
        new(
            HwpConversionEngine.Hwp2MdHephaex,
            "hwp2md (hephaex)",
            "hwp2md-hephaex",
            "GPL-3.0 CLI. colspan·CommonMark 표 변환 비교용.",
            Hwp2MdHephaexLocator.IsAvailable,
            @"Tools\hwp2md-hephaex\hwp2md.exe"),
    ];

    public static IReadOnlyList<Entry> Entries => AllEntries;

    public static Entry Get(HwpConversionEngine engine) =>
        AllEntries.First(entry => entry.Engine == engine);

    public static string FormatLabel(HwpConversionEngine engine) => Get(engine).Label;

    public static HwpConversionEngine ResolveDefault(HwpConversionEngine preferred)
    {
        if (preferred == HwpConversionEngine.Unhwp)
            return HwpConversionEngine.Unhwp;

        if (Get(preferred).IsAvailable())
            return preferred;

        return HwpConversionEngine.Unhwp;
    }
}

internal static class Hwp2MdRobocoLocator
{
    private static readonly ExternalToolLocator Tool = new(@"hwp2md-roboco\hwp2md.exe");

    public static void Refresh() => Tool.Refresh();

    public static bool IsAvailable() => Tool.IsAvailable();

    public static string GetExecutablePath() => Tool.GetExecutablePath();
}

internal static class Hwp2MdHephaexLocator
{
    private static readonly ExternalToolLocator Tool = new(@"hwp2md-hephaex\hwp2md.exe");

    public static void Refresh() => Tool.Refresh();

    public static bool IsAvailable() => Tool.IsAvailable();

    public static string GetExecutablePath() => Tool.GetExecutablePath();
}
