namespace HWP2DocWinV10.Export;

/// <summary>
/// HWP 변환 직후·LLM 정리 전후에 적용하는 규칙 기반 Markdown 정리 파이프라인입니다.
/// </summary>
internal static class MarkdownConversionPostProcessor
{
    public static string Apply(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        text = MarkdownJunkCharacterSanitizer.Sanitize(text);
        text = MarkdownLineBreakRestorer.Restore(text);
        text = MarkdownHtmlTableConverter.Convert(text);
        text = MarkdownPipeTableNormalizer.Normalize(text);
        text = MarkdownHeadingNormalizer.Normalize(text);
        text = MarkdownPreviewNormalizer.NormalizeLayout(text);
        return text.Trim();
    }
}
