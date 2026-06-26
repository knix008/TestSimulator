namespace HWP2DocWinV10.Services;

[Flags]
internal enum LlmProcessingTargets
{
    None = 0,
    Tables = 1 << 0,
    Headings = 1 << 1,
    Lists = 1 << 2,
    HtmlMarkup = 1 << 3,
}

internal static class LlmProcessingTargetCatalog
{
    internal sealed record Entry(LlmProcessingTargets Flag, string Label, string Description);

    public static IReadOnlyList<Entry> Entries { get; } =
    [
        new(LlmProcessingTargets.Tables,
            "표",
            "깨진 | 줄·열 불일치를 GFM 파이프 표(| --- |)로 생성·복구"),
        new(LlmProcessingTargets.Headings,
            "제목",
            "제목 계층(#) 정리, 제목처럼 보이는 줄에 # 부여"),
        new(LlmProcessingTargets.Lists,
            "목록",
            "글머리 기호(•)·번호 목록을 Markdown 목록으로 정리"),
        new(LlmProcessingTargets.HtmlMarkup,
            "HTML",
            "남아 있는 <table>, <h1> 등 HTML을 Markdown으로 변환"),
    ];

    public static LlmProcessingTargets Default => LlmProcessingTargets.Tables;

    public static string FormatSummary(LlmProcessingTargets targets)
    {
        if (targets == LlmProcessingTargets.None)
            return "처리 대상 없음";

        var labels = new List<string>();
        foreach (Entry entry in Entries)
        {
            if (targets.HasFlag(entry.Flag))
                labels.Add(entry.Label);
        }

        return labels.Count == 0 ? "처리 대상 없음" : string.Join(", ", labels);
    }
}
