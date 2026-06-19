namespace MyGitWinV10.App.Controls;

public readonly record struct SectionTitleTheme(Color Background, Color Foreground, Color Accent, Color Border)
{
    public static SectionTitleTheme For(SectionTitleKind kind) => kind switch
    {
        SectionTitleKind.Repository => new(
            Color.FromArgb(238, 242, 255),
            Color.FromArgb(55, 48, 163),
            Color.FromArgb(79, 70, 229),
            Color.FromArgb(165, 180, 252)),
        SectionTitleKind.CommitHistory => new(
            Color.FromArgb(245, 243, 255),
            Color.FromArgb(91, 33, 182),
            Color.FromArgb(124, 58, 237),
            Color.FromArgb(196, 181, 253)),
        SectionTitleKind.CommitDetails => new(
            Color.FromArgb(236, 254, 255),
            Color.FromArgb(21, 94, 117),
            Color.FromArgb(8, 145, 178),
            Color.FromArgb(103, 232, 249)),
        SectionTitleKind.ChangedFiles => new(
            Color.FromArgb(255, 247, 237),
            Color.FromArgb(154, 52, 18),
            Color.FromArgb(234, 88, 12),
            Color.FromArgb(253, 186, 116)),
        SectionTitleKind.Diff => new(
            Color.FromArgb(240, 253, 244),
            Color.FromArgb(22, 101, 52),
            Color.FromArgb(22, 163, 74),
            Color.FromArgb(134, 239, 172)),
        _ => new(
            Color.FromArgb(248, 250, 252),
            Color.FromArgb(51, 65, 85),
            Color.FromArgb(100, 116, 139),
            Color.FromArgb(226, 232, 240))
    };
}
